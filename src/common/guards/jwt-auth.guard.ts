import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// Applied globally in AppModule (NFR-7: JWT auth + role-based guards).
// Routes marked @Public() (guest browsing, search, business/experience
// details, reviews read) skip the token requirement entirely.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Always let Passport attempt to verify a token if one was sent —
    // for both public and protected routes. The distinction lives
    // entirely in handleRequest() below: it throws for protected routes
    // with no/invalid user, but quietly returns null for public routes,
    // which is what lets an optional token still populate request.user
    // on a @Public() route (e.g. GET /businesses/:id showing
    // owner-only fields when the requester happens to be logged in).
    //
    // (A previous version of this guard short-circuited with
    // `return true` for public routes before Passport ran at all, which
    // meant request.user was NEVER populated even with a valid token —
    // fixed here.)
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // For public routes, don't throw if there's no/invalid token — just
    // proceed as a guest (request.user stays undefined).
    if (isPublic && !user) {
      return null;
    }
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required.');
    }
    return user;
  }
}
