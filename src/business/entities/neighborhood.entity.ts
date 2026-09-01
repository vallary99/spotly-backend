import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('neighborhoods')
export class Neighborhood {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  city: string; // e.g. "Nairobi" — NOT unique; many neighborhoods share a city

  @Column({ type: 'text', nullable: true })
  description: string;

  // Soft-hide, distinct from deleting outright — a hidden neighborhood
  // drops out of public pickers (business onboarding, search filters)
  // without destroying it for any business that already has it set.
  @Column({ default: false })
  isHidden: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
