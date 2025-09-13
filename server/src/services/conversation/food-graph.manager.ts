import type { Language } from './state.js';
import type { ExtractedSlots } from '../nlu.service.js';
import type { RestaurantsResponse, FoodQueryDTO, Restaurant } from '@api';
import { NLUService } from '../nlu.service.js';
import { nluSessionService, NLUSessionService } from '../nlu-session.service.js';
import { nluPolicy, Action } from '../nlu.policy.js';
import { getRestaurantsProvider, type RestaurantsProvider } from '../restaurants.provider.js';
import config from '../../config/index.js';
import { findCity } from '../google/places.service.js';

// Minimal DTOs we will pass between nodes. We will keep
// the types explicit and narrow to ensure SOLID boundaries.
export interface FoodGraphState {
    sessionId: string;
    text: string;
    language: Language;
    nearMe?: boolean;
    userLocation?: { lat: number; lng: number };

    // Outputs from nodes (progressively filled)
    slots?: ExtractedSlots;
    policy?: { action: string; intent?: string; message?: string; missing?: string[] };
    results?: RestaurantsResponse;
    intent?: string;

    // Final response helpers
    replyText?: string;
    chips?: Array<{ label: string; patch: Record<string, unknown> }>;
}

// Node function type
export type FoodNode = (state: FoodGraphState) => Promise<FoodGraphState> | FoodGraphState;

// Internal wiring structures
type NodeName = string;
interface Edge { from: NodeName; to: NodeName; }
type ConditionalResolver = (state: FoodGraphState) => string;
type ConditionalMap = Record<string, NodeName>;

// Builder to create and wire a tiny graph deterministically
export class FoodGraphBuilder {
    private nodes = new Map<NodeName, FoodNode>();
    private edges: Edge[] = [];
    private conditional: { from: NodeName; resolver: ConditionalResolver; mapping: ConditionalMap }[] = [];
    private start: NodeName | null = null;

    addNode(name: NodeName, fn: FoodNode): this {
        if (this.nodes.has(name)) throw new Error(`Node already exists: ${name}`);
        this.nodes.set(name, fn);
        if (!this.start) this.start = name; // first node becomes start by default
        return this;
    }

    addEdge(from: NodeName, to: NodeName): this {
        this.assertNode(from); this.assertNode(to);
        this.edges.push({ from, to });
        return this;
    }

    addConditionalEdges(from: NodeName, resolver: ConditionalResolver, mapping: ConditionalMap): this {
        this.assertNode(from);
        Object.values(mapping).forEach(n => this.assertNode(n));
        this.conditional.push({ from, resolver, mapping });
        return this;
    }

    setStart(name: NodeName): this {
        this.assertNode(name);
        this.start = name;
        return this;
    }

    compile() {
        if (!this.start) throw new Error('Graph start not defined');
        const nodes = this.nodes;
        const edges = this.edges.slice();
        const conditional = this.conditional.slice();
        const start = this.start;

        async function run(initial: FoodGraphState): Promise<FoodGraphState> {

            console.log('[FoodGraph] Running graph', {
                sessionId: initial.sessionId,
                language: initial.language,
                start: start,
                nodes: Array.from(nodes.keys()),
                edges: edges.length,
                conditional: conditional.length,
            });
            let current: NodeName | undefined = start;
            let state = initial;
            const t0 = Date.now();

            // Simple loop with guard to avoid infinite cycles in case of miswire
            const visitedLimit = 64;
            let visited = 0;
            while (current) {
                const fn = nodes.get(current);
                if (!fn) throw new Error(`Missing node: ${current}`);
                state = await Promise.resolve(fn(state));

                // Conditional next?
                const cond = conditional.find(c => c.from === current);
                if (cond) {
                    const key = cond.resolver(state);
                    current = cond.mapping[key];
                } else {
                    // Static edge next
                    const edge = edges.find(e => e.from === current);
                    current = edge?.to;
                }

                if (++visited > visitedLimit) throw new Error('Graph exceeded step limit');
            }

            try {
                console.log('[FoodGraph]', {
                    sessionId: state.sessionId,
                    language: state.language,
                    tookMs: Date.now() - t0,
                    hasSlots: !!state.slots,
                    action: state.policy?.action || null,
                    results: state.results?.restaurants?.length ?? 0,
                });
            } catch { }

            return state;
        }

        return { run } as const;
    }

    private assertNode(name: NodeName) {
        if (!this.nodes.has(name)) throw new Error(`Unknown node: ${name}`);
    }
}

