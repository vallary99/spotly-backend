import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../entities/business.entity';
import { Experience } from '../entities/experience.entity';
import { User, UserRole } from '../entities/user.entity';
import { UsageEvent } from '../entities/usage-event.entity';
import { Media, MediaStatus, MediaType } from '../entities/media.entity';
import { CreateBusinessDto, UpdateBusinessDto, SetCoverPhotoDto } from './dto/business.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EmailService } from '../email/email.service';

// Seed categories shown even before any business has picked them —
// keeps the registration dropdown useful on day one. Real categories
// businesses actually register under (including anything typed in via
// "Other") get merged in on top of this in getCategories() below, so
// the list grows organically instead of staying frozen at this seed.
//
// Organized to match the 16 quick-filter groups exactly (see
// QUICK_FILTER_GROUPS in the frontend's app/page.tsx) — "Hidden Gems"
// from that same reference list is deliberately NOT a category here; it
// became Business.isHiddenGem instead, since it's a quality/vibe tag
// that can apply to a business of any category, not a business type of
// its own.
const SEED_CATEGORIES = [
  // Creative Boost
  'Pottery Studio',
  'Painting Studio',
  'Cake Decorating',
  'Candle Making',
  'Crafts Studio',
  'Photography Studio',
  // Art & Galleries
  'Art Gallery',
  'Art Studio',
  'Art Installation',
  'Exhibition Space',
  // Culture & Heritage
  'Museum',
  'Cultural Centre',
  'Heritage Site',
  'Cultural Experience',
  // Live Music & Karaoke
  'Live Music Venue',
  'Acoustic Session Venue',
  'Karaoke Bar',
  // Dance
  'Dance Class',
  'Dance Studio',
  'Social Dancing Venue',
  'Dance Performance Venue',
  // Nightlife
  'Nightclub',
  'Lounge',
  'Late-Night Venue',
  // Adrenaline Boost
  'Go-Karting',
  'Paintball',
  'Ziplining',
  'Climbing Gym',
  'Roller Skating Rink',
  'Ice Skating Rink',
  // Gaming
  'Arcade',
  'VR Gaming',
  'Gaming Lounge',
  'Esports Venue',
  'Simulator Experience',
  // Wildlife & Nature
  'Scenic View Point',
  'Picnic Spot',
  'Hiking Trail',
  'Camping Site',
  'Garden',
  'Park',
  // Beauty & Wellness
  'Spa',
  'Massage',
  'Fitness',
  'Yoga Studio',
  'Salon',
  'Wellness Centre',
  // Sports
  'Sports Ground',
  'Training Facility',
  'Sports Court',
  'Swimming Pool',
  // Shopping
  'Antique Store',
  'Farmers Market',
  'Thrift Store',
  'Boutique',
  // Workshops & Classes
  'Cooking Class',
  'Educational Workshop',
  'Demonstration Experience',
  // Restaurants & Cafés
  'Restaurant',
  'Cafe',
  'Bakery',
  'Diner',
  'Specialty Food Spot',
  // Drinks & Cocktails
  'Cocktail Bar',
  'Wine Bar',
  'Brewery',
  'Specialty Drinks Spot',
  // Platters & Buffets
  'Buffet',
  'Sharing Platters Spot',
  'Nyama Choma Spot',
  'Choma Base',
  'Street Food',
  'Group Dining Venue',
  // Other
  'Services',
];

@Injectable()
export class BusinessService {
  constructor(
    @InjectRepository(Business) private businesses: Repository<Business>,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(Experience) private experiences: Repository<Experience>,
    @InjectRepository(UsageEvent) private usageEvents: Repository<UsageEvent>,
    @InjectRepository(Media) private media: Repository<Media>,
    @InjectQueue('usage') private usageQueue: Queue,
    private email: EmailService,
  ) {}

  // GET /businesses/categories — powers the registration form's dropdown
  // AND doubles as evidence a category is "real": once one business
  // registers under a custom "Other" category (e.g. "Bowling"), it
  // appears here for every subsequent business, so they don't have to
  // rediscover "Other" independently — this is what closes that loop.
  async getCategories(): Promise<string[]> {
    const rows: Array<{ category: string }> = await this.businesses
      .createQueryBuilder('b')
      .select('DISTINCT b.category', 'category')
      .getRawMany();
    const inUse = rows.map((r) => r.category).filter(Boolean);
    const merged = Array.from(new Set([...SEED_CATEGORIES, ...inUse]));
    return merged.sort((a, b) => a.localeCompare(b));
  }

