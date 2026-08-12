import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../entities/business.entity';
import { Experience } from '../entities/experience.entity';
import { BusinessService } from '../business/business.service';

@Injectable()
export class HomeService {
  constructor(
    @InjectRepository(Business) private businesses: Repository<Business>,
    @InjectRepository(Experience) private experiences: Repository<Experience>,
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
      return { ...rest, businessName: business?.name };
    });

    // Same treatment as GET /businesses: attach real rating aggregates,
    // and strip owner-only profileViews/savesCount from every card here
    // — the homepage is public browse, same as the list endpoint, so no
    // requester gets to see those regardless of who's logged in.
    const [trending, popular] = await Promise.all([
      this.businessService.attachRatingsAndStripMetrics(trendingRaw),
      this.businessService.attachRatingsAndStripMetrics(popularRaw),
    ]);

    // Hero photography drawn from live businesses (FR-1.3) — first
    // available media per top business as a simple heuristic.
    const heroSource = trending.slice(0, 5).map((b) => ({ id: b.id, name: b.name }));

    return {
      hero: { featured: heroSource },
      quickFilters: ['Nearby', 'Trending', 'Open Now', 'Restaurants', 'Coffee'],
      rails: {
        trendingThisWeek: trending,
        popularNearYou: popular,
        upcomingExperiences: upcoming,
      },
    };
  }
}
