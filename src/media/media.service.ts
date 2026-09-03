import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Media, MediaStatus, MediaType } from './entities/media.entity';
import { Business } from '../business/entities/business.entity';
import { QualityGateService } from './quality-gate.service';
import { StorageService } from './storage.service';
import { TierConfigService } from '../subscription/tier-config.service';
import { ModerationService } from '../tasks/moderation.service';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(Media) private mediaRepo: Repository<Media>,
    @InjectRepository(Business) private businesses: Repository<Business>,
    private qualityGate: QualityGateService,
    private storage: StorageService,
    private tierConfig: TierConfigService,
    private moderation: ModerationService,
  ) {}

  // Step 1: client asks for a place to upload to.
  async getUploadUrl(
    businessId: string,
    ownerId: string,
    type: MediaType,
    fileExtension: string,
  ) {
    const business = await this.businesses.findOne({
      where: { id: businessId },
    });
    if (!business) throw new NotFoundException('Business not found.');
    if (business.ownerId !== ownerId)
      throw new ForbiddenException('You do not own this business.');

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

    return this.storage.getPresignedUploadUrl(businessId, fileExtension, type);
  }

  // Step 2 for VIDEO when Cloudinary is configured: the browser already
  // uploaded the bytes straight to Cloudinary using the signature from
  // getUploadUrl() above (see StorageService.getPresignedUploadUrl's
  // `signedUpload` field) — this API's request body never carried the
  // file at all, which is the whole point (Vercel's 4.5MB body cap,
  // Val, Sep 2026). All that's left is exactly what
  // submitForQualityCheck does for the DB/quality-gate side, minus
  // ever touching a buffer: check duration (the only thing
  // QualityGateService.checkVideo actually looks at), and if it fails,
  // delete the file that's already sitting in Cloudinary — rejection
  // means "undo," not "never happened," which is the one real
  // trade-off of not gating before persisting the way the multipart
  // photo path still does.
  async confirmVideoUpload(params: {
    businessId: string;
    ownerId: string;
    url: string;
    storageKey: string;
    durationSeconds: number;
  }) {
    const business = await this.businesses.findOne({
      where: { id: params.businessId },
    });
    if (!business) throw new NotFoundException('Business not found.');
    if (business.ownerId !== params.ownerId)
      throw new ForbiddenException('You do not own this business.');

    const limits = await this.tierConfig.getLimits(business.tier);
    const result = await this.qualityGate.checkVideo(
      Buffer.alloc(0),
      params.durationSeconds,
      limits.videoMaxSeconds,
    );

    if (!result.passed) {
      await this.storage.deleteObject(params.storageKey);
      throw new BadRequestException(result.reason);
    }

    const media = (await this.mediaRepo.save(
      this.mediaRepo.create({
        businessId: params.businessId,
        type: MediaType.VIDEO,
        url: params.url,
        storageKey: params.storageKey,
        status: MediaStatus.APPROVED,
        durationSeconds: params.durationSeconds,
      } as any),
    )) as unknown as Media;

    // Same async safety net as the multipart path — no perceptual hash
    // for video (never computed one for video before this change
    // either, see submitForQualityCheck: it's PHOTO-only).
    this.moderation.queueSpotCheck(media.id);

    return media;
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
    const business = await this.businesses.findOne({
      where: { id: params.businessId },
    });
    if (!business) throw new NotFoundException('Business not found.');
    if (business.ownerId !== params.ownerId)
      throw new ForbiddenException('You do not own this business.');

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
      params.type === MediaType.PHOTO
        ? await this.qualityGate.computePerceptualHash(params.buffer)
        : null;

    // Persist the actual bytes now that they've passed the gate — to
    // local disk in dev, or to Cloudinary once CLOUDINARY_* credentials
    // are configured (see StorageService.saveFile, which branches on
    // that internally; this call site doesn't need to know or care which
    // one is actually happening).
    await this.storage.saveFile(params.buffer, params.storageKey);

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
    this.moderation.queueSpotCheck(media.id);
    if (perceptualHash) {
      this.moderation.queueDuplicateCheck(media.id, perceptualHash);
    }

    return media;
  }

  // DELETE /businesses/:id/media/:mediaId — removes the DB row and the
  // underlying object from whichever backend holds it (local disk or
  // Cloudinary).
  async remove(businessId: string, mediaId: string, ownerId: string) {
    const business = await this.businesses.findOne({
      where: { id: businessId },
    });
    if (!business) throw new NotFoundException('Business not found.');
    if (business.ownerId !== ownerId)
      throw new ForbiddenException('You do not own this business.');

    const media = await this.mediaRepo.findOne({
      where: { id: mediaId, businessId },
    });
    if (!media) throw new NotFoundException('Media not found.');

    await this.storage.deleteObject(media.storageKey);
    await this.mediaRepo.remove(media);
    return { deleted: true };
  }
}
