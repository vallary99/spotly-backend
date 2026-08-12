import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../entities/payment.entity';

export interface TransactionFilters {
  status?: string;
  purpose?: string;
  businessId?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AdminTransactionsService {
  constructor(@InjectRepository(Payment) private payments: Repository<Payment>) {}

  // GET /admin/transactions — every payment attempt (not just successful
  // ones), so support/reconciliation can see failed and pending
  // attempts too, not a curated success-only view.
  async findAll(filters: TransactionFilters) {
    const qb = this.payments.createQueryBuilder('p').leftJoinAndSelect('p.business', 'business');

    if (filters.status) qb.andWhere('p.status = :status', { status: filters.status });
    if (filters.purpose) qb.andWhere('p.purpose = :purpose', { purpose: filters.purpose });
    if (filters.businessId) qb.andWhere('p.businessId = :businessId', { businessId: filters.businessId });
    if (filters.from) qb.andWhere('p."createdAt" >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('p."createdAt" <= :to', { to: filters.to });

    qb.orderBy('p.createdAt', 'DESC')
      .take(filters.limit ?? 50)
      .skip(filters.offset ?? 0);

    const [results, total] = await qb.getManyAndCount();

    // Summary of the CURRENT filtered set, not the whole table — so
    // "total collected" reflects whatever the admin is actually looking
    // at (e.g. this month's successful subscription payments), not a
    // permanently-fixed platform-wide number.
    const successTotal = results
      .filter((p) => p.status === 'SUCCESS')
      .reduce((sum, p) => sum + Number(p.amount), 0);

    return {
      total,
      successTotalAmount: successTotal,
      results: results.map((p) => ({
        id: p.id,
        businessId: p.businessId,
        businessName: p.business?.name,
        provider: p.provider,
        purpose: p.purpose,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        mpesaReceiptNumber: p.mpesaReceiptNumber,
        createdAt: p.createdAt,
      })),
    };
  }
}
