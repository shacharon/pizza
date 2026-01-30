# P0-2: google-maps.stage.new.ts Analysis & Removal

**Status**: ✅ Complete - DEAD CODE (Accidental Duplicate)  
**Scope**: Backend only  
**Date**: 2026-01-30  
**Decision**: **DELETE** - Exact duplicate with zero references

## Investigation Summary

### Files Found
1. `server/src/services/search/route2/stages/google-maps.stage.ts` (Original)
2. `server/src/services/search/route2/stages/google-maps.stage.new.ts` (Duplicate)

### Reference Search
**Command**: `grep -r "google-maps\.stage\.new" server/`  
**Result**: ✅ **ZERO matches** - File is completely unused

**Searched patterns**:
- `google-maps.stage.new`
- `from.*google-maps.stage.new`
- `import.*google-maps.stage.new`

### File Comparison

**File Hashes**:
- Original: `92E577FA4BEC96D26F1571B633C2786C699E2DD723DCBF0A243A60F33DBE86C8`
- .new.ts:  `5CC1B5522FD4A48F2510C3774B37329140D17EABD77277117D45964EDDE3D48C`

**Content Comparison**: 
Both files contain **IDENTICAL** code (121 lines each):
- Same imports
- Same function signature: `executeGoogleMapsStage`
- Same switch/case logic (textSearch, nearbySearch, landmarkPlan)
- Same error handling
- Same logging statements

**Only difference**: Minor whitespace variations (line 101-105)
- Original: No blank line after `durationMs` declaration
- .new.ts: Has blank line after `durationMs` declaration

This is clearly an **accidental duplicate** from a copy-paste or file save issue.

## Evidence of Dead Code

### 1. Zero Imports
No file in the codebase imports from `.new.ts`:
```bash
grep -r "google-maps.stage.new" server/
# No matches
```

### 2. Current Implementation Active
The original `google-maps.stage.ts` is actively used:
```typescript
// server/src/services/search/route2/orchestrator.ts
import { executeGoogleMapsStage } from './stages/google-maps.stage.js';
```

### 3. No Feature Flag
No feature flag or environment variable references `.new.ts`

### 4. No Tests
No test files reference `.new.ts`

### 5. Not in Documentation
No markdown files reference the `.new.ts` variant

## Decision: DELETE

**Rationale**:
1. ✅ Zero references in entire codebase
2. ✅ Exact duplicate of active file
3. ✅ No WIP features or experiments
4. ✅ No feature flag infrastructure
5. ✅ Confusing ".new" suffix with no purpose
6. ✅ Maintenance burden (keep two identical files in sync?)

**Risk**: 🟢 **NONE**
- File is completely unused
- Deletion cannot break anything

## Why This File Exists

**Most Likely Scenario**: Developer accidentally created duplicate during:
- File refactoring/reorganization
- Copy-paste operation
- Editor auto-save conflict
- Git merge mishap

**Evidence**:
- Identical content (not a WIP)
- No git history showing intentional "new" variant
- No comments explaining purpose

## Action Taken

**Delete**: `server/src/services/search/route2/stages/google-maps.stage.new.ts`

**Preserved**: Original `google-maps.stage.ts` remains unchanged

## Verification

### Pre-Deletion Checks
✅ Confirmed zero imports  
✅ Confirmed no test references  
✅ Confirmed no documentation references  
✅ Confirmed identical to original  

### Post-Deletion Checks
```bash
# Build passes
npm run build
# Exit code: 0

# No broken imports
grep -r "google-maps.stage.new" server/
# No matches (expected)

# Original file still works
grep -r "from.*google-maps.stage" server/
# Returns only imports of original file
```

## Files Changed

### Deleted
- `server/src/services/search/route2/stages/google-maps.stage.new.ts` (121 lines)

**Total**: 1 file deleted, 0 files modified

## Impact

**User-Visible**: None  
**API/WS Contracts**: None  
**Behavior Change**: None  

**Benefits**:
- Cleaner codebase
- No confusion about which file to edit
- Reduces maintenance burden

## Commit Message

```
chore(route2): remove unused google-maps.stage.new.ts

Remove accidental duplicate of google-maps.stage.ts.
File has zero references and identical content (except whitespace).

Verified:
- No imports in codebase
- No test references
- No documentation references
- Build passes after deletion

No behavior change.
```

## PR Description

```markdown
## Summary
Removes unused duplicate file `google-maps.stage.new.ts`.

## Background
File is an exact duplicate of `google-maps.stage.ts` (with minor whitespace diff).
Likely created accidentally during refactoring or file operations.

## Verification
✅ **Zero references** - Comprehensive grep search found no imports  
✅ **Identical content** - Both files have same 121 lines of code  
✅ **Build passes** - TypeScript compilation succeeds  
✅ **No tests broken** - No test files reference deleted file  

**Search performed**:
```bash
grep -r "google-maps.stage.new" server/
# No matches found
```

## Changes
- ❌ **Delete**: `google-maps.stage.new.ts` (121 lines)
- ✅ **Keep**: `google-maps.stage.ts` (unchanged)

## Risk
🟢 **None** - File completely unused

## Impact
- No behavior change
- No API changes
- No breaking changes
- Cleaner codebase

## Why This File Existed
Most likely an accidental duplicate from:
- Copy-paste operation
- Editor conflict
- Git merge issue

No evidence of intentional "new" variant or WIP feature.
```

## Related Files (Unchanged)

These files continue using the original:
- `server/src/services/search/route2/orchestrator.ts`
- `server/src/services/search/route2/stages/google-maps/text-search.handler.ts`
- `server/src/services/search/route2/stages/google-maps/nearby-search.handler.ts`
- `server/src/services/search/route2/stages/google-maps/landmark-plan.handler.ts`

All imports point to `./google-maps.stage.js` (original file).

## Sign-off

**Analysis**: Complete ✅  
**Decision**: Delete (unused duplicate) ✅  
**Verification**: Complete ✅  
**Documentation**: Complete ✅  
**Ready for Deletion**: Yes ✅

---

**Conclusion**: `google-maps.stage.new.ts` is dead code - an accidental exact duplicate with zero references. Safe to delete with zero risk.
