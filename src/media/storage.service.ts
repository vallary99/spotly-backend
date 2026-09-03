import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { MediaType } from './entities/media.entity';

// Two possible backends, resolved by resolveProvider() below: local disk
// (dev default, nothing configured) or Cloudinary. Every method branches
// on whichever is active — with nothing configured, local-disk behavior
// is completely unchanged.
const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'uploads');

type Provider = 'local' | 'cloudinary';

function isVideo(storageKey: string): boolean {
  return /\.(mp4|mov|webm)$/i.test(storageKey);
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private cloudinaryConfigured = false;

  constructor(private config: ConfigService) {}

  private isCloudinaryConfigured(): boolean {
    return Boolean(
      this.config.get('CLOUDINARY_CLOUD_NAME') &&
      this.config.get('CLOUDINARY_API_KEY') &&
      this.config.get('CLOUDINARY_API_SECRET'),
    );
  }

  // Cloudinary when its credentials are present, local disk otherwise —
  // the same "dormant unless configured" posture as DarajaService and
  // EmailService, so nothing breaks in a fresh checkout with an empty
  // .env.
  private resolveProvider(): Provider {
    return this.isCloudinaryConfigured() ? 'cloudinary' : 'local';
  }

  private getCloudinary() {
    if (!this.cloudinaryConfigured) {
      cloudinary.config({
        cloud_name: this.config.get<string>('CLOUDINARY_CLOUD_NAME'),
        api_key: this.config.get<string>('CLOUDINARY_API_KEY'),
        api_secret: this.config.get<string>('CLOUDINARY_API_SECRET'),
        secure: true,
      });
      this.cloudinaryConfigured = true;
    }
    return cloudinary;
  }

  private get publicApiUrl(): string {
    return (
      this.config.get('PUBLIC_API_URL') ||
      `http://localhost:${this.config.get('PORT') || 3000}`
    );
  }

  // Cloudinary's public_id can't contain a file extension the way a
  // storage key can — this maps a storageKey like
  // "businesses/<id>/<uuid>.jpg" into a Cloudinary public_id.
  private cloudinaryPublicId(storageKey: string): string {
    return storageKey.replace(/\.[a-zA-Z0-9]+$/, '');
  }

  // The URL a browser actually loads the file from once it's stored.
  // Used by ExperienceService's cover-image upload, which needs to commit
  // to a key before it has anything to check. Cloudinary's real delivery
  // URL is only known for certain after the upload call (it includes a
  // version number), so this gives the best available answer before that
  // — the unversioned form, which Cloudinary serves correctly.
  publicUrlForKey(key: string): string {
    if (this.resolveProvider() === 'local')
      return `${this.publicApiUrl}/uploads/${key}`;
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const resourceType = isVideo(key) ? 'video' : 'image';
    return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${this.cloudinaryPublicId(key)}`;
  }

  // Reserves the key the file will live at and hands back the URL it'll
  // be served from. Photos still POST their bytes to the backend (see
  // media.controller.ts) so the quality gate can inspect them before
  // anything is persisted — Cloudinary has no bare presigned-PUT
  // equivalent anyway, and photos are small enough that this was never
  // the problem.
  //
  // Video is different: the ONLY thing its quality gate checks is
  // duration (see QualityGateService.checkVideo — it never even reads
  // the buffer), and duration is knowable client-side before uploading
  // anything at all. So for video, once Cloudinary is actually
  // configured, this also returns `signedUpload` — everything the
  // browser needs to POST the file straight to Cloudinary, never
  // touching this API's request body at all. That matters because this
  // API runs on Vercel, whose serverless functions hard-cap request
  // bodies at 4.5MB — comfortably enough for a photo, routinely not
  // enough for even a short phone-recorded video (Val, Sep 2026: videos
  // failed in production with a generic "upload failed" while working
  // fine locally, where no such platform limit exists). With nothing
  // configured (local dev default), `signedUpload` is omitted and the
  // frontend falls back to the exact multipart flow it always used —
  // unaffected either way.
  getPresignedUploadUrl(businessId: string, fileExtension: string, type: MediaType) {
    const key = `businesses/${businessId}/${randomUUID()}.${fileExtension}`;

    if (this.resolveProvider() === 'local') {
      this.logger.warn(
        'Cloudinary is not configured — files will be saved to local disk. Fine for local development; set CLOUDINARY_* before deploying.',
      );
      const url = `${this.publicApiUrl}/uploads/${key}`;
      return {
        uploadUrl: url,
        publicUrl: url,
        storageKey: key,
        simulated: true,
      };
    }

    const publicUrl = this.publicUrlForKey(key);
    const base = {
      uploadUrl: publicUrl,
      publicUrl,
      storageKey: key,
      simulated: false,
    };

    if (type !== MediaType.VIDEO) {
      return base;
    }

    const publicId = this.cloudinaryPublicId(key);
    const timestamp = Math.round(Date.now() / 1000);
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET')!;
    // Signature must cover EXACTLY the params the browser's actual
    // upload POST includes (see the frontend's direct-upload call) — a
    // mismatch here is the #1 cause of Cloudinary rejecting an
    // otherwise-correct signed upload.
    const paramsToSign = { public_id: publicId, timestamp };
    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

    return {
      ...base,
      signedUpload: {
        cloudinaryUploadUrl: `https://api.cloudinary.com/v1_1/${this.config.get('CLOUDINARY_CLOUD_NAME')}/video/upload`,
        apiKey: this.config.get<string>('CLOUDINARY_API_KEY'),
        timestamp,
        signature,
        publicId,
      },
    };
  }

  // Actually persists the buffer — to local disk with nothing configured
  // (unchanged behavior), or to Cloudinary once it is. Called by
  // MediaService right after the quality gate passes, which is why this
  // exists at all: the current upload flow POSTs bytes to the backend
  // rather than having the browser send them straight to storage, so the
  // backend is what has to write them somewhere durable.
  async saveFile(buffer: Buffer, storageKey: string): Promise<void> {
    if (this.resolveProvider() === 'local') {
      const fullPath = path.join(LOCAL_UPLOAD_DIR, storageKey);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, buffer);
      return;
    }

    const resourceType = isVideo(storageKey) ? 'video' : 'image';
    await new Promise<void>((resolve, reject) => {
      const stream = this.getCloudinary().uploader.upload_stream(
        {
          public_id: this.cloudinaryPublicId(storageKey),
          resource_type: resourceType,
          overwrite: true,
        },
        (error) => (error ? reject(error) : resolve()),
      );
      stream.end(buffer);
    });
  }

  // Called by MediaService.remove().
  async deleteObject(storageKey: string) {
    if (this.resolveProvider() === 'local') {
      const fullPath = path.join(LOCAL_UPLOAD_DIR, storageKey);
      await fs.rm(fullPath, { force: true });
      return;
    }

    const resourceType = isVideo(storageKey) ? 'video' : 'image';
    await this.getCloudinary().uploader.destroy(
      this.cloudinaryPublicId(storageKey),
      {
        resource_type: resourceType,
      },
    );
  }
}
