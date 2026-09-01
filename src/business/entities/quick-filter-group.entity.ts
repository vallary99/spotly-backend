import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Category } from './category.entity';

@Entity('quick_filter_groups')
export class QuickFilterGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  label: string; // e.g., "Restaurants & Cafés"

  @Column({ nullable: true })
  icon: string; // e.g., "bi-egg-fried" (Bootstrap Icon class)

  @Column({ default: 0 })
  sortOrder: number; // for ordering in UI

  // Many-to-many: one group can have multiple categories,
  // and categories can belong to multiple groups
  @ManyToMany(() => Category, (category) => category.quickFilterGroups)
  @JoinTable({
    name: 'quick_filter_group_categories',
    joinColumn: { name: 'quickFilterGroupId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'categoryId', referencedColumnName: 'id' },
  })
  categories: Category[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
