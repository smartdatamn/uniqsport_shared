import { api } from './client.js';
import { getUserInfo } from './auth.js';
import { currencyFormat } from './format.js';
import { tr } from './i18n.js';

/**
 * Individual competition registration — the mobile EventRegistrationScreen,
 * written down. The screen's 1,600 lines are mostly UI; the rules are these:
 *
 *  1. Gender picks the divisions ("entries") on offer: entries(eventId, gender).
 *  2. A division has age groups and belts: entryOptions(entryId).
 *  3. Choosing a belt clears the age group; choosing an age group loads its
 *     weight classes: entryWeights(entryId, ageId).
 *  4. A club comes from the event's list (by the config's org_types); one
 *     marked is_other asks for the club's name instead.
 *  5. registrationProblems() is the screen's checks, in its order.
 *  6. registerForEvent() sends exactly the body the screen sends, so compware
 *     sees the same request from either client. compware decides who may act
 *     for the athlete (member_owned_by_other otherwise).
 *
 * Nothing here filters divisions by the athlete's age or weight: the app does
 * not either. The registration windows come from compware's own flags —
 * readEventConfig / registrationWindow / canEdit — never from dates here.
 */

const refuse = (code) => ({ ok: false, data: null, code, message: null, raw: null, httpStatus: null });
const list = (envelope) => (envelope.ok && Array.isArray(envelope.data) ? envelope.data : []);

async function signedInId() {
    const stored = await getUserInfo().catch(() => null);
    return stored ? stored.userid : null;
}

/** Registration statuses to their translation keys (as the app shows them). */
export const REG_STATUS_KEYS = Object.freeze({
    created: 'newRegStat',
    approved: 'regConfirmedStat',
    canceled: 'regCanceledStat',
});

// --- Labels ----------------------------------------------------------------

/** The entry fee: a per-entry fee row if there is one, else the entry's own. */
export function entryFee(entry) {
    const fee = entry?.fee?.entrance_fee ?? entry?.entrance_fee;
    return fee === null || fee === undefined || fee === '' ? null : Number(fee);
}

/** "Adult - 30,000₮", as the app lists divisions. */
export function entryLabel(entry, name = entry?.name) {
    const fee = entryFee(entry);
    return fee === null ? String(name ?? '') : `${name} - ${currencyFormat(fee)}₮`;
}

/**
 * An age group. start_age / end_age hold what the organiser typed — in
 * practice often BIRTH YEARS (2008-1980) — and the app prints them as they
 * are, so this does too.
 */
export function ageLabel(age) {
    if (!age) return '';
    return age.end_age !== null && age.end_age !== undefined && age.end_age !== ''
        ? `${age.start_age}-${age.end_age}${tr('ageSuffix')}`
        : `${age.start_age}${tr('ageAndAbove')}`;
}

export function weightLabel(weight) {
    return weight ? `${weight.weight}${tr('weightKg')}` : '';
}

// --- The cascade --------------------------------------------------------------

/** Divisions open to a gender ('1' / '2'). */
export async function eventEntries(eventId, genderCode) {
    return list(await api('URL_COMP_EVENT_ENTRIES', { query: { event_id: eventId, gender_code: genderCode } }));
}

/** A division's age groups and belts. */
export async function entryOptions(entryId) {
    const envelope = await api('URL_COMP_EVENT_ENTRY_CONFIG', { query: { entry_id: entryId } });
    const raw = envelope.ok ? envelope.raw : null;
    return {
        ages: Array.isArray(raw?.age) ? raw.age : [],
        belts: Array.isArray(raw?.belt) ? raw.belt : [],
    };
}

/** The weight classes of one age group of a division. */
export async function entryWeights(entryId, ageId) {
    return list(await api('URL_COMP_EVENT_ENTRY_WEIGHT', { query: { entry_id: entryId, age_id: ageId } }));
}

/** The clubs an event lists, by its config's org_types (sent as is, e.g. "{team}"). */
export async function eventAcademies(orgTypes) {
    return list(await api('URL_COMP_EVENT_ACADEMIES', { query: orgTypes ? { type: orgTypes } : {} }));
}

// --- My registrations ---------------------------------------------------------

/**
 * The athletes I manage that are registered for this event, each with its
 * `registrations` for it (academy, entry, age, belt, weight, status).
 * compware returns all my athletes; the ones with no registration here are
 * dropped.
 */
export async function myEventRegistrations(eventId) {
    const userId = await signedInId();
    if (!userId) return refuse('auth_required');

    const envelope = await api('URL_COMP_EVENT_REGISTERED_MEMBERS', { method: 'POST', body: { user_id: userId, event_id: eventId } });
    if (!envelope.ok) return envelope;

    const members = Array.isArray(envelope.data) ? envelope.data : [];
    return { ...envelope, data: members.filter((m) => Array.isArray(m.registrations) && m.registrations.length > 0) };
}

/** My athletes not yet registered for this event — "pick from previous". */
export async function myAthletesNotInEvent(eventId) {
    const userId = await signedInId();
    if (!userId) return refuse('auth_required');

    return api('URL_COMP_EVENT_MEMBERS_NOTIN', { method: 'POST', body: { user_id: userId, event_id: eventId } });
}

