/**
 * Wolt entry path canonicalization.
 * For ENTRY paths (brand, restaurants, district, search) we fetch the page and resolve
 * to a canonical restaurant/venue URL via <link rel="canonical"> or first anchor with /restaurant/ or /venue/.
 */

import { logger } from '../../../../../lib/logger/structured-logger.js';
import { fetchWithTimeout } from '../../../../../utils/fetch-with-timeout.js';

const WOLT_CANONICALIZE_TIMEOUT_MS = 3000;
const WOLT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Returns true if the URL path is an ENTRY path that needs canonicalization
 * (brand, restaurants, district, search) — not already a direct restaurant/venue page.
 */
export function isWoltEntryPath(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (!path.includes('/en/isr/') && !path.includes('/he/isr/')) return false;
    if (path.includes('/restaurant/') || path.includes('/venue/')) return false;
    return (
      path.includes('/brand/') ||
      path.includes('/restaurants') ||
      path.includes('/district/') ||
      path.includes('/search')
    );
  } catch {
    return false;
  }
}

/**
 * Fetch HTML and extract first canonical restaurant/venue URL from:
 * - <link rel="canonical" href="..."> (if href contains /restaurant/ or /venue/)
 * - or first <a href="..."> containing /restaurant/ or /venue/
 * Returns absolute URL or null. Max 3s, user-agent set.
 */
export async function resolveWoltEntryToRestaurantUrl(
  entryUrl: string,
  signal?: AbortSignal
): Promise<string | null> {
  const fromPath = (() => {
    try {
      return new URL(entryUrl).pathname;
    } catch {
      return entryUrl;
    }
  })();

  try {
    const response = await fetchWithTimeout(
      entryUrl,
      {
        method: 'GET',
        headers: {
          'User-Agent': WOLT_USER_AGENT,
          Accept: 'text/html',
        },
      },
      {
        timeoutMs: WOLT_CANONICALIZE_TIMEOUT_MS,
        provider: 'wolt',
        stage: 'wolt_entry_canonicalize',
        signal,
      }
    );

    if (!response.ok) {
      logger.info(
        {
          event: 'wolt_entry_canonicalize_failed',
          fromPath,
          status: response.status,
        },
        '[WoltEntryCanonicalizer] Fetch failed'
      );
      return null;
    }

    const html = await response.text();
    const baseUrl = entryUrl.replace(/#.*$/, '').replace(/\?.*$/, '');
    const base = new URL(baseUrl);

    // 1) <link rel="canonical" href="..."> (canonical must point to restaurant/venue)
    const canonicalMatch = html.match(
      /<link[^>]*\srel=["']canonical["'][^>]*\shref=["']([^"']+)["']/i
    ) || html.match(
      /<link[^>]*\shref=["']([^"']+)["'][^>]*\srel=["']canonical["']/i
    );
    if (canonicalMatch) {
      const href = canonicalMatch[1].trim();
      const absolute = resolveUrl(href, base);
      if (absolute && (absolute.includes('/restaurant/') || absolute.includes('/venue/'))) {
        const toPath = new URL(absolute).pathname;
        logger.info(
          { event: 'wolt_entry_canonicalized', fromPath, toPath },
          '[WoltEntryCanonicalizer] Resolved via canonical'
        );
        return absolute;
      }
    }

    // 2) First <a href="..."> containing /restaurant/ or /venue/
    const anchorRegex = /<a[^>]*\shref=["']([^"']+)["']/gi;
    let match: RegExpExecArray | null;
    while ((match = anchorRegex.exec(html)) !== null) {
      const href = match[1].trim();
      if (href.includes('/restaurant/') || href.includes('/venue/')) {
        const absolute = resolveUrl(href, base);
        if (absolute && isWoltRestaurantOrVenueUrl(absolute)) {
          const toPath = new URL(absolute).pathname;
          logger.info(
            { event: 'wolt_entry_canonicalized', fromPath, toPath },
            '[WoltEntryCanonicalizer] Resolved via first restaurant/venue link'
          );
          return absolute;
        }
      }
    }

    logger.info(
      { event: 'wolt_entry_canonicalize_failed', fromPath, reason: 'entry_no_canonical' },
      '[WoltEntryCanonicalizer] No canonical or restaurant/venue link found'
    );
    return null;
  } catch (err) {
    logger.info(
      {
        event: 'wolt_entry_canonicalize_failed',
        fromPath,
        error: err instanceof Error ? err.message : String(err),
      },
      '[WoltEntryCanonicalizer] Request error'
    );
    return null;
  }
}

function resolveUrl(href: string, base: URL): string | null {
  try {
    if (/^https?:\/\//i.test(href)) return href;
    const u = new URL(href, base.origin);
    return u.href;
  } catch {
    return null;
  }
}

function isWoltRestaurantOrVenueUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host !== 'wolt.com' && !host.endsWith('.wolt.com')) return false;
    const path = new URL(url).pathname.toLowerCase();
    return path.includes('/restaurant/') || path.includes('/venue/');
  } catch {
    return false;
  }
}
