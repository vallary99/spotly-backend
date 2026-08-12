import { SetMetadata } from '@nestjs/common';

// Marks a route as accessible to Guests (BRD FR-6.1). All other routes
// require a valid JWT by default via the global JwtAuthGuard.
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
