import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bookmark } from '../entities/bookmark.entity';
import { Business } from '../entities/business.entity';
import { CreateBookmarkDto } from './dto/bookmark.dto';
import { BusinessService } from '../business/business.service';

@Injectable()
export class BookmarkService {
  constructor(
    @InjectRepository(Bookmark) private bookmarks: Repository<Bookmark>,
    @InjectRepository(Business) private businesses: Repository<Business>,
    private businessService: BusinessService,
  ) {}

  // POST /bookmarks — FR-5.1: save/unsave a business or experience from
  // anywhere a card appears. Idempotent: saving twice just returns the
  // existing bookmark rather than erroring, since the client-side "Save"
  // toggle shouldn't need to track prior state itself. A business owner
  // may not save their own business — same trust-integrity rule as
  // reviews.
  async create(userId: string, dto: CreateBookmarkDto) {
    if (!dto.businessId && !dto.experienceId) {
      throw new BadRequestException('A businessId or experienceId is required.');
    }
    if (dto.businessId) {
      const business = await this.businesses.findOne({ where: { id: dto.businessId } });
      if (business?.ownerId === userId) {
        throw new ForbiddenException('You cannot save your own business.');
      }
    }
    const existing = await this.bookmarks.findOne({
      where: {
        userId,
        businessId: (dto.businessId ?? null) as any,
        experienceId: (dto.experienceId ?? null) as any,
      },
    });
    if (existing) {
      return existing;
    }
    const saved = await this.bookmarks.save(
      this.bookmarks.create({
        userId,
        businessId: dto.businessId,
        experienceId: dto.experienceId,
      }),
    );
    if (dto.businessId) {
      await this.businessService.recordSave(dto.businessId);
    }
    return saved;
  }

  // FR-3.3 / Saving is undo-able via a snackbar — this backs the "Undo".
  async remove(userId: string, id: string) {
    await this.bookmarks.delete({ id, userId });
    return { deleted: true };
  }

  // GET /bookmarks — FR-5.2: single flat Saved page, sorted by recently
  // saved. No Collections/grouping (deferred to Phase 2, FR-5.3).
  //
  // An experience bookmark for something that's already happened isn't
  // useful to keep around — the request was explicit that a past event
  // should disappear from the saved list once its date passes. Rather
  // than a scheduled sweep job, this cleans them up lazily, the same
  // pattern used elsewhere in this codebase for suspension/trial expiry:
  // whenever someone actually loads their Saved page, any now-expired
  // experience bookmarks of theirs get deleted and excluded from what's
  // returned, so the list is always correct without needing a cron job
  // just for this.
  async findForUser(userId: string) {
    const rows = await this.bookmarks.find({
      where: { userId },
      relations: ['business', 'experience'],
      order: { createdAt: 'DESC' },
    });

    const expiredIds = rows.filter((r) => r.experience?.isExpired).map((r) => r.id);
    if (expiredIds.length > 0) {
      await this.bookmarks.delete(expiredIds);
    }

    return rows.filter((r) => !r.experience?.isExpired);
  }
}
