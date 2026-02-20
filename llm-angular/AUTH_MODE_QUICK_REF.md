# Auth Mode Quick Reference Card

## Switch Mode in 3 Steps

### To Cookie-Only Mode

```typescript
// 1. Edit: src/environments/environment.ts
authMode: 'cookie_only'

// 2. Restart
npm start

// 3. Verify console logs
[Auth] AUTH_MODE=cookie_only - skipping JWT
```

### Back to Dual Mode

```typescript
// 1. Edit: src/environments/environment.ts
authMode: 'dual'

// 2. Restart
npm start

// 3. Verify headers sent
Authorization: Bearer ...
```

---

## What Gets Sent

| Mode | Authorization | x-session-id | Cookie |
|------|--------------|--------------|--------|
| dual | ✅ | ✅ | ✅ |
| cookie_only | ❌ | ❌ | ✅ |

---

## Quick Verify

### Check Console Logs

```bash
# Cookie-only mode:
[Auth] AUTH_MODE=cookie_only - skipping JWT
[Session] AUTH_MODE=cookie_only - skipping x-session-id header

# Dual mode:
(no special logs)
```

### Check Network Tab

```http
# Cookie-only mode:
Cookie: session=xyz...
(no Authorization, no x-session-id)

# Dual mode:
Authorization: Bearer eyJ...
x-session-id: sess_...
Cookie: session=xyz...
```

---

## Files to Edit

**Only need to edit ONE file**:
```
src/environments/environment.ts
```

Change line ~16:
```typescript
authMode: 'dual' // or 'cookie_only'
```

---

## Test Checklist

- [ ] Edit environment file
- [ ] Restart server
- [ ] Check console for mode logs
- [ ] Open Network tab
- [ ] Make API request
- [ ] Verify headers match mode
- [ ] Clear cookies
- [ ] Make request → auto-bootstrap
- [ ] Verify cookie-only auth works

---

## Troubleshooting

### Still seeing JWT in cookie_only?

1. Did you restart server after editing?
2. Check console for mode log
3. Hard refresh browser (Ctrl+Shift+R)

### 401 errors?

1. Clear all cookies
2. Make request
3. Should auto-bootstrap
4. Check Set-Cookie in response

---

## Documentation

- `AUTH_MODE_GUIDE.md` - Full guide
- `AUTH_MODE_COMPARISON.md` - Visual comparison
- `AUTH_MODE_IMPLEMENTATION.md` - Technical details
- `AUTH_MODE_COMPLETE.md` - Executive summary
- `AUTH_MODE_QUICK_REF.md` - This card

---

**Default**: `dual` (no breaking changes)  
**Toggle**: Edit 1 line + restart  
**Reversible**: Yes (JWT code intact)
