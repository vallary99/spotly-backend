import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Media, MediaStatus } from '../entities/media.entity';
import { ModerationQueueItem } from '../entities/moderation-queue-item.entity';

@Processor('moderation')
export class ModerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ModerationProcessor.name);

  constructor(
    @InjectRepository(Media) private mediaRepo: Repository<Media>,
    @InjectRepository(ModerationQueueItem) private queueRepo: Repository<ModerationQueueItem>,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'spot-check') {
      // FR-8.4: every newly published item gets a routine spot-check
      // entry for the daily human review pass — never blocks publish.
      await this.queueRepo.save(
        this.queueRepo.create({ mediaId: job.data.mediaId, reason: 'routine_spot_check' }),
      );
      return;
    }

    if (job.name === 'duplicate-check') {
      // FR-8.3: flag if the same perceptual hash appears on a DIFFERENT
      // business's media — likely theft or fraud. This previously never
      // actually checked businessId, so any re-upload of the same photo
      // to the SAME business (a common, completely legitimate thing to
      // do while testing, or re-adding a photo after deleting it) got
      // wrongly flagged as fraud. Fixed to only match across businesses.
      const { mediaId, perceptualHash } = job.data;
      const current = await this.mediaRepo.findOne({ where: { id: mediaId } });
      if (!current) return;

      const duplicates = await this.mediaRepo
        .createQueryBuilder('m')
        .where('m.perceptualHash = :hash', { hash: perceptualHash })
        .andWhere('m.id != :id', { id: mediaId })
        .andWhere('m."businessId" != :businessId', { businessId: current.businessId })
        .getMany();

      if (duplicates.length > 0) {
        await this.mediaRepo.update(mediaId, { isDuplicateFlag: true, status: MediaStatus.FLAGGED });
        await this.queueRepo.save(
          this.queueRepo.create({ mediaId, reason: 'duplicate_hash_flag' }),
        );
        this.logger.warn(`Media ${mediaId} flagged as possible duplicate of ${duplicates.length} other item(s) on a different business.`);
      }
    }
  }
}