  // POST /businesses — FR-7.1/7.2/7.3: begins onboarding with Venue or
  // Experience Host type; a user may own at most one Business Account.
  async create(userId: string, dto: CreateBusinessDto) {
    const existing = await this.businesses.findOne({ where: { ownerId: userId } });
    if (existing) {
      throw new ConflictException('This account already has a registered business.');
    }
    const business = await this.businesses.save(this.businesses.create({ ...dto, ownerId: userId }));
    await this.users.update(userId, { role: UserRole.BUSINESS_OWNER });
    const owner = await this.users.findOne({ where: { id: userId } });
    if (owner) {
      await this.email.queueBusinessWelcomeEmail(owner.email, business.name);
    }
    return business;
  }

  // GET /businesses — powers search/browse; filterable by city,
  // neighborhood, category (or categories — comma-separated, matches
  // ANY of them, used by thematic quick filters like "Nightlife"), and
  // text (name/category) per FR-2.1/FR-2.2.
  //
  // Only businesses with at least one APPROVED photo are returned here —
  // a business with no real photo yet either shows a placeholder image
  // that misrepresents it, or (once real S3 is configured) a broken
  // image entirely. Rather than either, it simply doesn't appear in
  // public discovery until the owner adds one; it's still fully visible
  // to the owner themselves via the dashboard. See applyListingFilters()
  // below for the exact check.
  //
  // profileViews/savesCount are intentionally stripped from every result
  // here — those are owner-facing metrics (visible on the Business Owner
  // Surface via findOne() when the requester IS the owner), not public
  // browse data. Ratings are attached instead, since that's what the
  // card actually needs to display.
  async findAll(params: {
    city?: string;
    neighborhood?: string;
    category?: string;
    categories?: string;
    q?: string;
    isHiddenGem?: boolean;
  }) {
    const qb = this.businesses.createQueryBuilder('b');
    this.applyListingFilters(qb, params);
    // Premium's "priority search placement" — Premium businesses sort
    // first, then Featured (GROWTH), then Starter, and createdAt DESC
    // breaks ties within each tier (the previous, and only, ordering).
    // A raw CASE expression rather than a second query/sort pass, since
    // this needs to combine with take(50) at the DB level, not paginate
    // then re-sort in memory.
    qb.orderBy(`CASE b.tier WHEN 'PREMIUM' THEN 0 WHEN 'GROWTH' THEN 1 ELSE 2 END`, 'ASC')
      .addOrderBy('b.createdAt', 'DESC')
      .take(50);
    const results = await qb.getMany();
    return this.attachRatingsAndStripMetrics(results);
  }

  // GET /businesses/:id — records a view event (async, swept into
  // profileViews by the usage queue) rather than incrementing live.
  // profileViews/savesCount only appear in the response when the
  // requester is the business's own owner; everyone else sees the
  // business without those two fields.
  async findOne(id: string, requestingUserId?: string) {
    const business = await this.businesses.findOne({
      where: { id },
      relations: ['media', 'reviews', 'experiences'],
    });
    if (!business) {
      throw new NotFoundException('Business not found.');
    }
    await this.usageQueue.add('record-event', { businessId: id, type: 'view' });

    const [withRating] = await this.attachRatingsAndStripMetrics([business], {
      keepMetricsFor: requestingUserId,
    });
    return withRating;
  }

  // GET /businesses/:id/experiences/history — permanent Hosting History
  // (FR-9.4), regardless of expiry state.
  async getHostingHistory(id: string) {
    const business = await this.businesses.findOne({ where: { id } });
    if (!business) {
      throw new NotFoundException('Business not found.');
    }
    return this.experiences.find({
      where: { businessId: id },
      order: { startsAt: 'DESC' },
    });
  }

  // PUT /businesses/:id — only the owning Business Account may edit its
  // own profile.
  async update(id: string, userId: string, dto: UpdateBusinessDto) {
    const business = await this.businesses.findOne({ where: { id } });
    if (!business) {
      throw new NotFoundException('Business not found.');
    }
    if (business.ownerId !== userId) {
      throw new ForbiddenException('You do not own this business.');
    }
    Object.assign(business, dto);
    return this.businesses.save(business);
  }

