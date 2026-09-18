import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, SubscriptionTier } from '../business/entities/business.entity';
import { Experience } from '../experience/entities/experience.entity';
import { Offer } from '../business/entities/offer.entity';
import { QuickFilterGroup } from '../business/entities/quick-filter-group.entity';
import { BusinessService } from '../business/business.service';
import { OfferService } from '../business/offer.service';
import { withBudgetFallback } from '../experience/experience.util';

@Injectable()
export class HomeService {
  constructor(
    @InjectRepository(Business) private businesses: Repository<Business>,
    @InjectRepository(Experience) private experiences: Repository<Experience>,
    @InjectRepository(Offer) private offers: Repository<Offer>,
    @InjectRepository(QuickFilterGroup) private quickFilterGroups: Repository<QuickFilterGroup>,
    private businessService: BusinessService,
    private offerService: OfferService,
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
      // Made in Kenya never surfaces here — Spot It and Popular This
      // Month stay pure entertainment/venue discovery; it gets its own
      // dedicated rail below instead (Val, Sep 2026: "the other rails
      // only remain for entertainment discovery"). Still fully
      // reachable through ordinary search/browse (GET /businesses),
      // which doesn't call this particular baseQb.
      qb.andWhere(`b.type != 'MADE_IN_KENYA'`);
      return qb;
    };

    // "Trending This Week" — proxy: highest profileViews this rolling
    // window (backed by the usage-sweep job, not a live COUNT).
    const trendingRaw = await baseQb().orderBy('b.profileViews', 'DESC').take(10).getMany();

    // "Popular This Month" (frontend label — Val, Sep 2026 renamed it
    // from "Popular Near You", which never actually filtered by
    // distance at all) — sorted by savesCount, backed by the same
    // rolling 30-day usage-sweep window as profileViews above. Real
    // proximity-based sorting now exists too, but as a genuinely
    // separate thing — the homepage's "Nearby" toggle, using real
    // device location (see app/page.tsx's sortByNearby).
    const popularRaw = await baseQb().orderBy('b.savesCount', 'DESC').take(10).getMany();

    // "Upcoming Experiences" — joins the hosting business so cards can
    // show who's hosting, not just the experience title.
    // Quick filters/category selection now reach this rail too (Val,
    // Sep 2026: "quick filters don't touch events" was a real gap —
    // every other rail already ran through applyListingFilters, this
    // one just never got the same treatment). Filters on the JOINED
    // business's own categories, since an Experience has no category
    // of its own — it inherits whatever its business is tagged with.
    // Same ANY-match / array-overlap logic as applyListingFilters,
    // just written directly here since this query's base entity is
    // Experience, not Business.
    const upcomingQb = this.experiences
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.business', 'business')
      .where('e.isExpired = false')
      .andWhere('e.startsAt > NOW()');
    if (params.category) upcomingQb.andWhere(':c = ANY(business.categories)', { c: params.category });
    if (params.categories) {
      const list = params.categories.split(',').map((c) => c.trim()).filter(Boolean);
      if (list.length > 0) upcomingQb.andWhere('business.categories && :cats', { cats: list });
    }
    const upcomingRaw = await upcomingQb.orderBy('e.startsAt', 'ASC').take(10).getMany();
    // .map() strips the full `business` relation object (leftJoinAndSelect
    // pulls it in purely so businessName can be read off it) down to just
    // businessName — spreading {...e} alone would have left the raw
    // `business` object attached wholesale, including owner-only fields
    // (profileViews, savesCount) and contact details (phone, email,
    // ownerId) on a public, unauthenticated endpoint.
    const upcoming = upcomingRaw.map((e) => {
      const { business, ...rest } = e;
      return { ...withBudgetFallback(rest, business), businessName: business?.name, businessSlug: business?.slug, businessCity: business?.city };
    });

    // "Made in Kenya" — one simple combined rail across all five
    // categories for this first version (Val, Sep 2026), not a
    // category-by-category browser. Business cards, not product cards —
    // revised from an earlier product-based version once it turned out
    // "products replace the business entirely" was the wrong mental
    // model; clicking through goes to the business's own normal profile
    // page (with its extra Catalogue tab), exactly like any other
    // business card. Reuses the same applyListingFilters as
    // trending/popular (the 5-photo threshold, city/category filters),
    // just scoped TO this one type instead of excluding it.
    const madeInKenyaQb = this.businesses.createQueryBuilder('b');
    this.businessService.applyListingFilters(madeInKenyaQb, params);
    madeInKenyaQb.andWhere(`b.type = 'MADE_IN_KENYA'`).orderBy('b.createdAt', 'DESC').take(10);
    const madeInKenyaRaw = await madeInKenyaQb.getMany();
    const madeInKenya = await this.businessService.attachRatingsAndStripMetrics(madeInKenyaRaw);

    // "Offers" — currently running or upcoming deals (Val, Sep 2026),
    // soonest-starting first. No approved-photo/visibility gate here
    // beyond the join itself — an offer from a business that isn't yet
    // publicly discoverable (no approved photo, or a still-pending
    // Made in Kenya application) shouldn't surface on the homepage
    // either, so this explicitly joins back to businesses and reuses
    // the same applyListingFilters used by every other rail.
    const offersQb = this.offers.createQueryBuilder('o').leftJoinAndSelect('o.business', 'b');
    this.businessService.applyListingFilters(offersQb as any, params);
    this.offerService.applyActiveOrUpcomingFilter(offersQb, 'o');
    offersQb.orderBy('o.startDate', 'ASC').take(10);
    const offersRaw = await offersQb.getMany();
    const offers = offersRaw.map((o) => {
      const { business, ...rest } = o;
      return { ...rest, businessName: business?.name, businessId: business?.id };
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
        madeInKenya,
        offers,
      },
    };
  }
}