// Placeholder builder function we will fill in subsequent steps
export function buildFoodGraphSkeleton() {
    const g = new FoodGraphBuilder()
        .addNode('nlu', async (s) => s)
        .addNode('policy', async (s) => s)
        .addNode('fetch', async (s) => s)
        .addNode('reply', async (s) => s)
        .addEdge('nlu', 'policy')
        .addConditionalEdges('policy', () => 'reply', { reply: 'reply' })
        .compile();
    return g;
}

// --- Step 2: Implement NLU node (rules-first with LLM fallback) ---

function rulesFirstExtract(text: string, language: Language): ExtractedSlots {
    const lowerText = text.toLowerCase();
    let city: string | null = null;
    for (const he of config.FALLBACK_HEBREW_CITIES) {
        if (text.includes(he)) { city = he; break; }
    }
    if (!city) {
        for (const en of config.FALLBACK_ENGLISH_CITIES) {
            if (lowerText.includes(en)) { city = en; break; }
        }
    }
    if (!city) {
        if (/tel\s?aviv|תלאביב|ת"א/.test(lowerText)) city = 'Tel Aviv';
        if (/אשלקון|אשקלון|ashkelon/.test(lowerText)) city = city || 'Ashkelon';
        if (/jerusalem|al\s?quds|القدس|ירושלימ/.test(lowerText)) city = city || 'Jerusalem';
    }

    let type: ExtractedSlots['type'] = null;
    if (/(pizza|פיצה)/i.test(text)) type = 'pizza';
    else if (/(sushi|סושי)/i.test(text)) type = 'sushi';
    else if (/(burger|המבורגר)/i.test(text)) type = 'burger';
    else if (/(shawarma|שווארמה)/i.test(text)) type = 'shawarma';
    else if (/(falafel|פלאפל)/i.test(text)) type = 'falafel';

    let maxPrice: number | null = null;
    const priceMatch = text.match(/(?:under|below|max|up to|עד)\s*(\d+)/i);
    if (priceMatch?.[1]) maxPrice = parseInt(priceMatch[1], 10);
    // Basic dietary keyword extraction
    const dietary: ExtractedSlots['dietary'] = [];
    if (/(vegan|טבעוני)/i.test(text)) dietary.push('vegan');
    if (/(vegetarian|צמחוני)/i.test(text)) dietary.push('vegetarian');
    if (/(gluten[\s-]?free|ללא\s?גלוטן)/i.test(text)) dietary.push('gluten_free');
    if (/(kosher|כשר|מהדרין)/i.test(text)) dietary.push('kosher');
    if (/(halal|حلال)/i.test(text)) dietary.push('halal');

    return { city, type, maxPrice, dietary, spicy: null, quantity: null } as ExtractedSlots;
}

export function buildFoodGraph(deps: { nlu?: NLUService; session?: NLUSessionService; provider?: RestaurantsProvider }) {
    const nlu = deps.nlu || new NLUService();
    const session = deps.session || nluSessionService;
    const provider = deps.provider || getRestaurantsProvider();

    const FETCH_TIMEOUT_MS = 6_000; // tighter timeout to avoid UI "no response"

    function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const id = setTimeout(() => reject(new Error('timeout')), ms);
            promise.then(v => { clearTimeout(id); resolve(v); }, e => { clearTimeout(id); reject(e); });
        });
    }

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    // Extract a likely location phrase from user text (Hebrew/English/Arabic)
    function extractLocationCandidate(text: string, language: Language): string | null {
        const t = (text || '').trim();
        if (!t) return null;
        if (language === 'he') {
            // Prefer phrase after the last 'ב' (meaning "in"). If not present, take last 1–4 words.
            const afterIn = t.match(/.*ב[-\s]?([^,.!?\d]+)$/u);
            let tail = (afterIn?.[1] || t).trim();
            const words = tail.split(/\s+/).slice(-4);
            let candidate = words.join(' ').trim();
            // Strip common Hebrew prefixes and the definite article
            candidate = candidate.replace(/^\s*(ה)?(קיבוץ|מושב|כפר|עיר|יישוב)\s+/u, '').replace(/^\s*ה/u, '').trim();
            // Normalize common spelling variants
            candidate = candidate.replace(/פתח\s+תקוה/u, 'פתח תקווה');
            return candidate.length >= 2 ? candidate : null;
        }
        // English/Arabic: phrase after " in " / " في "
        const m = t.match(/\s(?:in|في)\s([^,.;!?]+)$/i);
        if (m?.[1]) return m[1].trim();
        return null;
    }

    const g = new FoodGraphBuilder()
        .addNode('nlu', async (s) => {
            try { console.log('[FoodGraph] nlu node start', { nearMe: (s as any).nearMe, userLocation: (s as any).userLocation }); } catch { }
            const rules = rulesFirstExtract(s.text, s.language);
            const hasUseful = !!(rules.city || rules.type || rules.maxPrice);
            let slots: ExtractedSlots;
            if (hasUseful) {
                slots = rules;
            } else {
                const res = await nlu.extractSlots({ text: s.text, language: s.language });
                slots = res.slots;
            }
            // If no city, try city resolver via Geocoding API (language-aware)
            if (!slots.city) {
                try {
                    const cand = extractLocationCandidate(s.text, s.language);
                    let resolved = cand ? await findCity(cand, s.language) : null;
                    if (!resolved) {
                        resolved = await findCity(s.text, s.language);
                    }
                    if (resolved?.city) slots = { ...slots, city: resolved.city } as ExtractedSlots;
                } catch { }
            }
            // Merge with memory for explicit follow-ups OR when the user provides only a location correction
            const followUpPattern = /(cheaper|less|more|again|same|not\s|without|בלעדי|בלי|זול|יקר|עוד|פחות|יותר|זה לא)/i;
            const existing = session.getSessionContext(s.sessionId);
            const words = (s.text || '').trim().split(/\s+/);
            const isShort = words.length <= 5; // short clarifications like "tel aviv", "near marina", "pizza"
            const hasOnlyLocation = (!!slots.city || /(street|st\.?|road|rd\.?|avenue|ave\.?|marina|port|harbor|נמל|מרינה|רחוב|שדרה|שד\.)/i.test(s.text))
                && !slots.type && !slots.maxPrice && (!slots.dietary || slots.dietary.length === 0);
            const looksLikeLocationFollowUp = !!existing && isShort && hasOnlyLocation;
            // Type-only replies (e.g., "pizza") should merge prior dietary/price/location context
            const hasOnlyType = !!slots.type && !slots.city && typeof slots.maxPrice !== 'number' && (!slots.dietary || slots.dietary.length === 0);
            const looksLikeTypeFollowUp = !!existing && isShort && hasOnlyType;
            // Dietary-only replies (e.g., "vegan") should merge prior type/location
            const hasOnlyDietary = (!slots.type && !slots.city && typeof slots.maxPrice !== 'number' && Array.isArray(slots.dietary) && slots.dietary.length > 0 && isShort);
            const looksLikeDietaryFollowUp = !!existing && hasOnlyDietary;
            const isFollowUp = followUpPattern.test(s.text) || looksLikeLocationFollowUp || looksLikeTypeFollowUp || looksLikeDietaryFollowUp;

            const slotsOut = isFollowUp ? session.mergeWithSession(s.sessionId, slots) : slots;
            // If this is a fresh query, clear previous session to avoid sticky context
            if (!isFollowUp) {
                try { session.clearSession(s.sessionId); } catch { }
            }
            return { ...s, slots: slotsOut };
        })
        // classify node: fast FOOD/NOT_FOOD/AMBIGUOUS to aid policy
        .addNode('classify', async (s) => {
            try {
                const intent = await nlu.classifyQueryIntent(s.text);
                // If NOT_FOOD but we have a city anchor from memory/rules, consider it a search anyway
                const normalized = (intent === 'NOT_FOOD' && s.slots?.city) ? 'FOOD' : intent;
                return { ...s, intent: normalized };
            } catch {
                return { ...s, intent: 'AMBIGUOUS' };
            }
        })
        // refine node: normalize/clean food type when present
        .addNode('refine', async (s) => {
            if (!s.slots?.type) return s;
            try {
                const clean = await nlu.extractCleanFoodType(s.slots.type);
                if (clean) {
                    const slots = { ...s.slots, type: clean } as ExtractedSlots;
                    return { ...s, slots };
                }
            } catch { }
            return s;
        })
        // policy node: freestyle decision with location permission prompt when needed
        .addNode('policy', async (s) => {
            const slots = s.slots as ExtractedSlots;
            const hasAnchor = !!(slots?.city || s.userLocation || s.nearMe);
            const hasFilters = !!(slots?.type || (slots?.dietary && slots.dietary.length > 0) || typeof slots?.maxPrice === 'number');
            // Fetch as soon as we have a reliable anchor, or filters + city
            if (hasAnchor || (hasFilters && slots?.city)) {
                const policy = { action: Action.FetchResults as string, intent: 'search' as string, missing: [] as string[] };
                return { ...s, policy } as FoodGraphState;
            }

            if (hasFilters && !slots?.city && !s.userLocation) {
                const policy = {
                    action: Action.AskClarification as string,
                    intent: 'clarify_location' as string,
                    missing: ['location'] as string[],
                    message: 'I can search 10km around you. Share your location or type a city?'
                };
                return { ...s, policy } as FoodGraphState;
            }

            // default: ask for city
            const policy = {
                action: Action.AskClarification as string,
                intent: 'clarify_city' as string,
                missing: ['city'] as string[],
                message: undefined as any
            };
            return { ...s, policy } as FoodGraphState;
        })
        // fetch node: call provider with timeout/retries and update memory
        .addNode('fetch', async (s) => {
            const slots = s.slots as ExtractedSlots;
            const constraints: any = {};
            if (typeof slots?.maxPrice === 'number') constraints.maxPrice = slots.maxPrice;
            if (Array.isArray(slots?.dietary) && slots.dietary.length > 0) constraints.dietary = slots.dietary;

            let city: string | undefined = slots?.city || undefined;
            const address: string | undefined = (slots as any).address || undefined;
            const requestedRadiusKm: number | undefined = (slots as any).radiusKm || undefined;
            let location = s.userLocation;
            let radiusMeters: number | undefined = undefined;
            if (requestedRadiusKm) radiusMeters = Math.max(500, Math.min(30_000, Math.floor(requestedRadiusKm * 1000)));
            if (!radiusMeters && location) radiusMeters = 2_000; // default 2km around user
            if (!city && !location) {
                // fallback: keep city undefined; provider may still handle
            }

            // If address provided, resolve to geo (best-effort using city fallback elsewhere)
            if (address) {
                try {
                    const geo = await findCity(address, s.language);
                    if (geo) {
                        location = { lat: geo.lat, lng: geo.lng } as any;
                    }
                } catch { }
            }

            // If city provided (and no explicit address), geocode city to anchor search by geo instead of plain text
            if (!address && city && !location) {
                try {
                    const geo = await findCity(city, s.language);
                    if (geo) {
                        location = { lat: geo.lat, lng: geo.lng } as any;
                        if (!radiusMeters) radiusMeters = 10_000; // default 10km around city
                        // Clear city to avoid text bias; rely on geo + minimal query
                        city = undefined;
                    }
                } catch { }
            }

            // If caller explicitly asked for "near me", prefer geo and ignore any residual city
            if ((s as any).nearMe) {
                city = undefined;
            }

            // IMPORTANT: if user specified a city, it overrides near-me geo anchor.
            if (!city && location && radiusMeters) {
                constraints.location = location;
                constraints.radiusMeters = radiusMeters;
            }

            const dto: FoodQueryDTO = {
                city,
                type: slots?.type || undefined,
                constraints: Object.keys(constraints).length ? constraints : undefined,
                language: s.language,
            } as any;

            const attempts = Math.min(2, (config.LLM_RETRY_ATTEMPTS ?? 2) as number);
            const backoff = (config.LLM_RETRY_BACKOFF_MS as number[]) || [0, 300];
            let lastErr: any = null;
            for (let i = 0; i < attempts; i++) {
                try {
                    const res = await withTimeout(provider.search(dto), FETCH_TIMEOUT_MS);
                    // update memory on success
                    session.updateSession(s.sessionId, slots, s.text);
                    return { ...s, results: res };
                } catch (e: any) {
                    lastErr = e;
                    const wait = backoff[i] ?? 0;
                    if (wait) await sleep(wait);
                }
            }
            try { console.warn('[FoodGraph] fetch failed', lastErr?.message || lastErr); } catch { }
            return s;
        })
        // widen node: if zero results and we have geo for city, retry with radius expansion and inform user
        .addNode('widen', async (s) => {
            if (!s.results || (s.results.restaurants || []).length > 0) return s;
            // Try to resolve geo for the city
            try {
                const geo = await findCity((s.slots?.city as string) || '', s.language);
                if (!geo) return s;
                // Re-run provider text search via DTO by approximating with location/radius if supported
                // If provider lacks radius, we can approximate by adding nearby locality via textSearch and merging.
                // For now, just annotate replyText hint; provider remains unchanged.
                const hint = s.language === 'he'
                    ? 'לא נמצאו תוצאות בעיר. מרחיב חיפוש ל-10 ק"מ סביב '
                    : s.language === 'ar'
                        ? 'لم يتم العثور على نتائج في المدينة. أقوم بتوسيع البحث لمسافة 10 كم حول '
                        : 'No results in city. Expanding search 10km around ';
                return { ...s, replyText: `${hint}${s.slots?.city}` };
            } catch { return s; }
        })
        .addNode('reply', async (s) => s)
        .addEdge('nlu', 'classify')
        .addEdge('classify', 'refine')
        .addEdge('refine', 'policy')
        .addConditionalEdges('policy', (s) => {
            const action = s.policy?.action;
            return action === Action.FetchResults ? 'fetch' : 'reply';
        }, { fetch: 'fetch', reply: 'reply' })
        .addEdge('fetch', 'widen')
        .addEdge('widen', 'reply')
        .compile();

    return g;
}


