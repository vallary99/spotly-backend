import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailTemplate } from '../entities/email-template.entity';
import { EmailSendLog } from '../entities/email-send-log.entity';
import { EmailService } from '../email/email.service';
import { AdminBusinessService, AdminBusinessFilters } from './admin-business.service';

// A hard ceiling on any single broadcast, independent of however many
// businesses actually match the filters — protects against a filter
// mistake (or a genuinely huge future business count) turning into an
// accidental blast to everyone. Matches the same instinct as
// applyDiscountCampaign's default limit of 1000, kept as a separate,
// slightly lower constant here since email sends are more visible/
// harder to undo than a discount flag.
const MAX_RECIPIENTS_PER_SEND = 500;

@Injectable()
export class AdminEmailService {
  constructor(
    @InjectRepository(EmailTemplate) private templates: Repository<EmailTemplate>,
    @InjectRepository(EmailSendLog) private sendLogs: Repository<EmailSendLog>,
    private adminBusiness: AdminBusinessService,
    private email: EmailService,
  ) {}

  // --- Template CRUD ---
  listTemplates() {
    return this.templates.find({ order: { updatedAt: 'DESC' } });
  }

  async getTemplate(id: string) {
    const t = await this.templates.findOne({ where: { id } });
    if (!t) throw new NotFoundException('Template not found.');
    return t;
  }

  createTemplate(dto: { name: string; subject: string; body: string }) {
    return this.templates.save(this.templates.create(dto));
  }

  async updateTemplate(id: string, dto: Partial<{ name: string; subject: string; body: string }>) {
    const t = await this.getTemplate(id);
    Object.assign(t, dto);
    return this.templates.save(t);
  }

  async deleteTemplate(id: string) {
    await this.getTemplate(id); // 404s if missing
    await this.templates.delete(id);
    return { deleted: true };
  }

  // Substitutes {{variable}} tokens against a single business's data.
  // Deliberately simple (no conditionals/loops) — this is a mail-merge,
  // not a templating engine; anything more the admin can just phrase
  // as its own template variant instead.
  private renderTemplate(text: string, business: Record<string, unknown>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
      const value = business[key];
      return value == null ? '' : String(value);
    });
  }

  // POST /admin/email-templates/preview — renders against the FIRST
  // business matching the filters (or a placeholder set if none match
  // yet), without sending or logging anything, so an admin can check a
  // campaign looks right before committing to a real send.
  async preview(subject: string, body: string, filters: AdminBusinessFilters) {
    const { results, total } = await this.adminBusiness.findAll({ ...filters, limit: 1 });
    const sample = results[0] ?? {
      name: 'Sample Business',
      ownerName: 'Sample Owner',
      tier: 'GROWTH',
      city: 'Nairobi',
      category: 'Cafe',
      discountPercent: 20,
    };
    const vars = { ...sample, businessName: sample.name, ownerName: (sample as any).ownerName };
    return {
      matchCount: total,
      usingSampleData: results.length === 0,
      subject: this.renderTemplate(subject, vars),
      body: this.renderTemplate(body, vars),
      sampleBusiness: sample.name,
    };
  }

  // POST /admin/email-templates/:id/send (or ad-hoc subject/body) — the
  // actual reward-program/broadcast mechanism. Reuses
  // AdminBusinessService's exact filter shape, so "send this offer to
  // the top 100 registered in Nairobi" means the same set of businesses
  // whether you're looking at the table, discounting them, or emailing
  // them.
  async send(params: {
    templateId?: string;
    subject?: string;
    body?: string;
    filters: AdminBusinessFilters;
    adminUserId: string;
  }) {
    let subject = params.subject;
    let body = params.body;
    let templateName = 'Ad-hoc email';

    if (params.templateId) {
      const t = await this.getTemplate(params.templateId);
      subject = t.subject;
      body = t.body;
      templateName = t.name;
    }
    if (!subject || !body) {
      throw new BadRequestException('Either templateId or both subject and body are required.');
    }

    const { results } = await this.adminBusiness.findAll({ ...params.filters, limit: MAX_RECIPIENTS_PER_SEND });
    if (results.length === 0) {
      throw new BadRequestException('No businesses match those filters — nothing to send.');
    }

    let queued = 0;
    for (const business of results) {
      if (!business.ownerEmail) continue; // shouldn't happen (every business has an owner), but never let one bad row break the whole batch
      const vars = { ...business, businessName: business.name, ownerName: (business as any).ownerName };
      await this.email.queueGeneralEmail(
        business.ownerEmail,
        this.renderTemplate(subject, vars),
        this.renderTemplate(body, vars),
      );
      queued++;
    }

    const log = await this.sendLogs.save(
      this.sendLogs.create({
        templateId: params.templateId ?? null,
        templateName,
        subject: this.renderTemplate(subject, { ...results[0], businessName: results[0].name, ownerName: (results[0] as any).ownerName }),
        filters: params.filters as Record<string, unknown>,
        recipientCount: queued,
        businessIds: results.map((r) => r.id),
        sentByAdminId: params.adminUserId,
      }),
    );

    return { queued, totalMatched: results.length, logId: log.id };
  }

  // GET /admin/email-sends — the accountability trail.
  getSendHistory() {
    return this.sendLogs.find({ order: { createdAt: 'DESC' }, take: 100 });
  }
}
