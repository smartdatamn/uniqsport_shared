import { api, getToken } from './client.js';

/**
 * Athlete access: claiming a record someone else created for you, deciding
 * claims, and an academy's owners and coaches. compware
 * docs/design/athlete-access.md.
 *
 * Every endpoint here is POST and token-only, so each function answers
 * auth_required WITHOUT a request when no token is stored — a mobile session
 * from before token sign-in has none, and the right answer there is "sign in
 * again" (string claimSignInAgain), not a 401 round trip.
 *
 * Every function returns an api() envelope. The caller is always the token's
 * user; nothing here sends a user id.
 */

const refuse = (code) => ({ ok: false, data: null, code, message: null, raw: null, httpStatus: null });

async function post(endpoint, body = {}) {
    if (!(await getToken())) return refuse('auth_required');

    return api(endpoint, { method: 'POST', body });
}

/** Claim states, as compware sends them, to their translation keys. */
export const CLAIM_STATUS_KEYS = Object.freeze({
    pending: 'claimStatusPending',
    approved: 'claimStatusApproved',
    rejected: 'claimStatusRejected',
    cancelled: 'claimStatusCancelled',
});

// --- Claims -----------------------------------------------------------------

/**
 * Asks to take over the record for a national ID. The answer is the claim —
 * {id, member_id, status, …} — and says nothing about the record until it is
 * approved. Asking again while pending returns the same claim.
 *
 * Codes: member_not_found, already_yours, claim_pending (someone else's).
 */
export const claimMember = (registerNumber) =>
    post('URL_COMP_MEMBER_CLAIM', { register_number: String(registerNumber ?? '').trim() });

export const cancelClaim = (claimId) => post('URL_COMP_MEMBER_CLAIM_CANCEL', { claim_id: claimId });

/** My claims, newest first; an approved one carries `member`. */
export const myClaims = () => post('URL_COMP_MEMBER_CLAIMS_MINE');

/** Pending claims I may decide: on records I manage, or my academy's unclaimed ones. */
export const claimsToDecide = () => post('URL_COMP_MEMBER_CLAIMS_PENDING');

/**
 * Approving hands the record to the claimant, who manages it from then on.
 * I lose access; the academy's owners and coaches keep theirs.
 */
export const decideClaim = (claimId, approve) =>
    post('URL_COMP_MEMBER_CLAIM_DECIDE', { claim_id: claimId, decision: approve ? 'approve' : 'reject' });

// --- Academy roles ------------------------------------------------------------

/** My active owner / coach grants, each with its `academy`. */
export const myAcademyRoles = () => post('URL_COMP_ACADEMY_ROLES_MINE');

/** Owner only. */
export const academyCoaches = (academyId) => post('URL_COMP_ACADEMY_COACHES', { academy_id: academyId });

/**
 * Owner only. The coach is their account (phone or e-mail) plus the national
 * ID of their own athlete record on that account.
 */
export const grantCoach = (academyId, identity, registerNumber) =>
    post('URL_COMP_ACADEMY_COACH_GRANT', {
        academy_id: academyId,
        identity: String(identity ?? '').trim(),
        register_number: String(registerNumber ?? '').trim(),
    });

export const revokeCoach = (academyId, roleId) =>
    post('URL_COMP_ACADEMY_COACH_REVOKE', { academy_id: academyId, role_id: roleId });

/** Owner or coach: the academy's athletes, all of whom I may act for; claimed_at marks the self-managed. */
export const academyAthletes = (academyId) => post('URL_COMP_ACADEMY_ATHLETES', { academy_id: academyId });

// --- An athlete's club, school and province / region ---------------------------

/**
 * An athlete has at most one of each (compware repo\comp\Affiliation). Only
 * the club gives anyone access: its owners and coaches act for the athlete.
 * A school or province is what the athlete competes under where an event
 * lists those.
 *
 * Per kind: the athlete row's id and name fields, and the strings.
 */
export const AFFILIATIONS = Object.freeze([
    Object.freeze({ kind: 'club', idField: 'academy_id', nameField: 'academy_name', label: 'athleteClub', none: 'noClub' }),
    Object.freeze({ kind: 'school', idField: 'school_id', nameField: 'school_name', label: 'athleteSchool', none: 'noSchool' }),
    Object.freeze({ kind: 'region', idField: 'region_id', nameField: 'region_name', label: 'athleteRegion', none: 'noRegion' }),
]);

/**
 * What an athlete can choose: {club: [...], school: [...], region: [...]},
 * each {id, name, name_en} by name - merged duplicates, Individual and the old
 * "type your club" entry left out. The same for everyone.
 */
export async function affiliationOptions() {
    const envelope = await post('URL_COMP_MEMBER_AFFILIATION_OPTIONS');
    const data = envelope.ok && envelope.data ? envelope.data : {};
    const pick = (k) => (Array.isArray(data[k]) ? data[k] : []);
    return { ok: envelope.ok, code: envelope.code, club: pick('club'), school: pick('school'), region: pick('region') };
}

/**
 * Sets the club, school or province / region of an athlete I manage; null
 * clears it. Only the record's manager may - a coach cannot move an athlete
 * (member_owned_by_other). Choosing the club moves the club's access to
 * the athlete with it.
 *
 * Answers {id, kind, <academy_id|school_id|region_id>, academy: {id, name, name_en} | null}.
 * Codes: member_not_found, member_owned_by_other, academy_not_found
 * (not that kind, or not listed), invalid_request (unknown kind).
 */
export const changeAthleteAffiliation = (memberId, kind, academyId) =>
    post('URL_COMP_MEMBER_AFFILIATION', { member_id: memberId, kind, academy_id: academyId ?? 0 });

export const changeAthleteClub = (memberId, academyId) => changeAthleteAffiliation(memberId, 'club', academyId);
