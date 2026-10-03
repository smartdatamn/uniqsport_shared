import { api, getToken } from './client.js';

/**
 * Coach bulk entry: an owner or coach entering several of their club's
 * athletes into one competition at once. compware BulkRegistrationRepository.
 *
 * Two calls, both POST and token-only:
 *   academyEventSheet()  the event's divisions and the club's athletes, with
 *                        what each is already entered in;
 *   registerAthletes()   every chosen row at once - all or none. A refusal is
 *                        code 'rows_invalid' with `rows: [{row, member_id, code}]`
 *                        on the raw answer; rowErrors() reads it.
 *
 * The pure helpers below apply the same rules the server does, so the table
 * can say what a row still needs before anything is sent. The server checks
 * again regardless.
 */

const refuse = (code) => ({ ok: false, data: null, code, message: null, raw: null, httpStatus: null });

async function post(endpoint, body) {
    if (!(await getToken())) return refuse('auth_required');
    return api(endpoint, { method: 'POST', body });
}

/** Most rows one registerAthletes() call takes. */
export const MAX_BULK_ROWS = 100;

/** The entry table's data for one academy and one event. */
export const academyEventSheet = (academyId, eventId) =>
    post('URL_COMP_ACADEMY_EVENT_SHEET', { academy_id: academyId, event_id: eventId });

/**
 * rows: [{memberId, entryId, ageId, beltId?, weightId?}]. Belt and weight are
 * sent only when chosen.
 */
export function registerAthletes(academyId, eventId, rows) {
    return post('URL_COMP_ACADEMY_EVENT_REGISTER', {
        academy_id: academyId,
        event_id: eventId,
        rows: rows.map((r) => {
            const row = { member_id: r.memberId, entry: r.entryId, age: r.ageId };
            if (r.beltId) row.belt = r.beltId;
            if (r.weightId) row.weight = r.weightId;
            return row;
        }),
    });
}

/** A refused batch's reasons, by the index of the row as it was sent. */
export function rowErrors(envelope) {
    const rows = envelope?.raw?.rows;
    const out = new Map();
    if (Array.isArray(rows)) {
        for (const r of rows) out.set(Number(r.row), String(r.code));
    }
    return out;
}

/** A row's refusal code -> translation key. */
export const ROW_ERROR_KEYS = Object.freeze({
    member_not_allowed: 'bulkRowNotAllowed',
    athlete_incomplete: 'bulkRowIncomplete',
    division_not_found: 'bulkRowDivision',
    division_gender: 'bulkRowGender',
    age_not_found: 'bulkRowAge',
    belt_not_found: 'bulkRowBelt',
    weight_not_found: 'bulkRowWeight',
    already_entered: 'bulkRowAlreadyEntered',
    duplicate_row: 'bulkRowDuplicate',
});

/** What an athlete lacks for an entry ('birth', 'gender', 'profile_photo', 'id_photo') -> key. */
export const MISSING_KEYS = Object.freeze({
    birth: 'bulkMissingBirth',
    gender: 'bulkMissingGender',
    profile_photo: 'bulkMissingPortrait',
    id_photo: 'bulkMissingDocument',
});

/** The divisions this athlete may enter: theirs by gender, or open to both. */
export function divisionsFor(athlete, divisions) {
    const gender = String(athlete?.gender_code ?? '');
    return (divisions ?? []).filter((d) => {
        const g = String(d.gender_code ?? '');
        return g === '' || g === gender;
    });
}

/** True when the athlete already has an entry in this division. */
export function alreadyEntered(athlete, entryId) {
    return (athlete?.registrations ?? []).some((r) => Number(r.entry_id) === Number(entryId));
}

/**
 * The one age group that fits, or null. Organisers type either BIRTH YEARS
 * (2008-1980) or AGES (16-17), in either order, so:
 *   - both bounds look like years (>= 1900): the birth year must lie between;
 *   - both look like ages: age in the event's year (event year - birth year,
 *     the usual sporting age) must lie between;
 *   - an open bound ("16 and above") counts for ages only.
 * Anything else - a mix, a blank, two that fit - is no suggestion: a person
 * chooses. Never used to refuse; the server does not check age either.
 */
export function suggestAgeGroup(birth, ages, eventDate) {
    const born = Number(String(birth ?? '').slice(0, 4));
    const eventYear = Number(String(eventDate ?? '').slice(0, 4)) || new Date().getFullYear();
    if (!born) return null;

    const fits = (ages ?? []).filter((a) => {
        const s = Number(a.start_age);
        const hasEnd = a.end_age !== null && a.end_age !== undefined && a.end_age !== '';
        const e = hasEnd ? Number(a.end_age) : null;
        if (!Number.isFinite(s) || (hasEnd && !Number.isFinite(e))) return false;

        if (s >= 1900 && e !== null && e >= 1900) {
            return born >= Math.min(s, e) && born <= Math.max(s, e);
        }
        if (s < 150 && (e === null || e < 150)) {
            const age = eventYear - born;
            return e === null ? age >= s : age >= Math.min(s, e) && age <= Math.max(s, e);
        }
        return false;
    });

    return fits.length === 1 ? fits[0].id : null;
}

/**
 * What a chosen row still needs before it can be sent: 'division', 'age',
 * 'belt' (when the division has belts), 'weight' (when the age has weights).
 * Empty means ready. The same rules the server applies.
 */
export function rowNeeds(row, divisions) {
    const division = (divisions ?? []).find((d) => Number(d.id) === Number(row?.entryId));
    if (!division) return ['division'];

    const needs = [];
    const age = (division.ages ?? []).find((a) => Number(a.id) === Number(row.ageId));
    if (!age) needs.push('age');
    if ((division.belts ?? []).length > 0 && !(division.belts ?? []).some((b) => Number(b.id) === Number(row.beltId))) {
        needs.push('belt');
    }
    if (age && (age.weights ?? []).length > 0 && !(age.weights ?? []).some((w) => Number(w.id) === Number(row.weightId))) {
        needs.push('weight');
    }
    return needs;
}
