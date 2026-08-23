import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModerationQueueItem } from '../tasks/entities/moderation-queue-item.entity';
import { Media, MediaStatus } from '../media/entities/media.entity';

@Injectable()
export class AdminModerationService {
  constructor(
    @InjectRepository(ModerationQueueItem) private queue: Repository<ModerationQueueItem>,
    @InjectRepository(Media) private media: Repository<Media>,
  ) {}

  // GET /admin/moderation-queue — the missing interface. The
  // spot-check/duplicate-flag pipeline (FR-8.3/8.4) has been writing to
  // this table the whole time with nothing to read it.
  async findPending() {
    const items = await this.queue.find({ where: { resolved: false }, order: { createdAt: 'ASC' } });
    const mediaIds = items.map((i) => i.mediaId);
    const mediaRows = mediaIds.length
      ? await this.media.find({ where: mediaIds.map((id) => ({ id })), relations: ['business'] })
      : [];
    const mediaById = new Map(mediaRows.map((m) => [m.id, m]));

    // A queue item can outlive the media it's about — the business (or
    // just the photo) can be deleted before anyone gets to the item,
    // and this table has no cascade back to Media. Rather than surface
    // a permanently-dead, unresolvable row to whoever's working the
    // queue, auto-resolve it here (there's genuinely nothing left to
    // moderate) and leave it out of what's returned.
    const orphaned = items.filter((item) => !mediaById.has(item.mediaId));
    if (orphaned.length > 0) {
      await this.queue.save(orphaned.map((item) => ({ ...item, resolved: true })));
    }

    return items
      .filter((item) => mediaById.has(item.mediaId))
      .map((item) => {
        const m = mediaById.get(item.mediaId)!;
        return {
          id: item.id,
          reason: item.reason,
          createdAt: item.createdAt,
          media: { id: m.id, url: m.url, type: m.type, status: m.status, businessId: m.businessId, businessName: (m as any).business?.name },
        };
      });
  }

  // PUT /admin/moderation-queue/:id/resolve — approve (leave the
  // media's own status as-is) or reject (flip it to REJECTED, so it
  // stops appearing publicly, mirroring what a business owner deleting
  // it would do, just admin-initiated).
  async resolve(id: string, action: 'approve' | 'reject') {
    const item = await this.queue.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Queue item not found.');

    if (action === 'reject') {
      const m = await this.media.findOne({ where: { id: item.mediaId } });
      if (m) {
        m.status = MediaStatus.REJECTED;
        await this.media.save(m);
      }
    }

    item.resolved = true;
    return this.queue.save(item);
  }
}
