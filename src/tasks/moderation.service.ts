import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Media, MediaStatus } from '../media/entities/media.entity';
import { ModerationQueueItem } from './entities/moderation-queue-item.entity';
import { runInBackground } from '../common/utils/background.util';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    @InjectRepository(Media) private mediaRepo: Repository<Media>,
    @InjectRepository(ModerationQueueItem)
    private queueRepo: Repository<ModerationQueueItem>,
  ) {}

  queueSpotCheck(mediaId: string): void {
    runInBackground(this.logger, `spot-check ${mediaId}`, () =>
      this.spotCheck(mediaId),
    );
  }

  queueDuplicateCheck(mediaId: string, perceptualHash: string): void {
    runInBackground(this.logger, `duplicate-check ${mediaId}`, () =>
      this.duplicateCheck(mediaId, perceptualHash),
    );
  }

  async spotCheck(mediaId: string): Promise<void> {
    await this.queueRepo.save(
      this.queueRepo.create({ mediaId, reason: 'routine_spot_check' }),
    );
  }

  async duplicateCheck(mediaId: string, perceptualHash: string): Promise<void> {
    const current = await this.mediaRepo.findOne({ where: { id: mediaId } });
    if (!current) return;

    const duplicates = await this.mediaRepo
      .createQueryBuilder('m')
      .where('m.perceptualHash = :hash', { hash: perceptualHash })
      .andWhere('m.id != :id', { id: mediaId })
      .andWhere('m."businessId" != :businessId', {
        businessId: current.businessId,
      })
      .getMany();

    if (duplicates.length > 0) {
      await this.mediaRepo.update(mediaId, {
        isDuplicateFlag: true,
        status: MediaStatus.FLAGGED,
      });
      await this.queueRepo.save(
        this.queueRepo.create({ mediaId, reason: 'duplicate_hash_flag' }),
      );
      this.logger.warn(
        `Media ${mediaId} flagged as possible duplicate of ${duplicates.length} other item(s) on a different business.`,
      );
    }
  }
}
