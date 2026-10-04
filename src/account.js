import { TERMS_VERSION } from './terms.js';
import { api, getToken } from './client.js';
import { storeSession, storeUser } from './auth.js';
import { clearStoredSession, emitSession } from './session.js';
import { identityChannel, isValidEmail, isValidPhone } from './validation.js';

/**
 * Token sign-in, and the signup and password-reset flows, on the api()
 * client: every function returns an envelope ({ok, data, code, message, …})
 * and never throws for a server answer.
 *
 * The portal is built on these. The mobile app still uses the legacy
 * functions in auth.js (checkUser, signInUser, …), which keep their raw
 * responses so no screen had to change; it moves here when it starts sending
 * tokens. The flow and the rules are the same either way — this is the mobile
 * PhoneNumberEnter → PhoneNumberValidate → ProfileEdit sequence, written once:
 *
 *   startVerification(identity, purpose)      send a code (SMS or e-mail)
 *   confirmVerification(identity, code, purpose)  → envelope.proof
 *   completeSignup(proof, details)            create the account, then sign in
 *   completeReset(proof, password)            set the password, then sign in
 *
 * A proof is {channel, identity, ticket?}. For e-mail the ticket is the
 * server's single-use, ten-minute proof the code was right; for a phone the
 * server stamps the account itself, inside the same ten minutes.
 */

/** @typedef {'register'|'reset'} Purpose */
/** @typedef {{channel: 'phone'|'email', identity: string, ticket?: string}} Proof */
/**
 * What api() returns.
 * @typedef {{ok: boolean, data: any, code: string|null, message: string|null, raw: any, httpStatus: number|null}} Envelope
 */

export const PURPOSE = Object.freeze({ register: 'register', reset: 'reset' });

/** A client-side refusal, in the same shape as a server one. */
const refuse = (code) => ({ ok: false, data: null, code, message: null, raw: null, httpStatus: null });

const clean = (identity) => (typeof identity === 'string' ? identity.trim() : '');

/**
 * Exchanges a password for a bearer token (POST /core/user/login).
 *
 * On success the profile and the token are stored and 'signed_in' is
 * emitted. A success WITHOUT a token — a compware that predates token auth —
 * is reported as a failure rather than half-signing the user in.
 *
 * Codes: invalid_request, invalid_credentials, email_not_verified,
 * phone_not_verified, server_error, and the transport ones.
 */
export async function login(identity, password, { client = 'web' } = {}) {
    const id = clean(identity);
    const key = identityChannel(id) === 'email' ? 'email' : 'phone_number';

    const envelope = await api('URL_USER_LOGIN', {
        method: 'POST',
        body: { [key]: id, password, client },
        auth: false,
    });

    if (!envelope.ok) return envelope;

    if (typeof envelope.raw?.token !== 'string' || envelope.raw.token === '') {
        return { ...envelope, ok: false, data: null, code: 'invalid_response' };
    }

    await storeSession(envelope.raw);
    emitSession('signed_in');

    return envelope;
}

/**
 * Revokes the token server-side, then forgets the session locally whatever
 * the server said — signing out must work offline too.
 */
export async function logout() {
    if (await getToken()) {
        await api('URL_USER_LOGOUT', { method: 'POST' });
    }

    await clearStoredSession();
    emitSession('signed_out');
}

/**
 * Re-reads the signed-in user (GET /core/user/me) and refreshes the stored
 * profile. With no token, answers auth_required without a request. A token
 * the server refuses ends the session inside api(), which emits 'expired'.
 */
export async function fetchMe() {
    if (!(await getToken())) return refuse('auth_required');

    const envelope = await api('URL_USER_ME');

    if (envelope.ok && envelope.data) {
        await storeUser(envelope.data);
    }

    return envelope;
}

/**
 * Sends a code to a phone number (SMS) or an e-mail address.
 *
 * For a phone the account is checked first, as the mobile screen does:
 * signing up with a number that can already log in is already_registered,
 * resetting one with no account is not_registered. A password-less account
 * left behind by an unfinished signup is neither — it may finish signing up.
 * For an address the server makes those calls itself (email_taken,
 * no_account).
 *
 * @param {string} identity
 * @param {Purpose} purpose
 */
export async function startVerification(identity, purpose) {
    const id = clean(identity);

    if (identityChannel(id) === 'email') {
        if (!isValidEmail(id)) return refuse('email_invalid');

        return api('URL_USER_EMAIL_CODE_SEND', { query: { email: id, purpose }, auth: false });
    }

    if (!isValidPhone(id)) return refuse('phone_invalid');

    const check = await api('URL_USER_IDENTITY_CHECK', { query: { identity: id }, auth: false });
    if (!check.ok) return check;

    const flags = check.data || {};
    if (purpose === PURPOSE.register && flags.can_login) return refuse('already_registered');
    if (purpose === PURPOSE.reset && !flags.exists) return refuse('not_registered');

    const sent = await api('URL_USER_MESSAGE_SENT', { query: { phone_number: id }, auth: false });

    return sent.ok ? sent : { ...sent, code: sent.code ?? 'sms_failed' };
}