  // PATCH /businesses/:id/cover-photo — lets an owner pick which of
  // their own approved photos leads their card/homepage thumbnail,
  // instead of always defaulting to whichever photo happened to be
  // uploaded first.
  async setCoverPhoto(id: string, userId: string, dto: SetCoverPhotoDto) {
    const business = await this.businesses.findOne({ where: { id } });
    if (!business) {
      throw new NotFoundException('Business not found.');
    }
    if (business.ownerId !== userId) {
      throw new ForbiddenException('You do not own this business.');
    }

    if (dto.mediaId) {
      const media = await this.media.findOne({ where: { id: dto.mediaId, businessId: id } });
      if (!media) {
        throw new NotFoundException('Photo not found on this business.');
      }
      if (media.type !== MediaType.PHOTO || media.status !== MediaStatus.APPROVED) {
        throw new ForbiddenException('Only an approved photo can be set as the cover.');
      }
      business.coverMediaId = media.id;
    } else {
      // Explicit reset back to the default (oldest approved photo).
      business.coverMediaId = null;
    }

    await this.businesses.save(business);
    return { coverMediaId: business.coverMediaId };
  }

  // DELETE /businesses/:id — lets an owner close their Business Account
  // while keeping their underlying User account intact (role reverts to
  // REGISTERED so they keep full guest/registered-user access — saving,
  // reviewing, browsing — just without a business attached). Cascades
  // remove the business's own media/experiences/reviews-received/
  // bookmarks-of-it/payment history; nothing about the owner's personal
  // account (their own reviews written elsewhere, their bookmarks of
  // OTHER businesses) is touched.
  async remove(id: string, userId: string) {
    const business = await this.businesses.findOne({ where: { id } });
    if (!business) {
      throw new NotFoundException('Business not found.');
    }
    if (business.ownerId !== userId) {
      throw new ForbiddenException('You do not own this business.');
    }
    await this.businesses.remove(business);
    await this.users.update(userId, { role: UserRole.REGISTERED });
    return { deleted: true };
  }

  async recordSave(businessId: string) {
    await this.usageQueue.add('record-event', { businessId, type: 'save' });
  }

  // Shared by findAll() and HomeService's rails — keeps the "must have
  // an approved photo" + city/neighborhood/category/categories/q
  // filtering logic in exactly one place instead of drifting apart.
  applyListingFilters(
    qb: ReturnType<Repository<Business>['createQueryBuilder']>,
    params: {
      city?: string;
      neighborhood?: string;
      category?: string;
      categories?: string;
      q?: string;
      isHiddenGem?: boolean;
    },
  ) {
    qb.andWhere(
      `EXISTS (SELECT 1 FROM media m WHERE m."businessId" = b.id AND m.status = 'APPROVED' AND m.type = 'PHOTO')`,
    );
    // A suspension with no end date stays hidden until an admin lifts it
    // manually; one with an end date in the future stays hidden too, but
    // an expired one is treated as no longer suspended without needing a
    // scheduled job to flip the flag back — the WHERE clause itself is
    // always the source of truth for "is this actually still hidden."
    qb.andWhere(
      `(b."isSuspended" = false OR (b."suspendedUntil" IS NOT NULL AND b."suspendedUntil" < now()))`,
    );
    if (params.city) qb.andWhere('b.city = :city', { city: params.city });
    if (params.neighborhood) qb.andWhere('b.neighborhood = :n', { n: params.neighborhood });
    if (params.category) qb.andWhere('b.category = :c', { c: params.category });
    if (params.categories) {
      const list = params.categories
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      if (list.length > 0) qb.andWhere('b.category IN (:...cats)', { cats: list });
    }
    // Combines with any other filter (category, city, etc.) rather than
    // replacing it — this is what lets "Hidden Gems" be toggled on
    // alongside a category filter and Open Now (handled client-side) at
    // the same time, per "can be used concurrently."
    if (params.isHiddenGem) qb.andWhere('b."isHiddenGem" = true');
    if (params.q) {
      qb.andWhere('(b.name ILIKE :q OR b.category ILIKE :q)', { q: `%${params.q}%` });
    }
    return qb;
  }

