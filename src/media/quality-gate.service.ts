import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import * as crypto from 'crypto';

export interface QualityCheckResult {
  passed: boolean;
  reason?: string; // plain-language reason per BRD Section 10's "Media Upload Rejected" state
  width?: number;
  height?: number;
}

// Orientation-agnostic: checks the shorter side and total pixel count
// rather than a fixed width/height, so a portrait photo (very common —
// most people hold their phone vertically) isn't penalized for having a
// "width" under the old landscape-biased threshold. A typical phone
// camera photo (usually several thousand pixels per side) clears this
// easily; this mainly catches genuine thumbnails/screenshots/stock-icon
// uploads, which was the actual intent.
const MIN_SHORT_SIDE = 480;
const MIN_TOTAL_PIXELS = 480 * 640; // ~0.3MP

@Injectable()
export class QualityGateService {
  private readonly logger = new Logger(QualityGateService.name);

  // FR-8.1: instant check on upload — resolution, blur, orientation.
  // This runs for real against the uploaded buffer; no third-party
  // service required. Blur detection uses Laplacian variance on a
  // greyscale version of the image, which is fast enough to stay
  // synchronous for photos. Video frame extraction (for blur-checking
  // video) is not implemented in this scaffold — see note below.
  async checkImage(buffer: Buffer): Promise<QualityCheckResult> {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      return { passed: false, reason: "We couldn't read that image — try a different file." };
    }
    const shortSide = Math.min(metadata.width, metadata.height);
    const totalPixels = metadata.width * metadata.height;
    if (shortSide < MIN_SHORT_SIDE || totalPixels < MIN_TOTAL_PIXELS) {
      return {
        passed: false,
        reason: `Image is too small (${metadata.width}x${metadata.height}). Try a clearer, closer photo — most phone camera shots work fine.`,
        width: metadata.width,
        height: metadata.height,
      };
    }

    const blurVariance = await this.computeBlurVariance(image);
    const BLUR_THRESHOLD = 100; // lower variance = blurrier; tune against real business uploads per BRD Section 12
    if (blurVariance < BLUR_THRESHOLD) {
      return {
        passed: false,
        reason: 'This photo looks too blurry. Try retaking it in better light.',
        width: metadata.width,
        height: metadata.height,
      };
    }

    return { passed: true, width: metadata.width, height: metadata.height };
  }

  // Video quality-gating (resolution/orientation is checkable via
  // ffprobe; blur detection needs a frame extracted via ffmpeg first).
  // Not implemented here — requires the ffmpeg binary, which isn't
  // installed in this scaffold. Wire up `fluent-ffmpeg` + an installed
  // ffmpeg binary in the target environment, then mirror checkImage()'s
  // shape against an extracted frame.
  async checkVideo(_buffer: Buffer, durationSeconds: number, maxSeconds: number): Promise<QualityCheckResult> {
    if (durationSeconds > maxSeconds) {
      return {
        passed: false,
        reason: `Video is ${durationSeconds}s — this tier's limit is ${maxSeconds}s.`,
      };
    }
    return { passed: true };
  }

  private async computeBlurVariance(image: ReturnType<typeof sharp>): Promise<number> {
    const { data, info } = await image
      .clone()
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Simple Laplacian-like edge-variance approximation over the raw
    // greyscale buffer — sufficient for a fast MVP gate; a dedicated CV
    // library would be more precise but adds a heavier dependency.
    const { width, height } = info;
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const laplacian =
          -4 * data[idx] +
          data[idx - 1] +
          data[idx + 1] +
          data[idx - width] +
          data[idx + width];
        sum += laplacian;
        sumSq += laplacian * laplacian;
        count++;
      }
    }
    const mean = sum / count;
    return sumSq / count - mean * mean;
  }

  // Perceptual hash for the async duplicate-detection safety net
  // (FR-8.3) — a simple average-hash (aHash) implementation. Good enough
  // to flag near-identical reuse across business accounts without an
  // external service; DB has an index on Media.perceptualHash for the
  // lookup.
  async computePerceptualHash(buffer: Buffer): Promise<string> {
    const resized = await sharp(buffer).resize(8, 8, { fit: 'fill' }).greyscale().raw().toBuffer();
    const avg = resized.reduce((a, b) => a + b, 0) / resized.length;
    let hash = '';
    for (const pixel of resized) {
      hash += pixel >= avg ? '1' : '0';
    }
    return crypto.createHash('sha1').update(hash).digest('hex');
  }
}
