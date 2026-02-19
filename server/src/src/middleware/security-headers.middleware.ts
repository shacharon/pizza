/**
 * Security Headers Middleware
 * 
 * Sets production security headers:
 * - HSTS (Strict-Transport-Security) for HTTPS enforcement
 * 
 * Note: This middleware assumes HTTPS termination happens at the ALB.
 * The backend does not need to run HTTPS directly.
 */

import { Request, Response, NextFunction } from 'express';

export function securityHeadersMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // HSTS: Force HTTPS for 1 year, include subdomains
  // Only apply in production (ALB terminates HTTPS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  /**
   * Cookie Security Note:
   * Currently, this application does not set cookies.
   * 
   * If cookies are added in the future (e.g., session cookies):
   * - Set `Secure` flag when NODE_ENV=production
   * - Set `HttpOnly` flag to prevent XSS
   * - Set `SameSite=Strict` or `SameSite=Lax` as appropriate
   * 
   * Example:
   *   res.cookie('sessionId', value, {
   *     secure: process.env.NODE_ENV === 'production',
   *     httpOnly: true,
   *     sameSite: 'strict',
   *   });
   */

  next();
}
