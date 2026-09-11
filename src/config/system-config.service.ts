import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from './entities/system-config.entity';

// Default lives here, not just in the seed migration, so a database
// that's missing the row for any reason (a fresh test DB, a row that
// got deleted) still behaves sensibly instead of throwing.
export const DEFAULT_MAX_CATEGORIES_PER_BUSINESS = 5;
const MAX_CATEGORIES_KEY = 'maxCategoriesPerBusiness';

// Go-live reminder cadence (see ListingLifecycleService) — was
// hardcoded (7 days between reminders, effectively 4 of them before
// going INACTIVE) until Val, Sep 2026 asked for it to be admin-
// configurable. INACTIVE is deliberately not a third, independent
// setting — it's derived as reminderCount * reminderIntervalDays, so
// there's never a confusing gap between "the last reminder fired" and
// "the listing went inactive with no further warning."
export const DEFAULT_REMINDER_INTERVAL_DAYS = 7;
export const DEFAULT_REMINDER_COUNT = 4;
const REMINDER_INTERVAL_DAYS_KEY = 'goLiveReminderIntervalDays';
const REMINDER_COUNT_KEY = 'goLiveReminderCount';

@Injectable()
export class SystemConfigService {
  constructor(@InjectRepository(SystemConfig) private repo: Repository<SystemConfig>) {}

  async get(key: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.repo.save(this.repo.create({ key, value }));
  }

  // Val, Sep 2026: "Cap at 5 for now but make it configurable by
  // admin." — read by BusinessService on create/update (server-side,
  // not just the frontend's dropdown), and by the public
  // GET /businesses/max-categories endpoint the registration/edit
  // forms use to size their own picker.
  async getMaxCategoriesPerBusiness(): Promise<number> {
    const raw = await this.get(MAX_CATEGORIES_KEY);
    const parsed = raw != null ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_CATEGORIES_PER_BUSINESS;
  }

  async setMaxCategoriesPerBusiness(value: number): Promise<number> {
    const clamped = Math.max(1, Math.min(50, Math.round(value)));
    await this.set(MAX_CATEGORIES_KEY, String(clamped));
    return clamped;
  }

  async getReminderIntervalDays(): Promise<number> {
    const raw = await this.get(REMINDER_INTERVAL_DAYS_KEY);
    const parsed = raw != null ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REMINDER_INTERVAL_DAYS;
  }

  async setReminderIntervalDays(value: number): Promise<number> {
    const clamped = Math.max(1, Math.min(30, Math.round(value)));
    await this.set(REMINDER_INTERVAL_DAYS_KEY, String(clamped));
    return clamped;
  }

  async getReminderCount(): Promise<number> {
    const raw = await this.get(REMINDER_COUNT_KEY);
    const parsed = raw != null ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REMINDER_COUNT;
  }

  async setReminderCount(value: number): Promise<number> {
    const clamped = Math.max(1, Math.min(20, Math.round(value)));
    await this.set(REMINDER_COUNT_KEY, String(clamped));
    return clamped;
  }
}
