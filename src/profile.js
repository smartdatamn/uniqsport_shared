import { api } from './client.js';
import { getUserInfo, storeUser } from './auth.js';
import { clearStoredSession, emitSession } from './session.js';

/**
 * Profile editing on the api() client — the mobile ProfileEdit screen's
 * account calls (auth.js has the legacy, raw-response versions the app still
 * uses).
 *
 * Every call is a POST, so the current password the identity changes need
 * never lands in a URL. Each sends the stored user_id, because the compware
 * actions require the key; with a token, compware overwrites it with the
 * token's user, so the value is never what identifies the caller.
 *
 * A successful answer that carries the user row rewrites the stored profile
 * from it, so the client never disagrees with the server about, say, which
 * number is the account's.
 *
 * The identity rules are compware's: a new phone number or address is
 * PENDING until the code sent to it comes back, and starting a change needs
 * the current password.
 */

const refuse = (code) => ({ ok: false, data: null, code, message: null, raw: null, httpStatus: null });

async function call(endpoint, fields) {
    const stored = await getUserInfo().catch(() => null);
    if (!stored) return refuse('auth_required');

    const envelope = await api(endpoint, { method: 'POST', body: { user_id: stored.userid, ...fields } });

    if (envelope.ok && envelope.data && typeof envelope.data === 'object' && envelope.data.id) {
        await storeUser(envelope.data);
    }

    return envelope;
}

/** Re-reads the account (get/id) into the stored profile. */
export const reloadProfile = () => call('URL_USER_GET_ID', {});

/** Names only. Phone and address each have their own verify-first flow. */
export function updateProfile({ firstname, lastname }) {
    return call('URL_USER_UPDATE', { firstname: (firstname ?? '').trim(), lastname: (lastname ?? '').trim() });
}

/**
 * Texts a code to the NEW number; nothing changes until it comes back. Also
 * how an unverified number already on the account gets verified: send the
 * same number. 60s between sends (too_many_requests).
 */
export function startPhoneChange(phoneNumber, password) {
    return call('URL_USER_PHONE_CHANGE_SEND', { phone_number: phoneNumber, password: password ?? '' });
}

export const confirmPhoneChange = (code) => call('URL_USER_PHONE_CHANGE_VERIFY', { code: String(code ?? '').trim() });

/** Mails a code to the NEW address; nothing changes until it comes back. */
export function startEmailChange(email, password) {
    return call('URL_USER_EMAIL_CHANGE', { email: (email ?? '').trim(), password: password ?? '' });
}

export const confirmEmailChange = (code) => call('URL_USER_EMAIL_CHANGE_VERIFY', { code: String(code ?? '').trim() });

/**
 * A fresh code for the address waiting to be confirmed — a pending change,
 * or an address saved unconfirmed. Needs no password: it targets only what is
 * already on the account.
 */
export const resendEmailCode = () => call('URL_USER_EMAIL_VERIFY_RESEND', {});

/**
 * Deletes the account and ends the session, emitting 'deleted' (not
 * 'signed_out') so a UI can say why it is signed out. compware revokes the
 * account's tokens with it. As on mobile, there is no password step — the confirmation
 * dialog is the UI's job.
 */
export async function deleteAccount() {
    const envelope = await call('URL_USER_DELETE', {});

    if (envelope.ok) {
        await clearStoredSession();
        emitSession('deleted');
    }

    return envelope;
}
