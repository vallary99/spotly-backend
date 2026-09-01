import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

// A small generic key/value table for platform-wide settings that don't
// warrant their own dedicated table (unlike Category/Neighborhood/
// QuickFilterGroup, which have their own admin-managed rows). Values are
// stored as text and parsed by whichever typed helper reads them (see
// SystemConfigService) — deliberately loose so a new setting doesn't
// need its own migration to add a column.
@Entity('system_config')
export class SystemConfig {
  @PrimaryColumn()
  key: string;

  @Column({ type: 'text' })
  value: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
