import type { Request } from 'express';

/**
 * Client IP from ALB/proxy X-Forwarded-For, else the socket address.
 */
export function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    const first = String(forwarded[0]).split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress || undefined;
}
