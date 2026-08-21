import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v2 as cloudinary } from 'cloudinary';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

// Three possible backends, resolved by resolveProvider() below: local
// disk (dev default, nothing configured), S3-compatible (AWS S3 or
// Cloudflare R2), or Cloudinary. Every method branches on whichever is
// active — with nothing configured, local-disk behavior is completely
// unchanged from before any of this existed.
const LOCAL_UPLOAD_DIR = path.join(process.cwd(), 'uploads');

type Provider = 'local' | 's3' | 'cloudinary';

// Extension → MIME type for the handful of formats the quality gate
// actually accepts (see quality-gate.service.ts). Local disk and S3
// need this set explicitly at upload time — getting it wrong means
// browsers try to download a photo instead of displaying it. Cloudinary
// infers content type itself from the buffer, so this is only consumed
// by the local/S3 branches below.
const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
};

function guessContentType(storageKey: string): string {
  const ext = storageKey.split('.').pop()?.toLowerCase() ?? '';
  return MIME_TYPES[ext] ?? 'application/octet-stream';
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private s3Client: S3Client | null = null;
  private cloudinaryConfigured = false;

  constructor(private config: ConfigService) {}

  private isS3Configured(): boolean {
    return Boolean(this.config.get('STORAGE_ACCESS_KEY_ID') && this.config.get('STORAGE_SECRET_ACCESS_KEY'));
  }

  private isCloudinaryConfigured(): boolean {
    return Boolean(
      this.config.get('CLOUDINARY_CLOUD_NAME') &&
        this.config.get('CLOUDINARY_API_KEY') &&
        this.config.get('CLOUDINARY_API_SECRET'),
    );
  }

  // STORAGE_PROVIDER picks explicitly when set ("s3" | "cloudinary"); if
  // it's unset or its credentials aren't actually present, this falls
  // back to whichever provider DOES have real credentials, and finally
  // to local disk — the same "dormant unless configured" posture as
  // before, just extended to a three-way choice instead of two.
  private resolveProvider(): Provider {
    const requested = this.config.get<string>('STORAGE_PROVIDER');
    if (requested === 'cloudinary' && this.isCloudinaryConfigured()) return 'cloudinary';
    if (requested === 's3' && this.isS3Configured()) return 's3';
    if (this.isCloudinaryConfigured()) return 'cloudinary';
    if (this.isS3Configured()) return 's3';
    return 'local';
  }

  private isConfigured(): boolean {
    return this.resolveProvider() !== 'local';
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

  // Built lazily (not in the constructor) so a deployment that never
  // configures S3 never even constructs a client.
  private getClient(): S3Client {
    if (this.s3Client) return this.s3Client;
    const endpoint = this.config.get<string>('STORAGE_ENDPOINT');
    this.s3Client = new S3Client({
      region: this.config.get<string>('STORAGE_REGION') || 'auto',
      // Leave endpoint unset for real AWS S3; set it for R2/MinIO/other
      // S3-compatible providers, per .env.example.
      ...(endpoint ? { endpoint } : {}),
      credentials: {
        accessKeyId: this.config.get<string>('STORAGE_ACCESS_KEY_ID')!,
        secretAccessKey: this.config.get<string>('STORAGE_SECRET_ACCESS_KEY')!,
      },
    });
    return this.s3Client;
  }

  private get bucket(): string {
    return this.config.get<string>('STORAGE_BUCKET') || 'spotly-media';
  }

  private get publicApiUrl(): string {
    return this.config.get('PUBLIC_API_URL') || `http://localhost:${this.config.get('PORT') || 3000}`;
  }

  // Cloudinary's own public_id can't contain a file extension or slashes
  // the way an S3 key can — this maps a storageKey like
  // "businesses/<id>/<uuid>.jpg" into a Cloudinary folder+public_id pair.
  private cloudinaryPublicId(storageKey: string): string {
    return storageKey.replace(/\.[a-zA-Z0-9]+$/, '');
  }

  // The URL a browser actually loads the file from once it's stored —
  // a custom CDN/public domain if configured (see deployment guide's R2
  // custom-domain step), otherwise each provider's default public URL
  // shape.
  private publicUrlFor(key: string): string {
    const base = this.config.get<string>('STORAGE_PUBLIC_BASE_URL');
    if (base) return `${base.replace(/\/$/, '')}/${key}`;
    const endpoint = this.config.get<string>('STORAGE_ENDPOINT');
    if (endpoint) {
      // R2/MinIO-style: <endpoint>/<bucket>/<key>
      return `${endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
    }
    // Plain AWS S3 default public URL shape.
    const region = this.config.get<string>('STORAGE_REGION') || 'us-east-1';
    return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  // Public URL for a storage key you've already decided on yourself
  // (rather than one this service generated via getPresignedUploadUrl) —
  // used by ExperienceService's cover-image upload, which needs to
  // commit to a key before it has anything to check. Cloudinary's actual
  // delivery URL is only known for certain after the real upload call
  // (it includes a version number), so this gives the best available
  // answer before that — the real one gets used going forward once
  // saveLocalFile's Cloudinary branch actually returns it.
  publicUrlForKey(key: string): string {
    const provider = this.resolveProvider();
    if (provider === 'local') return `${this.publicApiUrl}/uploads/${key}`;
    if (provider === 'cloudinary') {
      const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
      const resourceType = /\.(mp4|mov|webm)$/i.test(key) ? 'video' : 'image';
      return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${this.cloudinaryPublicId(key)}`;
    }
    return this.publicUrlFor(key);
  }

  // Returns a presigned PUT URL the client could upload directly to.
  // Not currently used by the frontend (it POSTs bytes to the backend
  // instead, see media.controller.ts, so the quality gate can inspect
  // them before anything is persisted) — kept real and correct for S3
  // for when a future direct-upload flow wants it. Cloudinary doesn't
  // have an equivalent plain-PUT URL (its direct-upload flow needs a
  // signed request built with its own SDK helper, not a bare presigned
  // URL) — for that provider this just returns the eventual public URL,
  // matching what the S3 branch returns for `publicUrl` today.
  async getPresignedUploadUrl(businessId: string, fileExtension: string) {
    const key = `businesses/${businessId}/${randomUUID()}.${fileExtension}`;
    const provider = this.resolveProvider();

    if (provider === 'local') {
      this.logger.warn(
        'No STORAGE_PROVIDER configured — files will be saved to local disk. Fine for local development; configure S3/R2/Cloudinary before deploying.',
      );
      return {
        uploadUrl: `${this.publicApiUrl}/uploads/${key}`,
        publicUrl: `${this.publicApiUrl}/uploads/${key}`,
        storageKey: key,
        simulated: true,
      };
    }

    if (provider === 'cloudinary') {
      const publicUrl = this.publicUrlForKey(key);
      return { uploadUrl: publicUrl, publicUrl, storageKey: key, simulated: false };
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: guessContentType(key),
    });
    const uploadUrl = await getSignedUrl(this.getClient(), command, { expiresIn: 300 });

    return {
      uploadUrl,
      publicUrl: this.publicUrlFor(key),
      storageKey: key,
      simulated: false,
    };
  }

  // Actually persists the buffer — to local disk with nothing
  // configured (unchanged behavior), or to the real provider once one
  // is. Called by MediaService right after the quality gate passes,
  // which is why this exists at all: the current upload flow POSTs
  // bytes to the backend rather than having the browser PUT them
  // straight to storage, so the backend is what actually has to write
  // them somewhere durable.
  async saveLocalFile(buffer: Buffer, storageKey: string): Promise<void> {
    const provider = this.resolveProvider();

    if (provider === 'local') {
      const fullPath = path.join(LOCAL_UPLOAD_DIR, storageKey);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, buffer);
      return;
    }

    if (provider === 'cloudinary') {
      const resourceType = /\.(mp4|mov|webm)$/i.test(storageKey) ? 'video' : 'image';
      await new Promise<void>((resolve, reject) => {
        const stream = this.getCloudinary().uploader.upload_stream(
          { public_id: this.cloudinaryPublicId(storageKey), resource_type: resourceType, overwrite: true },
          (error) => (error ? reject(error) : resolve()),
        );
        stream.end(buffer);
      });
      return;
    }

    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: guessContentType(storageKey),
      }),
    );
  }

  // Called by MediaService.remove().
  async deleteObject(storageKey: string) {
    const provider = this.resolveProvider();

    if (provider === 'local') {
      const fullPath = path.join(LOCAL_UPLOAD_DIR, storageKey);
      await fs.rm(fullPath, { force: true });
      return;
    }

    if (provider === 'cloudinary') {
      const resourceType = /\.(mp4|mov|webm)$/i.test(storageKey) ? 'video' : 'image';
      await this.getCloudinary().uploader.destroy(this.cloudinaryPublicId(storageKey), { resource_type: resourceType });
      return;
    }

    await this.getClient().send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }));
  }
}
