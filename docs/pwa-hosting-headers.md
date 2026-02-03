# PWA Hosting Headers Configuration

This document provides the required HTTP headers for hosting the Piza Angular PWA on AWS Amplify or CloudFront.

## Overview

The Angular app is now a Progressive Web App (PWA) with service worker support enabled in production builds. Proper HTTP caching headers are critical to ensure:

1. **App shell files** (index.html, service worker) are always fresh
2. **Hashed bundles** (JS/CSS with content hashes) are cached long-term
3. **Service worker** can detect updates correctly

## Required Headers by File Type

### 1. index.html (App Shell)

**Critical**: Must not be cached by CDN or browser

```
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
```

**Why**: The index.html is the entry point. If cached, users won't get updates. The service worker handles offline support.

### 2. Service Worker Files

Files: `ngsw-worker.js`, `ngsw.json`, `safety-worker.js`

```
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
```

**Why**: Service worker files must always be fresh so the browser can detect updates. If cached, the PWA won't update properly.

### 3. Hashed JavaScript & CSS Bundles

Files: `*.js`, `*.css` (except service worker files)

```
Cache-Control: public, max-age=31536000, immutable
```

**Why**: These files have content hashes in their names (e.g., `main-VOOGDJMM.js`). They never change. Safe to cache forever.

### 4. manifest.webmanifest

```
Cache-Control: public, max-age=3600
```

**Why**: The manifest can be cached briefly. Changes are infrequent but should propagate within an hour.

### 5. Icons & Static Assets

Files: `*.png`, `*.svg`, `*.ico`, `/assets/**`

```
Cache-Control: public, max-age=604800
```

**Why**: Icons and static assets change infrequently. Cache for 7 days (604800 seconds).

## Implementation Options

### Option A: AWS Amplify (amplify.yml)

If using AWS Amplify, add these custom headers to your `amplify.yml`:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd llm-angular
        - npm ci
    build:
      commands:
        - npm run build:prod
  artifacts:
    baseDirectory: llm-angular/dist/llm-angular/browser
    files:
      - "**/*"
  cache:
    paths:
      - llm-angular/node_modules/**/*
customHeaders:
  - pattern: "/index.html"
    headers:
      - key: "Cache-Control"
        value: "no-cache, no-store, must-revalidate"
      - key: "Pragma"
        value: "no-cache"
      - key: "Expires"
        value: "0"
  - pattern: "/ngsw-worker.js"
    headers:
      - key: "Cache-Control"
        value: "no-cache, no-store, must-revalidate"
  - pattern: "/ngsw.json"
    headers:
      - key: "Cache-Control"
        value: "no-cache, no-store, must-revalidate"
  - pattern: "/safety-worker.js"
    headers:
      - key: "Cache-Control"
        value: "no-cache, no-store, must-revalidate"
  - pattern: "**/*.js"
    headers:
      - key: "Cache-Control"
        value: "public, max-age=31536000, immutable"
  - pattern: "**/*.css"
    headers:
      - key: "Cache-Control"
        value: "public, max-age=31536000, immutable"
  - pattern: "/manifest.webmanifest"
    headers:
      - key: "Cache-Control"
        value: "public, max-age=3600"
  - pattern: "**/*.png"
    headers:
      - key: "Cache-Control"
        value: "public, max-age=604800"
  - pattern: "**/*.svg"
    headers:
      - key: "Cache-Control"
        value: "public, max-age=604800"
  - pattern: "**/*.ico"
    headers:
      - key: "Cache-Control"
        value: "public, max-age=604800"