/**
 * Checks the code. On success the envelope carries `proof`, which is all the
 * next step needs — the code itself never has to outlive this call.
 *
 * @returns {Promise<Envelope & {proof?: Proof}>}
 */
export async function confirmVerification(identity, code, purpose) {
    const id = clean(identity);
    const entered = clean(code);

    if (identityChannel(id) === 'email') {
        const envelope = await api('URL_USER_EMAIL_CODE_VERIFY', {
            query: { email: id, code: entered, purpose }, auth: false,
        });

        if (!envelope.ok || !envelope.data?.ticket) {
            return envelope.ok ? { ...envelope, ok: false, code: 'invalid_response' } : envelope;
        }

        return { ...envelope, proof: { channel: 'email', identity: id, ticket: envelope.data.ticket } };
    }

    const envelope = await api('URL_USER_VERIFY_CODE', { query: { phone_number: id, code: entered }, auth: false });

    return envelope.ok ? { ...envelope, proof: { channel: 'phone', identity: id } } : envelope;
}

/**
 * Creates the account on the proved identity, then signs in.
 *
 * The other identity is optional. An e-mail signup may carry a phone number,
 * saved unverified (refused as phone_taken if it is someone else's). A phone
 * signup may carry an address only if nobody has it (email_taken).
 *
 * The envelope returned is the LOGIN's on success. If the account was made
 * but the sign-in failed, the failure comes back with `created: true`, so the
 * UI can say "created, please sign in" instead of "failed".
 *
 * @param {Proof} proof
 * @param {{firstname: string, lastname: string, password: string, phoneNumber?: string, email?: string}} details
 * @returns {Promise<Envelope & {created?: boolean}>}
 */
export async function completeSignup(proof, details) {
    const isEmail = proof.channel === 'email';

    const created = await api('URL_USER_REGISTER', {
        method: 'POST',
        auth: false,
        body: {
            // The controller requires the key, even empty.
            email: isEmail ? proof.identity : clean(details.email),
            phoneNumber: isEmail ? clean(details.phoneNumber) : proof.identity,
            firstname: clean(details.firstname),
            lastname: clean(details.lastname),
            picture: '',
            password: details.password,
            channel: proof.channel,
            ticket: proof.ticket ?? '',
        },
    });

    if (!created.ok) return created;

    const signedIn = await login(proof.identity, details.password);

    return signedIn.ok ? signedIn : { ...signedIn, created: true };
}

/**
 * Sets a new password on the proved identity, then signs in.
 *
 * E-mail goes to /password/reset with the ticket. A phone goes through
 * /register, which sets the password only within ten minutes of the code
 * being verified — that IS the phone reset; nothing else authenticates it.
 * Names are sent empty, which /register leaves untouched, so this never needs
 * to read the account (the mobile app reads it through /get/phonenumber,
 * which hands the whole row to anyone).
 *
 * Same `created`-style flag as completeSignup: `changed: true` on a failed
 * sign-in after a successful change.
 *
 * @param {Proof} proof
 * @param {string} password
 * @returns {Promise<Envelope & {changed?: boolean}>}
 */
export async function completeReset(proof, password) {
    const changed = proof.channel === 'email'
        ? await api('URL_USER_PASSWORD_RESET', {
            method: 'POST',
            auth: false,
            body: { email: proof.identity, ticket: proof.ticket ?? '', password },
        })
        : await api('URL_USER_REGISTER', {
            method: 'POST',
            auth: false,
            body: {
                email: '', phoneNumber: proof.identity, firstname: '', lastname: '',
                picture: '', password, channel: 'phone', ticket: '',
            },
        });

    if (!changed.ok) return changed;

    const signedIn = await login(proof.identity, password);

    return signedIn.ok ? signedIn : { ...signedIn, changed: true };
}

/**
 * The mobile ProfileEdit password rule, as a translation key or null.
 * Required, and typed the same twice. (No length rule: the app has none, and
 * one client refusing what the other accepts is its own bug.)
 */
export function passwordProblem(password, confirm) {
    if (!password) return 'passwordRequired';
    if (password !== confirm) return 'passwordMismatch';
    return null;
}

/**
 * Records that the signed-in user accepted the Terms (compware POST
 * /core/user/terms/accept, token-only): rti_user.terms_version and
 * terms_accepted_at. Answers auth_required without a request when no token
 * is stored.
 */
export async function acceptTerms(version = TERMS_VERSION) {
    if (!(await getToken())) return { ok: false, data: null, code: 'auth_required', message: null, raw: null, httpStatus: null };
    return api('URL_USER_TERMS_ACCEPT', { method: 'POST', body: { version } });
}

/** Whether a user (as /me or sign-in returns it) has accepted the current Terms. */
export const termsAccepted = (user, version = TERMS_VERSION) => (user?.termsVersion ?? user?.terms_version ?? null) === version;
