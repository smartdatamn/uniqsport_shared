import { api } from './client.js';

/**
 * Brackets from compadmin's Beta Draw engine, read through compware
 * (GET /comp/event/draws, /comp/event/draw). Public; only draws staff have
 * locked are returned.
 *
 * A draw: { id, format, bracket_size, status, group, people: {regId: {firstname,
 * lastname, club, profile_url}}, seeds: {regId: n}, matches: [{id, round,
 * round_name, order, number, status ('pending'|'bye'|'completed'),
 * loser_bracket, one, two, winner, next, next_slot, next_loser, mat, time}] }.
 * `one` / `two` are registration ids, null until the feeding match is
 * decided. round_name is the engine's own (Mongolian) label.
 */

export const ELIMINATION_FORMATS = Object.freeze(['single', 'double', 'double_single_bronze', 'mjjf']);
export const ROUND_ROBIN_FORMATS = Object.freeze(['round_robin', 'round_robin_2pool']);

export const isRoundRobin = (format) => ROUND_ROBIN_FORMATS.includes(format);

/**
 * Whether to show a draw as games + standings rather than a bracket: a
 * round-robin format, or a draw whose matches lead nowhere - the engine plays
 * 2-5 athletes as a round robin (best of three for two) whatever the format.
 */
export function playsAsRoundRobin(draw) {
    if (isRoundRobin(draw?.format)) return true;
    const matches = draw?.matches ?? [];
    return matches.length > 1 && matches.every((m) => m.next == null && m.next_loser == null && !m.loser_bracket);
}

/** Which groups of an event have a published bracket. */
export const eventDraws = (eventId) => api('URL_COMP_EVENT_DRAWS', { query: { event_id: eventId } });

/** One bracket. A draw that is not published answers code 'draw_not_found'. */
export const eventDraw = (drawId) => api('URL_COMP_EVENT_DRAW', { query: { draw_id: drawId } });

/** The draw for a competitor group, if one is published (ids compared as numbers). */
export function drawForGroup(draws, { entryId, ageId, beltId = null, weightId }) {
    return (draws ?? []).find((d) => Number(d.entry_id) === Number(entryId) && Number(d.age_id) === Number(ageId)
        && Number(d.weight_id) === Number(weightId) && (beltId == null || Number(d.belt_id) === Number(beltId))) ?? null;
}

/**
 * The main bracket as columns, one per round, in play order: [{round, name,
 * matches}]. Repechage / bronze matches (loser_bracket) are left out - see
 * loserMatches.
 */
export function bracketColumns(matches) {
    const byRound = new Map();
    for (const m of matches ?? []) {
        if (m.loser_bracket) continue;
        if (!byRound.has(m.round)) byRound.set(m.round, []);
        byRound.get(m.round).push(m);
    }
    return [...byRound.entries()]
        .sort(([a], [b]) => a - b)
        .map(([round, list]) => {
            const sorted = [...list].sort((x, y) => x.order - y.order);
            return { round, name: sorted[0]?.round_name ?? '', matches: sorted };
        });
}

/** Repechage and bronze matches, grouped by their round name, in play order. */
export function loserMatches(matches) {
    const groups = new Map();
    for (const m of [...(matches ?? [])].filter((x) => x.loser_bracket).sort((x, y) => x.round - y.round || x.order - y.order)) {
        const key = m.round_name || String(m.round);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(m);
    }
    return [...groups.entries()].map(([name, list]) => ({ name, matches: list }));
}

/** Matches grouped by round name in play order - for round-robin formats. */
export function matchesByRoundName(matches) {
    const groups = new Map();
    for (const m of [...(matches ?? [])].sort((x, y) => x.round - y.round || x.order - y.order)) {
        const key = m.round_name || String(m.round);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(m);
    }
    return [...groups.entries()].map(([name, list]) => ({ name, matches: list }));
}

/**
 * Round-robin standings from decided matches: [{regId, played, wins}], most
 * wins first. Byes are not games. Ties keep the order people first appear in.
 */
export function standings(matches) {
    const rows = new Map();
    const row = (id) => {
        if (!rows.has(id)) rows.set(id, { regId: id, played: 0, wins: 0 });
        return rows.get(id);
    };
    for (const m of matches ?? []) {
        if (m.loser_bracket) continue;
        for (const id of [m.one, m.two]) if (id != null) row(id);
        if (m.status === 'bye' || m.winner == null || m.one == null || m.two == null) continue;
        row(m.one).played += 1;
        row(m.two).played += 1;
        row(m.winner).wins += 1;
    }
    return [...rows.values()].sort((a, b) => b.wins - a.wins);
}

/** "Lastname Firstname" for a registration id, or null when nobody is there yet. */
export function personName(draw, regId) {
    if (regId == null) return null;
    const p = draw?.people?.[regId] ?? draw?.people?.[String(regId)];
    return p ? [p.lastname, p.firstname].filter(Boolean).join(' ') : null;
}