```

**Note**: Amplify applies headers in order. More specific patterns (like `/ngsw-worker.js`) should come before wildcard patterns (like `**/*.js`).

### Option B: CloudFront (Lambda@Edge or Response Headers Policy)

#### Using CloudFront Response Headers Policy

1. Create a custom Response Headers Policy in CloudFront console
2. Add custom headers for each file pattern
3. Attach to CloudFront distribution behavior

#### Using Lambda@Edge (Origin Response)

```javascript
exports.handler = async (event) => {
  const response = event.Records[0].cf.response;
  const uri = event.Records[0].cf.request.uri;
  const headers = response.headers;

  // Service worker files and index.html: no cache
  if (
    uri === "/index.html" ||
    uri === "/ngsw-worker.js" ||
    uri === "/ngsw.json" ||
    uri === "/safety-worker.js"
  ) {
    headers["cache-control"] = [
      {
        key: "Cache-Control",
        value: "no-cache, no-store, must-revalidate",
      },
    ];
    headers["pragma"] = [{ key: "Pragma", value: "no-cache" }];
    headers["expires"] = [{ key: "Expires", value: "0" }];
  }
  // Manifest: short cache
  else if (uri === "/manifest.webmanifest") {
    headers["cache-control"] = [
      {
        key: "Cache-Control",
        value: "public, max-age=3600",
      },
    ];
  }
  // Hashed bundles: long cache
  else if (uri.match(/\.(js|css)$/)) {
    headers["cache-control"] = [
      {
        key: "Cache-Control",
        value: "public, max-age=31536000, immutable",
      },
    ];
  }
  // Static assets: medium cache
  else if (uri.match(/\.(png|svg|ico|jpg|jpeg|webp)$/)) {
    headers["cache-control"] = [
      {
        key: "Cache-Control",
        value: "public, max-age=604800",
      },
    ];
  }

  return response;
};
```

## Testing

### Local Testing (HTTPS Required for PWA)

PWA service workers require HTTPS. Options for local testing:

1. **Use http-server with local SSL**:

   ```bash
   npm install -g http-server
   cd llm-angular/dist/llm-angular/browser
   http-server -S -C cert.pem -K key.pem -p 8443
   ```

2. **Use ngrok**:

   ```bash
   npm install -g http-server
   cd llm-angular/dist/llm-angular/browser
   http-server -p 8080
   # In another terminal:
   ngrok http 8080
   ```

3. **Chrome localhost exception**: Chrome treats `localhost` as secure, so you can test on `http://localhost` without SSL.

### Chrome DevTools Verification

1. **Service Worker Registration**:

   - Open DevTools → Application tab → Service Workers
   - Verify `ngsw-worker.js` is registered and activated
   - Status should be "activated and running"

2. **Manifest**:

   - Open DevTools → Application tab → Manifest
   - Verify name, icons, theme color are correct
   - Check for any warnings

3. **Cache Storage**:

   - Open DevTools → Application tab → Cache Storage
   - Verify `ngsw:llm-angular:cache:app` contains app shell files
   - Verify `ngsw:llm-angular:cache:assets` contains icons

4. **Install Prompt**:

   - On a production HTTPS site, Chrome will show an install prompt
   - Or use DevTools → Application → Manifest → "Add to homescreen"

5. **Offline Test**:
   - Open the app
   - Open DevTools → Network tab → Check "Offline"
   - Refresh the page
   - App shell should load (but API calls will fail, which is expected)

### Header Verification

Use browser DevTools Network tab or curl to verify headers:

```bash
# Check index.html headers (should have no-cache)
curl -I https://your-domain.com/index.html

# Check hashed bundle headers (should have max-age=31536000)
curl -I https://your-domain.com/main-VOOGDJMM.js

# Check service worker headers (should have no-cache)
curl -I https://your-domain.com/ngsw-worker.js
```

## QA Checklist

Before deploying to production:

- [ ] Build completes successfully (`npm run build:prod`)
- [ ] `dist/llm-angular/browser` contains:
  - [ ] `ngsw-worker.js`
  - [ ] `ngsw.json`
  - [ ] `manifest.webmanifest`
  - [ ] Icons in `/icons/` directory
- [ ] Service worker registered in Chrome DevTools (Application → Service Workers)
- [ ] Manifest valid in Chrome DevTools (Application → Manifest)
- [ ] Install prompt appears (or can be triggered via DevTools)
- [ ] Offline: App shell loads (navigation works)
- [ ] Offline: API calls fail gracefully (expected behavior)
- [ ] Online: App updates when new version deployed (check service worker update)
- [ ] Headers verified:
  - [ ] `index.html`: `Cache-Control: no-cache`
  - [ ] `ngsw-worker.js`: `Cache-Control: no-cache`
  - [ ] Hashed bundles: `Cache-Control: public, max-age=31536000, immutable`

## API Caching - DO NOT DO THIS

**Important**: The current configuration intentionally does NOT cache API calls. This is correct for Piza's search flow because:

1. Search results are personalized and volatile
2. "One search = one result pool" invariant must be maintained
3. WebSocket flows require fresh data

If you ever need to add API caching (for read-only, non-personalized endpoints):

1. Add a `dataGroups` entry to `ngsw-config.json`
2. Use `freshness` strategy with short `maxAge` (e.g., 5 minutes)
3. Explicitly whitelist only safe endpoints
4. Test thoroughly to ensure correctness

Example (DO NOT USE without careful consideration):

```json
{
  "dataGroups": [
    {
      "name": "api-safe-readonly",
      "urls": ["/api/v1/config/languages"],
      "cacheConfig": {
        "strategy": "freshness",
        "maxAge": "5m",
        "timeout": "3s"
      }
    }
  ]
}
```

## Troubleshooting

### Service Worker Not Registering

- Check browser console for errors
- Verify `isDevMode()` returns `false` (production build)
- Ensure HTTPS (or localhost)
- Check `ngsw-worker.js` exists in dist output

### App Not Updating

- Check `ngsw-worker.js` and `ngsw.json` headers (must be no-cache)
- Service worker checks for updates on navigation
- Force update: DevTools → Application → Service Workers → "Update"
- Clear cache and hard reload if stuck

### Install Prompt Not Showing

- Must be HTTPS
- Must meet PWA installability criteria (manifest, service worker, icons)
- Chrome only shows prompt if user hasn't dismissed it recently
- Use DevTools → Application → Manifest → "Add to homescreen" to test

### Icons Not Loading

- Check `/icons/` directory exists in dist output
- Verify manifest icon paths are correct (relative to root)
- Check 192x192 and 512x512 icons exist (required sizes)

## References

- [Angular Service Worker Guide](https://angular.dev/ecosystem/service-workers)
- [PWA Checklist](https://web.dev/pwa-checklist/)
- [Service Worker Lifecycle](https://web.dev/service-worker-lifecycle/)
- [AWS Amplify Custom Headers](https://docs.aws.amazon.com/amplify/latest/userguide/custom-headers.html)
- [CloudFront Response Headers Policy](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/adding-response-headers.html)
