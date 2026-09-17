import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductImage } from './entities/product.entity';
import { Business, BusinessType, ApprovalStatus } from './entities/business.entity';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { StorageService } from '../media/storage.service';
import { QualityGateService } from '../media/quality-gate.service';
import { MediaType } from '../media/entities/media.entity';

// Deliberately its own module rather than folded into MediaService or
// ExperienceService — see the Product entity's own comment for why
// (not time-bound like an Experience, not tier-limit-gated like
// business profile Media). Reuses StorageService and QualityGateService
// directly rather than duplicating either — a product photo deserves
// the same blur/resolution floor a business's own photos do.
@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product) private products: Repository<Product>,
    @InjectRepository(ProductImage) private images: Repository<ProductImage>,
    @InjectRepository(Business) private businesses: Repository<Business>,
    private storage: StorageService,
    private qualityGate: QualityGateService,
  ) {}

  // Every write path in this service shares this same gate: only the
  // owner, only a Made in Kenya business, only once APPROVED — a
  // PENDING or REJECTED business cannot post products no matter what
  // (Val, Sep 2026: "they will be able to post their products after
  // approval").
  private async assertCanManageProducts(businessId: string, ownerId: string): Promise<Business> {
    const business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found.');
    if (business.ownerId !== ownerId) throw new ForbiddenException('You do not own this business.');
    if (business.type !== BusinessType.MADE_IN_KENYA) {
      throw new ForbiddenException('Only Made in Kenya businesses can post products.');
    }
    if (business.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new ForbiddenException('Your Made in Kenya application is still pending approval.');
    }
    return business;
  }

  async create(businessId: string, ownerId: string, dto: CreateProductDto) {
    await this.assertCanManageProducts(businessId, ownerId);
    return this.products.save(this.products.create({ ...dto, businessId }));
  }

  // POST /businesses/:id/products/drafts — Val, Sep 2026. Only `name`
  // required (falls back to a placeholder even if blank) — everything
  // else, including price, can be filled in later. Still requires an
  // APPROVED Made in Kenya business, same as any other write here — a
  // still-pending application can't start drafting products either,
  // consistent with the original "products only after approval" design.
  async saveDraft(businessId: string, ownerId: string, dto: Partial<CreateProductDto>) {
    await this.assertCanManageProducts(businessId, ownerId);
    return this.products.save(
      this.products.create({
        ...dto,
        name: dto.name || 'Untitled product',
        businessId,
        isDraft: true,
      }),
    );
  }

  // PUT /businesses/:id/products/:productId/publish — the moment a
  // draft actually becomes visible in the Catalogue tab and shareable.
  async publishDraft(businessId: string, productId: string, ownerId: string) {
    await this.assertCanManageProducts(businessId, ownerId);
    const product = await this.products.findOne({ where: { id: productId, businessId } });
    if (!product) throw new NotFoundException('Product not found.');
    if (!product.isDraft) throw new BadRequestException('This product is already published.');

    const missing: string[] = [];
    if (!product.name || product.name === 'Untitled product') missing.push('name');
    if (product.price == null) missing.push('a price');
    if (missing.length > 0) {
      throw new BadRequestException(`This draft is still missing: ${missing.join(', ')}.`);
    }

    product.isDraft = false;
    return this.products.save(product);
  }

  async update(businessId: string, productId: string, ownerId: string, dto: UpdateProductDto) {
    await this.assertCanManageProducts(businessId, ownerId);
    const product = await this.products.findOne({ where: { id: productId, businessId } });
    if (!product) throw new NotFoundException('Product not found.');
    Object.assign(product, dto);
    return this.products.save(product);
  }

  async remove(businessId: string, productId: string, ownerId: string) {
    await this.assertCanManageProducts(businessId, ownerId);
    const product = await this.products.findOne({ where: { id: productId, businessId }, relations: ['images'] });
    if (!product) throw new NotFoundException('Product not found.');
    for (const image of product.images) {
      await this.storage.deleteObject(image.storageKey).catch(() => {});
    }
    await this.products.remove(product);
    return { deleted: true };
  }

  // GET /businesses/:id/products — public. Drafts never appear here
  // (Val, Sep 2026's draft feature), and never for a business that
  // isn't APPROVED — same bar findOnePublic already applies to a
  // single product, now applied consistently to the list too (this
  // previously had neither check, serving both the public Catalogue
  // tab and the owner's dashboard identically).
  async findForBusiness(businessId: string) {
    const business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business || business.approvalStatus !== ApprovalStatus.APPROVED) {
      return [];
    }
    return this.products.find({
      where: { businessId, isDraft: false },
      relations: ['images'],
      order: { createdAt: 'DESC' },
    });
  }

  // GET /businesses/:id/products/manage — owner-only, every product
  // regardless of draft/approval status, for the dashboard's Catalogue
  // tab.
  async findAllForOwner(businessId: string, ownerId: string) {
    const business = await this.businesses.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found.');
    if (business.ownerId !== ownerId) throw new ForbiddenException('You do not own this business.');
    return this.products.find({
      where: { businessId },
      relations: ['images'],
      order: { createdAt: 'DESC' },
    });
  }

  // GET /products/:id — the product's own shareable public page (Val,
  // Sep 2026: "should also be shareable"). Only ever resolves for a
  // product belonging to an APPROVED business — a shared link to a
  // still-pending or rejected business's product shouldn't work.
  async findOnePublic(id: string) {
    const product = await this.products.findOne({
      where: { id },
      relations: ['images', 'business'],
    });
    if (!product || product.business.approvalStatus !== ApprovalStatus.APPROVED) {
      throw new NotFoundException('Product not found.');
    }
    // Sorted here rather than relying on a DB-level order on the
    // relation — sortOrder is what "swipe left to view the next" (Val)
    // actually reads.
    product.images.sort((a, b) => a.sortOrder - b.sortOrder);
    return product;
  }

  async getUploadUrl(businessId: string, ownerId: string, ext: string) {
    await this.assertCanManageProducts(businessId, ownerId);
    return this.storage.getPresignedUploadUrl(businessId, ext, MediaType.PHOTO);
  }

  // multipart upload straight into the quality gate, same shape as
  // MediaService.submitForQualityCheck — the client POSTs the bytes
  // here with the key returned by getUploadUrl above.
  async addImage(params: {
    businessId: string;
    productId: string;
    ownerId: string;
    url: string;
    storageKey: string;
    buffer: Buffer;
  }) {
    await this.assertCanManageProducts(params.businessId, params.ownerId);
    const product = await this.products.findOne({
      where: { id: params.productId, businessId: params.businessId },
      relations: ['images'],
    });
    if (!product) throw new NotFoundException('Product not found.');

    const result = await this.qualityGate.checkImage(params.buffer);
    if (!result.passed) {
      throw new ForbiddenException(result.reason);
    }

    await this.storage.saveFile(params.buffer, params.storageKey);
    const sortOrder = product.images.length;
    return this.images.save(
      this.images.create({
        productId: product.id,
        url: params.url,
        storageKey: params.storageKey,
        sortOrder,
      }),
    );
  }

  async removeImage(businessId: string, productId: string, imageId: string, ownerId: string) {
    await this.assertCanManageProducts(businessId, ownerId);
    const image = await this.images.findOne({ where: { id: imageId, productId } });
    if (!image) throw new NotFoundException('Image not found.');
    await this.storage.deleteObject(image.storageKey).catch(() => {});
    await this.images.remove(image);
    return { deleted: true };
  }
}