/**
 * Registers an athlete for an event, or changes a registration (regId).
 *
 * The body is the app's, field for field. Photos: a new data URI is
 * uploaded; anything else (an athlete's existing photo) is sent as the app
 * sends it and left alone by compware.
 *
 * @param {object} athlete  registerNumber, lastname, firstname, birthday,
 *                          genderCode, phoneNumber, profileImage, idImage
 * @param {object} entry    eventId, academyId, academyName, entryId, ageId,
 *                          beltId, weightId
 * @param {{regId?: number|null}} [options]
 */
export async function registerForEvent(athlete, entry, { regId = null } = {}) {
    const userId = await signedInId();
    if (!userId) return refuse('auth_required');

    return api('URL_COMP_EVENT_REGISTER', {
        method: 'POST',
        body: {
            userId,
            eventId: entry.eventId,
            registerNumber: String(athlete.registerNumber ?? '').trim().toUpperCase(),
            firstname: String(athlete.firstname ?? '').trim(),
            lastname: String(athlete.lastname ?? '').trim(),
            birthday: athlete.birthday,
            genderCode: athlete.genderCode,
            phoneNumber: String(athlete.phoneNumber ?? '').trim(),
            academy: entry.academyId,
            entry: entry.entryId,
            age: entry.ageId,
            belt: entry.beltId,
            weight: entry.weightId,
            idImage: athlete.idImage ?? null,
            profileImage: athlete.profileImage ?? null,
            isEdit: regId !== null,
            reg_id: regId,
            academyName: entry.academyName ?? '',
        },
    });
}

/** Refused by the app while the registration is approved (cannotDeleteVerified). */
export async function deleteRegistration(regId) {
    const userId = await signedInId();
    if (!userId) return refuse('auth_required');

    return api('URL_COMP_EVENT_REGISTER_DELETE', { method: 'POST', body: { reg_id: regId, user_id: userId } });
}

// --- The form's checks ----------------------------------------------------------

/**
 * EventRegistrationScreen's checks, as translation keys, in its order. The
 * photos count as present when the athlete already has them.
 */
export function registrationProblems(form, { foreignPassport = false } = {}) {
    const problems = [];
    const reg = String(form.registerNumber ?? '').trim();
    const filled = (v) => v !== null && v !== undefined && String(v).trim() !== '';

    if (!reg || (!foreignPassport && reg.length !== 10)) problems.push('valRegNumber');
    if (!filled(form.lastname)) problems.push('valLastname');
    if (!filled(form.firstname)) problems.push('valFirstname');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.birthday ?? '') || Number.isNaN(Date.parse(form.birthday))) problems.push('valBirthday');
    if (form.genderCode !== '1' && form.genderCode !== '2') problems.push('valGender');
    if (!filled(form.phoneNumber)) problems.push('valPhone');
    if (!filled(form.academyId)) problems.push('valAcademy');
    if (form.academyIsOther && !filled(form.academyName)) problems.push('valAcademyName');
    if (!filled(form.entryId)) problems.push('valEntry');
    if (!filled(form.ageId)) problems.push('valAge');
    if (!filled(form.beltId)) problems.push('valBelt');
    if (!filled(form.weightId)) problems.push('valWeight');
    if (!filled(form.profileImage)) problems.push('valPortrait');
    if (!filled(form.idImage)) problems.push('valDocument');

    return problems;
}

// --- The competitor list ------------------------------------------------------

/** Every division of an event, both genders, each with its entrant `total`. */
export async function eventEntriesWithCounts(eventId) {
    return list(await api('URL_COMP_EVENT_ENTRIES', { query: { event_id: eventId, iscount: 'true' } }));
}

/**
 * The entrants of one division (optionally one belt and age group), grouped
 * by age group and weight class as the app shows them. Canceled entries are
 * already left out by compware.
 *
 * @param {number} eventId
 * @param {number|null} entryId
 * @param {number|null} [beltId]
 * @param {number|null} [ageId]
 * @returns {Promise<Array<{ageId: number, startAge: any, endAge: any,
 *   weightId: number, weight: string, members: Array<Record<string, any>>}>>}
 */
export async function competitorGroups(eventId, entryId, beltId = null, ageId = null) {
    const rows = list(await api('URL_COMP_EVENT_MEMBERS', {
        // Both filters always sent, empty when not chosen: compware read
        // belt_id unguarded and failed the whole call when it was missing.
        query: { event_id: eventId, entry_id: entryId, belt_id: beltId ?? '', age_id: ageId ?? '' },
    }));

    const groups = [];
    const byKey = new Map();
    for (const row of rows) {
        const key = row.ageid + ':' + row.wid;
        let group = byKey.get(key);
        if (!group) {
            group = { ageId: row.ageid, startAge: row.start_age, endAge: row.end_age, weightId: row.wid, weight: row.weight, members: [] };
            byKey.set(key, group);
            groups.push(group);
        }
        group.members.push(row);
    }
    return groups;
}
