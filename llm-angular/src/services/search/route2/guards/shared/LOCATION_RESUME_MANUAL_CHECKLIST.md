# Missing-location auto-resume – manual flow checklist

Use this checklist to verify the flow end-to-end (browser, no location permission yet).

---

## Prerequisites

- Browser with location permission **not** yet granted for the site (or reset permission for the origin).
- App loaded on the search page.

---

## Steps

### 1. Search with food only, no city, no permission

- [ ] In the search box, type a **food-only** query (e.g. `pizza`, `sushi`, `בורגרים`).
- [ ] Do **not** include a city or area.
- [ ] Submit search (Enter or search button).
- [ ] **Expected:** First request is sent **without** location (no permission yet).

---

### 2. Verify permission flow starts immediately

- [ ] **Expected:** Browser location permission prompt appears shortly after the first response (no need to type again).
- [ ] **Expected:** UI shows a short hint like “Using your location to search…” while waiting.
- [ ] **Expected:** Hero area may show “Getting location…” or similar.
- [ ] Do **not** approve or deny yet for this step; only confirm the prompt appeared.

---

### 3. Approve permission

- [ ] In the browser prompt, choose **Allow** (or equivalent).
- [ ] **Expected:** Permission prompt closes and the app continues without further action.

---

### 4. Verify same query resumes automatically

- [ ] **Expected:** The **same** query (e.g. `pizza`) is used automatically; the search input still shows it.
- [ ] **Expected:** A **second** request is sent **with** location (userLocation in the request).
- [ ] **Expected:** Results (or “no results”) appear for that query without the user retyping or submitting again.

---

### 5. Repeat and deny permission

- [ ] Clear or reset location permission for the site (e.g. site settings → Location → Block, or use an incognito window).
- [ ] Search again with a **food-only** query (e.g. `pasta`).
- [ ] When the browser location prompt appears, choose **Block** (or equivalent).

---

### 6. Verify fallback asks for city/area

- [ ] **Expected:** No second automatic request; only one search request was sent.
- [ ] **Expected:** UI shows a fallback message asking for city/area (e.g. “Add a city or area above to search.”).
- [ ] **Expected:** Hero or status shows that location was denied (e.g. “Location access denied”).
- [ ] **Expected:** The query you typed (e.g. `pasta`) is still in the search box; user can add a city (e.g. `pasta Tel Aviv`) and search again.

---

### 7. Verify no duplicate requests in logs

- [ ] Open DevTools → Console (and Network tab if desired).
- [ ] Filter or look for facade logs: `gate_missing_location_detected`, `location_permission_requested`, `location_permission_granted` or `location_permission_denied`, `auto_resume_started`.
- [ ] **Expected (approve flow):** One `gate_missing_location_detected`, one `location_permission_requested`, one `location_permission_granted`, one `auto_resume_started`. No duplicate `location_permission_requested` for the same request.
- [ ] **Expected (deny flow):** One `gate_missing_location_detected`, one `location_permission_requested`, one `location_permission_denied`. No `auto_resume_started`, no second search request.
- [ ] **Expected:** If the same response is delivered twice (e.g. WS + poll), at most one “Auto-resume already pending for this request” and still only one permission request.

---

## Quick reference – expected log sequence

| Flow   | Logs in order |
|--------|----------------|
| Approve | `gate_missing_location_detected` → `location_permission_requested` → `location_permission_granted` → `auto_resume_started` |
| Deny   | `gate_missing_location_detected` → `location_permission_requested` → `location_permission_denied` |
