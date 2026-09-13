import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Business } from '../../business/entities/business.entity';

// A Made in Kenya business's catalogue item — deliberately NOT built on
// the existing Experience entity despite the surface similarity (both
// have a name/description/price/images), because an Experience is
// inherently time-bound and auto-expires; a catalogue product has no
// end date, it just exists until the owner removes it (Val, Sep 2026).
// Also deliberately not reusing the Media entity for its photos — that
// entity's tier-limit-aware upload logic is specific to business
// profile photos/videos, a different concern from an individual
// product's images.
@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  businessId: string;

  @ManyToOne(() => Business, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'businessId' })
  business: Business;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'float' })
  price: number;

  @Column({ default: 'KES' })
  currency: string;

  @OneToMany(() => ProductImage, (image) => image.product)
  images: ProductImage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  productId: string;

  @ManyToOne(() => Product, (product) => product.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Column()
  url: string;

  @Column()
  storageKey: string;

  // Swipe order (Val, Sep 2026: "A product can have more than one
  // photo, swipe left to view the next") — same left-to-right ordering
  // concept as a gallery, just scoped to one product's own images
  // rather than a whole business's.
  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;
}
