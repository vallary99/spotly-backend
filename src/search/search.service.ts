import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../business/entities/business.entity';
import { Experience } from '../experience/entities/experience.entity';

// The tsvector expression here has to stay in sync with the one in
// migration AddBusinessSearchIndex — same weighting, same columns —
// otherwise Postgres can't use the GIN index for this query and falls
// back to a full table scan.
const SEARCH_VECTOR_SQL = `(
  setweight(to_tsvector('english', coalesce(b.name, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(b.category, '')), 'B') ||
  setweight(to_tsvector('english', coalesce(b.description, '')), 'C')
)`;

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Business) private businesses: Repository<Business>,
    @InjectRepository(Experience) private experiences: Repository<Experience>,
  ) {}

  // GET /search?q= — FR-2.1: basic autocomplete against business names
  // AND category, now genuinely including description too (previously
  // only name/category were ever searched — description was collected
  // at registration and then never actually used for anything). Ranked
  // full-text search via Postgres's own tsvector/GIN index rather than
  // ILIKE, so "acoustic music" matches a business whose description
  // mentions it even when neither the name nor category do, and a name
  // match still ranks above a description-only match (weights A/B/C).
  async autocomplete(q: string) {
    if (!q || q.trim().length === 0) {
      return { businesses: [], experiences: [] };
    }
    // Raw to_tsquery syntax treats &, |, !, (, ), :, *, ', " as query
    // OPERATORS, not literal characters — an unescaped one in ordinary
    // user input (e.g. searching "fish & chips") throws a real Postgres
    // syntax error, not a graceful empty result. Strip anything that
    // isn't alphanumeric from each word before building the query, so
    // there's nothing left that could ever be misparsed as an operator.
    const words = q
      .trim()
      .split(/\s+/)
      .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
      .filter((word) => word.length > 0);
    if (words.length === 0) {
      return { businesses: [], experiences: [] };
    }
    const tsQuery = words.map((word) => `${word}:*`).join(' & '); // prefix matching, so "acoust" matches "acoustic" while typing

    const [businesses, experiences] = await Promise.all([
      this.businesses
        .createQueryBuilder('b')
        .where(`${SEARCH_VECTOR_SQL} @@ to_tsquery('english', :tsQuery)`, { tsQuery })
        .orderBy(`ts_rank(${SEARCH_VECTOR_SQL}, to_tsquery('english', :tsQuery))`, 'DESC')
        .take(8)
        .getMany(),
      this.experiences
        .createQueryBuilder('e')
        .where('e.title ILIKE :q', { q: `%${q}%` })
        .andWhere('e.isExpired = false')
        .take(8)
        .getMany(),
    ]);
    return {
      businesses: businesses.map((b) => ({ id: b.id, name: b.name, category: b.category })),
      experiences: experiences.map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt })),
    };
  }
}
