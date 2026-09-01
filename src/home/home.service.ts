import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, SubscriptionTier } from '../business/entities/business.entity';
import { Experience } from '../experience/entities/experience.entity';
import { QuickFilterGroup } from '../business/entities/quick-filter-group.entity';
import { BusinessService } from '../business/business.service';
import { withBudgetFallback } from '../experience/experience.util';

@Injectable()
export class HomeService {
  constructor(
    @InjectRepository(Business) private businesses: Repository<Business>,
    @InjectRepository(Experience) private experiences: Repository<Experience>,
    @InjectRepository(QuickFilterGroup) private quickFilterGroups: Repository<QuickFilterGroup>,
    private businessService: BusinessService,
  ) {}

  // GET /home — FR-1.1/1.4: single backend endpoint whose response
  // updates in full when quick filters are applied (?city=, ?neighborhood=,
  // ?category=, ?categories=). Three rails, each capped 8-12 per FR-1.2.
  async getHome(params: {
    city?: string;
    neighborhood?: string;
    category?: string;
    categories?: string;
    q?: string;
    isHiddenGem?: boolean;
  }) {
    const baseQb = () => {
      const qb = this.businesses.createQueryBuilder('b');
      // Same "must have an approved photo" + location/category filtering
      // as GET /businesses — one shared implementation in BusinessService
      // so the two never drift apart.
      this.businessService.applyListingFilters(qb, params);
      return qb;
    };

    // "Trending This Week" — proxy: highest profileViews this rolling
    // window (backed by the usage-sweep job, not a live COUNT).
    const trendingRaw = await baseQb().orderBy('b.profileViews', 'DESC').take(10).getMany();

    // "Popular Near You" — proxy: highest savesCount. Real geo-distance
    // sorting needs a mapping/geo provider, deferred per BRD Section 11.
    const popularRaw = await baseQb().orderBy('b.savesCount', 'DESC').take(10).getMany();

    // "Upcoming Experiences" — joins the hosting business so cards can
    // show who's hosting, not just the experience title.
    const upcomingRaw = await this.experiences
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.business', 'business')
      .where('e.isExpired = false')
      .andWhere('e.startsAt > NOW()')
      .orderBy('e.startsAt', 'ASC')
      .take(10)
      .getMany();
    // .map() strips the full `business` relation object (leftJoinAndSelect
    // pulls it in purely so businessName can be read off it) down to just
    // businessName — spreading {...e} alone would have left the raw
    // `business` object attached wholesale, including owner-only fields
    // (profileViews, savesCount) and contact details (phone, email,
    // ownerId) on a public, unauthenticated endpoint.
    const upcoming = upcomingRaw.map((e) => {
      const { business, ...rest } = e;
      return { ...withBudgetFallback(rest, business), businessName: business?.name };
    });

    // Same treatment as GET /businesses: attach real rating aggregates,
    // and strip owner-only profileViews/savesCount from every card here
    // — the homepage is public browse, same as the list endpoint, so no
    // requester gets to see those regardless of who's logged in.
    const [trending, popular] = await Promise.all([
      this.businessService.attachRatingsAndStripMetrics(trendingRaw),
      this.businessService.attachRatingsAndStripMetrics(popularRaw),
    ]);

    // Hero photography drawn from live businesses (FR-1.3). Mostly a
    // simple heuristic (top trending businesses), but up to 2 of the 5
    // slots are reserved for the Featured/Premium tiers' "occasional
    // homepage featuring" perk — a random paid-tier business not
    // already earning its spot organically. Two SEPARATE random picks
    // (Premium-only, then either tier) rather than one random pick
    // across both tiers, so paying more for Premium visibly buys a
    // better chance at a feature, not an equal one. This is genuine
    // enforcement of what the tier card promises, not just a label —
    // see tier-limits.ts's extraFeatures comment.
    const organicHero = trending.slice(0, 3);
    const excludeIds = new Set(organicHero.map((b) => b.id));

    const pickRandomFeatured = async (tiers: SubscriptionTier[]) => {
      const qb = this.businesses.createQueryBuilder('b');
      this.businessService.applyListingFilters(qb, params);
      qb.andWhere('b.tier IN (:...tiers)', { tiers });
      if (excludeIds.size > 0) {
        qb.andWhere('b.id NOT IN (:...excludeIds)', { excludeIds: Array.from(excludeIds) });
      }
      qb.orderBy('RANDOM()').take(1);
      return qb.getOne();
    };

    const premiumPick = await pickRandomFeatured([SubscriptionTier.PREMIUM]);
    if (premiumPick) excludeIds.add(premiumPick.id);
    const eitherPick = await pickRandomFeatured([SubscriptionTier.PREMIUM, SubscriptionTier.GROWTH]);
    const featuredPicks = [premiumPick, eitherPick].filter((b): b is Business => Boolean(b));

    // Fill any remaining slots (if fewer than 2 paid-tier businesses
    // were available) from the rest of the organic trending list, so
    // the hero always has up to 5 entries when enough businesses exist.
    const fillerCount = Math.max(0, 5 - organicHero.length - featuredPicks.length);
    const fillerHero = trending.slice(3, 3 + fillerCount);

    const heroSource = [...organicHero, ...featuredPicks, ...fillerHero].map((b) => ({ id: b.id, name: b.name }));

    // Load quick filter groups from database (admin-configurable)
    const quickFilters = await this.quickFilterGroups.find({
      relations: ['categories'],
      order: { sortOrder: 'ASC' },
    });

    return {
      hero: { featured: heroSource },
      quickFilters: quickFilters.map((group) => ({
        id: group.id,
        label: group.label,
        icon: group.icon,
        // Category names, not just a count — the frontend needs these
        // to actually build the `?categories=` filter query when a chip
        // is clicked (see BusinessService.applyListingFilters' `&&`
        // overlap match). Previously only categoryCount was returned,
        // which meant the frontend still had to keep its own hardcoded
        // copy of every group's category list to make filtering work at
        // all — admin edits to a group's mapping never actually reached
        // the live homepage.
        categories: (group.categories || []).map((c) => c.name),
      })),
      rails: {
        trendingThisWeek: trending,
        popularNearYou: popular,
        upcomingExperiences: upcoming,
      },
    };
  }
}
