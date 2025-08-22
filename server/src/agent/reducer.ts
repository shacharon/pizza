import { AgentState, type AgentEvent } from "./states.js";
import { coreKnown, hasCity, missingAnyOf, type Context } from "./context.js";
import type { SearchResultDTO } from "@api";

export interface Node {
    state: AgentState;
    ctx: Context;
    reply?: string;
    uiHints?: string[];
}

export function reduce(node: Node, event: AgentEvent): Node {
    const { state, ctx } = node;

    switch (state) {
        case AgentState.COLLECTING: {
            if (event.type === "USER_MESSAGE") {
                const text = event.text;
                return { ...node, ctx: { ...ctx, lastMessage: text } };
            }
            if (event.type === "INTENT_OTHER") {
                return {
                    state: AgentState.REFUSAL,
                    ctx,
                    reply: "אני עוזר רק בהזמנת אוכל. רוצה שאחפש פיצה, סושי או המבורגר?",
                    uiHints: ["פיצה בת״א עד ₪60", "סושי כשר בר״ג", "המבורגר עד 30 דק’"]
                };
            }
            if (event.type === "INTENT_OK" || event.type === "CLARIFIED") {
                const q = { ...ctx.query, ...(event.type === "CLARIFIED" ? event.patch : {}) };
                if (!hasCity(q)) {
                    return {
                        state: AgentState.COLLECTING,
                        ctx: { ...ctx, query: q },
                        reply: "באיזו עיר/אזור להזמין?",
                        uiHints: ["תל אביב", "אשקלון", "רמת גן"]
                    };
                }
                const missingMinor = missingAnyOf(q, ["maxPrice", "deliveryEtaMinutes", "dietary"] as any);
                if (missingMinor) {
                    return {
                        state: AgentState.PARTIAL_RESULTS,
                        ctx: { ...ctx, query: q },
                        reply:
                            "מצאתי כמה אפשרויות כלליות באזור שלך (עדיין בלי סינון לפי מחיר/זמן). " +
                            "רוצה לסנן לפי תקציב מקסימלי או זמן משלוח?",
                        uiHints: ["עד ₪50", "עד ₪60", "משלוח עד 30 דק’", "ללא גלוטן"]
                    };
                }
                return {
                    state: AgentState.SEARCHING,
                    ctx: { ...ctx, query: q },
                    reply: "מחפש התאמות מדויקות לפי הפרמטרים שביקשת…"
                };
            }
            return node;
        }

        case AgentState.PARTIAL_RESULTS: {
            if (event.type === "CLARIFIED") {
                const q = { ...ctx.query, ...event.patch };
                if (coreKnown(q)) {
                    return {
                        state: AgentState.SEARCHING,
                        ctx: { ...ctx, query: q },
                        reply: "מעדכן את התוצאות לפי ההעדפות שלך…"
                    };
                }
                return {
                    ...node,
                    ctx: { ...ctx, query: q },
                    reply: "רוצה להוסיף תקציב מקסימלי או זמן משלוח מועדף?"
                };
            }
            if (event.type === "SEARCH_START") {
                return { ...node, state: AgentState.SEARCHING, reply: "מחפש עבורך…" };
            }
            return node;
        }

        case AgentState.SEARCHING: {
            if (event.type === "SEARCH_OK") {
                const results: SearchResultDTO = event.results;
                return {
                    state: results.vendors.length ? AgentState.RESULTS : AgentState.NO_RESULTS,
                    ctx: { ...ctx, results },
                    reply: results.vendors.length
                        ? `מצאתי ${results.vendors.length} אפשרויות מתאימות.`
                        : "לא נמצאו תוצאות תואמות — רוצה להרחיב תקציב או זמן משלוח?"
                };
            }
            if (event.type === "SEARCH_EMPTY") {
                return {
                    state: AgentState.NO_RESULTS,
                    ctx,
                    reply: "לא נמצאו תוצאות — להרחיב את הסינון?"
                };
            }
            return node;
        }

        case AgentState.RESULTS: {
            if (event.type === "SELECT_VENDOR") {
                return {
                    state: AgentState.QUOTING,
                    ctx,
                    reply: "מכין הצעת מחיר ועדכון זמן משלוח…"
                };
            }
            if (event.type === "CLARIFIED") {
                const q = { ...ctx.query, ...event.patch };
                return {
                    state: AgentState.SEARCHING,
                    ctx: { ...ctx, query: q },
                    reply: "מעדכן תוצאות…"
                };
            }
            return node;
        }

        case AgentState.NO_RESULTS: {
            if (event.type === "CLARIFIED") {
                const q = { ...ctx.query, ...event.patch };
                return {
                    state: AgentState.SEARCHING,
                    ctx: { ...ctx, query: q },
                    reply: "מנסה שוב עם סינון מעודכן…"
                };
            }
            return node;
        }

        case AgentState.QUOTING: {
            if (event.type === "QUOTE_READY") {
                return { state: AgentState.CONFIRM, ctx, reply: "לאשר הזמנה?" };
            }
            return node;
        }

        case AgentState.CONFIRM: {
            if (event.type === "CONFIRM") {
                return { state: AgentState.ORDERING, ctx, reply: "מבצע הזמנה…" };
            }
            return node;
        }

        case AgentState.ORDERING: {
            if (event.type === "ORDER_OK") {
                return { state: AgentState.DONE, ctx, reply: "הזמנה בוצעה בהצלחה. בתיאבון! 🍕" };
            }
            if (event.type === "ORDER_FAIL") {
                return { state: AgentState.ERROR, ctx, reply: "הזמנה נכשלה. לנסות שוב?" };
            }
            return node;
        }

        default:
            return node;
    }
}

export function createInitialNode(raw: string): Node {
    const initial: Context = { query: { raw } as any };
    return { state: AgentState.COLLECTING, ctx: initial };
}