  // Attaches averageRating/reviewCount to each business (single grouped
  // query, not N+1), and strips profileViews/savesCount unless
  // `keepMetricsFor` matches the business's own owner. Public because
  // HomeService's rails need the exact same treatment as findAll() — no
  // reason to duplicate this logic there.
  async attachRatingsAndStripMetrics(
    businesses: Business[],
    opts: { keepMetricsFor?: string } = {},
  ): Promise<Array<Business & { averageRating: number; reviewCount: number }>> {
    if (businesses.length === 0) return [];
    const ids = businesses.map((b) => b.id);
    const rows: Array<{ businessid: string; avg: string; count: string }> = await this.businesses.manager.query(
      `SELECT "businessId" as businessid, AVG(rating)::float as avg, COUNT(*)::int as count
       FROM reviews WHERE "businessId" = ANY($1) GROUP BY "businessId"`,
      [ids],
    );
    const ratingsById = new Map(rows.map((r) => [r.businessid, { avg: Number(r.avg), count: Number(r.count) }]));

    // Cards need a real photo when one exists (falling back to a
    // category placeholder otherwise) — this was previously never
    // loaded on list queries at all, so every card silently showed its
    // placeholder even when the business had a real approved photo.
    // Fetched as a separate query rather than a JOIN on the main query
    // builder, since a JOIN here would multiply result rows for any
    // business with more than one approved photo and corrupt the
    // take()/pagination — same reasoning as the ratings query above.
    //
    // Includes both PHOTO and VIDEO (not just photo, despite the
    // original comment/name above) — this same query result also
    // becomes business.media on the single-business detail page below,
    // and a visitor who isn't the owner still needs to see an approved
    // video there. resolveBusinessPhotoUrl() on the frontend is what's
    // actually responsible for picking a PHOTO specifically when a card
    // needs one thumbnail; this query just needs to not withhold real,
    // approved content from anyone allowed to see it.
    const mediaRows: Array<{ id: string; businessid: string; url: string; status: string; type: string }> =
      await this.businesses.manager.query(
        `SELECT id, "businessId" as businessid, url, status, type FROM media
         WHERE "businessId" = ANY($1) AND status = 'APPROVED'
         ORDER BY "createdAt" ASC`,
        [ids],
      );
    const mediaById = new Map<string, Array<{ id: string; url: string; status: string; type: string }>>();
    for (const row of mediaRows) {
      const list = mediaById.get(row.businessid) ?? [];
      list.push({ id: row.id, url: row.url, status: row.status, type: row.type });
      mediaById.set(row.businessid, list);
    }

    // The public-facing media above only ever includes APPROVED photos
    // — correct for cards/browse, but it means an owner looking at their
    // OWN dashboard would never see a FLAGGED photo (e.g. wrongly
    // caught by the duplicate-hash check) at all, with no way to review
    // or delete it. For the specific business the requester owns, fetch
    // and use ALL of its media regardless of status instead.
    const ownedBusinessId = opts.keepMetricsFor
      ? businesses.find((b) => b.ownerId === opts.keepMetricsFor)?.id
      : undefined;
    if (ownedBusinessId) {
      const allMediaRows: Array<{ id: string; url: string; status: string; type: string }> =
        await this.businesses.manager.query(
          `SELECT id, url, status, type FROM media WHERE "businessId" = $1 ORDER BY "createdAt" ASC`,
          [ownedBusinessId],
        );
      mediaById.set(
        ownedBusinessId,
        allMediaRows.map((r) => ({ id: r.id, url: r.url, status: r.status, type: r.type })),
      );
    }

    return businesses.map((b) => {
      const rating = ratingsById.get(b.id);
      let media = mediaById.get(b.id) ?? [];
      // Owner-chosen cover photo goes first, so every consumer of this
      // media array (BusinessCard's resolveBusinessPhotoUrl, the
      // homepage rails, the business detail page's gallery) picks it up
      // automatically without each needing its own cover-aware logic —
      // they already all take "the first approved PHOTO in the array."
      // Falls back to natural createdAt-ASC order (oldest/first-uploaded
      // first) when no cover is set, or when the chosen cover is no
      // longer in this list (deleted, or unapproved since being chosen).
      if (b.coverMediaId) {
        const idx = media.findIndex((m) => m.id === b.coverMediaId);
        if (idx > 0) {
          media = [media[idx], ...media.slice(0, idx), ...media.slice(idx + 1)];
        }
      }
      const result: any = {
        ...b,
        media,
        averageRating: rating ? Number(rating.avg.toFixed(1)) : 0,
        reviewCount: rating ? rating.count : 0,
      };
      if (opts.keepMetricsFor !== b.ownerId) {
        delete result.profileViews;
        delete result.savesCount;
      }
      return result;
    });
  }
}
