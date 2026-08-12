import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import type { Response } from 'express';

// Every route that takes an :id and queries a uuid-typed column (which
// is most of this API — businesses, experiences, reviews, media,
// payments, everything) shares one failure mode: Postgres itself
// rejects a malformed UUID (a stale bookmark, a bot probing URLs, a
// typo) with "invalid input syntax for type uuid," which TypeORM
// surfaces as a raw QueryFailedError — and without this filter, that
// becomes an unhandled 500 with no useful message, for every single one
// of those routes independently. Rather than add a manual UUID check to
// each one, this catches Postgres's specific error code (22P02) globally
// and turns it into the same clean 404 a genuinely-missing-but-validly-
// formatted id would already get.
@Catch(QueryFailedError)
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  catch(exception: QueryFailedError & { code?: string }, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception.code === '22P02') {
      // Postgres's "invalid text representation" — covers malformed
      // UUIDs and similar type-mismatch input, always caused by bad
      // client input, never a real server fault.
      return response.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Not found.',
        error: 'Not Found',
      });
    }

    // Anything else genuinely is an unexpected database error — log it
    // properly and still return 500, rather than silently swallowing a
    // real problem just because it happened to be a QueryFailedError.
    this.logger.error(exception.message, exception.stack);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
