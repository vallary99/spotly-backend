import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Media, MediaStatus, MediaType } from '../entities/media.entity';
import { Business } from '../entities/business.entity';
import { QualityGateService } from './quality-gate.service';
import { StorageService } from './storage.service';
import { TierConfigService } from '../subscription/tier-config.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(Media) private mediaRepo: Repository<Media>,
    @InjectRepository(Business) private businesses: Repository<Business>,
    private qualityGate: QualityGateService,
    private storage: StorageService,
    private tierConfig: TierConfigService,
    @InjectQueue('moderation') private moderationQueue: Queue,
  ) {}

  // Step 1: client asks for a place to upload to.
  async getUploadUrl(businessId: string, ownerId: string, type: MediaType, fileExtension: string) {
    const business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found.');
    if (business.ownerId !== ownerId) throw new ForbiddenException('You do not own this business.');

    // FR-11.1: block uploads beyond tier count before even issuing a URL.
    const limits = await this.tierConfig.getLimits(business.tier);
    const currentCount = await this.mediaRepo.count({
      where: { businessId, type, status: MediaStatus.APPROVED },
    });
    const cap = type === MediaType.PHOTO ? limits.photos : limits.videos;
    if (currentCount >= cap) {
      throw new ForbiddenException(
        `Your ${business.tier} package allows ${cap} ${type.toLowerCase()}(s). You're using ${currentCount} of ${cap}.`,
      );
    }

    return this.storage.getPresignedUploadUrl(businessId, fileExtension);
  }

  // Step 2 (POST /businesses/:id/media): after the client uploads the raw
  // bytes to storage, it calls this with the buffer (for the quality
  // check) and the storage key/url returned in step 1. FR-8.1/8.2: the
  // instant check runs synchronously and either rejects immediately
  // (reuploadable) or publishes right away — no manual approval queue.
  async submitForQualityCheck(params: {
    businessId: string;
    ownerId: string;
    type: MediaType;
    url: string;
    storageKey: string;
    buffer: Buffer;
    durationSeconds?: number;
  }) {
    const business = await this.businesses.findOne({ where: { id: params.businessId } });
    if (!business) throw new NotFoundException('Business not found.');
    if (business.ownerId !== params.ownerId) throw new ForbiddenException('You do not own this business.');

    const limits = await this.tierConfig.getLimits(business.tier);
    const result =
      params.type === MediaType.PHOTO
        ? await this.qualityGate.checkImage(params.buffer)
        : await this.qualityGate.checkVideo(
            params.buffer,
            params.durationSeconds ?? 0,
            limits.videoMaxSeconds,
          );

    if (!result.passed) {
      // Rejected on the spot — nothing is persisted as published; caller
      // surfaces result.reason and lets the owner reupload immediately.
      throw new BadRequestException(result.reason);
    }

    const perceptualHash =
      params.type === MediaType.PHOTO ? await this.qualityGate.computePerceptualHash(params.buffer) : null;

    // Persist the actual bytes now that they've passed the gate — to
    // local disk in dev, or to the real S3/R2 bucket once STORAGE_*
    // credentials are configured (see StorageService.saveLocalFile,
    // which branches on that internally; this call site doesn't need to
    // know or care which one is actually happening).
    await this.storage.saveLocalFile(params.buffer, params.storageKey);

    const media = (await this.mediaRepo.save(
      this.mediaRepo.create({
        businessId: params.businessId,
        type: params.type,
        url: params.url,
        storageKey: params.storageKey,
        status: MediaStatus.APPROVED, // publishes immediately per FR-8.2
        durationSeconds: params.durationSeconds,
        perceptualHash,
      } as any),
    )) as unknown as Media;

    // FR-8.3/8.4: async safety nets, never blocking the publish above.
    await this.moderationQueue.add('spot-check', { mediaId: media.id });
    if (perceptualHash) {
      await this.moderationQueue.add('duplicate-check', { mediaId: media.id, perceptualHash });
    }

    return media;
  }

  // DELETE /businesses/:id/media/:mediaId — this was a genuine gap, not
  // something waiting on real S3 credentials. Removing the DB row works
  // today; it also attempts to remove the underlying object from storage
  // when a real client is configured, and just skips that step
  // (logging, not failing) in simulated mode.
  async remove(businessId: string, mediaId: string, ownerId: string) {
    const business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found.');
    if (business.ownerId !== ownerId) throw new ForbiddenException('You do not own this business.');

    const media = await this.mediaRepo.findOne({ where: { id: mediaId, businessId } });
    if (!media) throw new NotFoundException('Media not found.');

    await this.storage.deleteObject(media.storageKey);
    await this.mediaRepo.remove(media);
    return { deleted: true };
  }
}
