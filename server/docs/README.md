# Food Agent Documentation

**Last Updated:** November 22, 2025

---

## 📚 Documentation Index

### **Start Here** (For Tomorrow)

1. **[Session Summary](./session-summary-221122.md)** ⭐
   - What we did today
   - Current state
   - Tomorrow's plan
   - **READ THIS FIRST**

2. **[Architecture Spec](./food-agent-architecture.md)** 🏗️
   - Complete technical design
   - Data models (DTOs)
   - Module structure
   - API endpoints
   - **READ THIS SECOND**

3. **[Migration Plan](./migration-plan.md)** 🗺️
   - Phase-by-phase implementation
   - Current → Target mapping
   - Testing strategy
   - **FOLLOW THIS TO IMPLEMENT**

---

## 🎯 Quick Start (Tomorrow)

### For AI Assistant:
```
1. Read: session-summary-221122.md
2. Read: food-agent-architecture.md
3. Read: migration-plan.md (Phase 1, Day 1)
4. Execute: Create DTO files
```

### For Human Developer:
```bash
# 1. Review docs
cd server/docs
cat session-summary-221122.md
cat food-agent-architecture.md
cat migration-plan.md

# 2. Start Phase 1
# Tell Cursor: "Implement Phase 1, Day 1 from migration-plan.md"
```

---

## 📖 Document Descriptions

### Core Documents

#### `food-agent-architecture.md`
**Purpose:** Complete technical specification  
**Audience:** Developers, AI assistants  
**Contents:**
- Vision & scope
- High-level architecture (4-step orchestrator)
- Data models (FoodQueryDTO, RestaurantCandidate, etc.)
- Module structure
- API endpoints
- LLM vs Code responsibilities
- Performance targets

**When to read:** Before starting implementation

---

#### `migration-plan.md`
**Purpose:** Step-by-step implementation guide  
**Audience:** Developers, AI assistants  
**Contents:**
- Current state analysis
- What to keep, refactor, create
- 3-week phase-by-phase plan
- Testing strategy
- Rollback procedures
- Success criteria

**When to read:** When implementing each phase

---

#### `session-summary-221122.md`
**Purpose:** Daily progress log  
**Audience:** Future sessions, team members  
**Contents:**
- What we accomplished
- What works, what's broken
- Performance metrics
- Key decisions
- Tomorrow's plan

**When to read:** At the start of each session

---

### Historical Documents

#### `ongoing/` folder
Contains daily progress logs and specific feature documentation:
- `dialogue-context-fixes-221125.md` - Refinement query fixes
- `dialogue-two-call-implementation-221125.md` - Two-call LLM approach
- `dialogue-performance-phase1-221125.md` - Performance optimizations
- `dialogue-refinement-base-query-221125.md` - Base query tracking
- `dialogue-filters-to-query-221125.md` - Filter passthrough
- And more...

**When to read:** When debugging specific features

---

## 🎯 Current Status

### ✅ Completed
- Google Places integration
- Multi-language translation
- Intent detection (NEW vs REFINEMENT)
- Base query tracking
- Performance optimizations (25-42% faster)
- Architecture design
- Migration plan

### 🚧 In Progress
- None (ready to start Phase 1)

### 📋 Planned
- Phase 1: DTOs + Provider layer (Week 1)
- Phase 2: Core logic (Week 2)
- Phase 3: Integration (Week 3)

---

## 📊 Performance Metrics

| Metric | Before | Current | Target |
|--------|--------|---------|--------|
| Total time | 15-19s | 8-12s | 6-8s |
| LLM calls | 5-6 | 5 | 2 |
| Improvement | - | 25-42% | 60% |

---

## 🔑 Key Principles

1. **LLM is NOT a source of truth** - It's an orchestration brain
2. **LLM understands language, Code handles facts**
3. **Separate concerns** - Clear boundaries between layers
4. **Gradual migration** - Keep old code working
5. **Test everything** - Unit tests, integration tests, manual tests

---

## 🚀 Next Steps

### Tomorrow (Phase 1, Day 1):
```
1. Create dto/food-query.dto.ts
2. Create dto/restaurant.dto.ts
3. Create dto/search-session.dto.ts
4. Test: Compile successfully
```

### This Week (Phase 1):
```
Day 1-2: DTOs
Day 3-4: Provider layer
Day 5: Feature flag + new endpoint
```

### This Month (All Phases):
```
Week 1: Foundation (DTOs + Providers)
Week 2: Core logic (Parser + Orchestrator + Explainer)
Week 3: Integration (Wire everything + switch)
```

---

## 📞 Support

### Questions?
- Check `food-agent-architecture.md` for design decisions
- Check `migration-plan.md` for implementation steps
- Check `session-summary-221122.md` for context

### Issues?
- Document in `ongoing/` folder
- Update migration plan if needed
- Keep session summary current

---

## 🔗 External Resources

- [Google Places API](https://developers.google.com/maps/documentation/places/web-service)
- [OpenAI API](https://platform.openai.com/docs)
- [SOLID Principles](https://en.wikipedia.org/wiki/SOLID)
- [Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

---

**Happy Coding! 🚀**


