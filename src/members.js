import { api } from './client.js';
import { getUserInfo } from './auth.js';

/**
 * Athlete records the signed-in account manages, on api().
 *
 * There is no athlete editor in the mobile app outside registration — the app
 * creates and edits athletes inside EventRegistrationScreen and the (team)
 * SportMemberCreateScreen. These are the same compware calls those screens
 * make, so a record saved here is a record the app shows, and the same rules
 * apply: compware decides who may act for an athlete
 * (docs/design/athlete-access.md) and answers member_owned_by_other
 * otherwise — the moment to offer claimMember().
 */

const refuse = (code) => ({ ok: false, data: null, code, message: null, raw: null, httpStatus: null });

async function signedInId() {
    const stored = await getUserInfo().catch(() => null);
    return stored ? stored.userid : null;
}

/**
 * Every athlete I manage, across sports, sorted by name. Each row carries
 * id, register_number, names, birth, gender_code, contact_phone,
 * profile_url / id_url (S3 keys — show with memberPhotoUrl), academy_id,
 * claimed_at.
 */
export async function myAthletes() {
    const userId = await signedInId();
    if (!userId) return refuse('auth_required');

    return api('URL_COMP_EVENT_MEMBER_REGISTRATION', { method: 'POST', body: { user_id: userId } });
}

/**
 * Creates or updates an athlete. compware's eventRegister overwrites every
 * field it is given — a missing birthday is saved as empty — so the whole
 * record is always sent. Photos are sent only when they changed, as
 * base64 data URIs; compware uploads them and replaces the old ones.
 *
 * @param {{registerNumber: string, lastname: string, firstname: string,
 *          birthday: string, genderCode: string, phoneNumber?: string,
 *          profileImage?: string|null, idImage?: string|null}} athlete
 * @param {{isNew: boolean}} options
 */
export async function saveAthlete(athlete, { isNew }) {
    const userId = await signedInId();
    if (!userId) return refuse('auth_required');

    const body = {
        userId,
        registerNumber: String(athlete.registerNumber ?? '').trim().toUpperCase(),
        lastname: String(athlete.lastname ?? '').trim(),
        firstname: String(athlete.firstname ?? '').trim(),
        birthday: athlete.birthday,
        genderCode: athlete.genderCode,
        phoneNumber: String(athlete.phoneNumber ?? '').trim(),
        isEdit: !isNew,
    };

    if (athlete.profileImage) body.profileImage = athlete.profileImage;
    if (athlete.idImage) body.idImage = athlete.idImage;

    return api('URL_COMP_EVENT_REGISTER', { method: 'POST', body });
}

/** Refused with member_has_registrations while the athlete has any. */
export async function deleteAthlete(memberId) {
    const userId = await signedInId();
    if (!userId) return refuse('auth_required');

    return api('URL_COMP_EVENT_MEMBER_DELETE', { method: 'POST', body: { member_id: memberId, user_id: userId } });
}

const isRealPastDate = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
        && y >= 1900 && date.getTime() <= Date.now();
};

/**
 * The mobile athlete form's checks, as translation keys, in its order.
 * Empty when the athlete may be saved.
 *
 * A national ID is 10 characters, as the app requires; a foreign passport
 * number only has to be present. Both photos are required for a new athlete,
 * as in the app; an existing one keeps the photos it has.
 */
export function athleteProblems(athlete, { isNew, foreignPassport = false }) {
    const problems = [];
    const reg = String(athlete.registerNumber ?? '').trim();

    if (foreignPassport ? reg === '' : reg.length !== 10) problems.push('regNumberInvalid');
    if (!String(athlete.lastname ?? '').trim() || !String(athlete.firstname ?? '').trim()) problems.push('fillAllFields');
    if (!isRealPastDate(athlete.birthday)) problems.push('valBirthday');
    if (athlete.genderCode !== '1' && athlete.genderCode !== '2') problems.push('valGender');
    if (isNew && !athlete.profileImage) problems.push('valPortrait');
    if (isNew && !athlete.idImage) problems.push('valDocument');

    return problems;
}
