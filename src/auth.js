import { buildEndpoints } from './endpoints.js';
import { buildQuery, fetchJson } from './client.js';
import { getConfig, getStorage, STORAGE_KEYS } from './config.js';
import { identityChannel } from './validation.js';

/**
 * Account and identity calls. Moved from uniqsport/app/classes/UserHelper.js.
 *
 * Behaviour is deliberately unchanged, so the mobile app can re-export this
 * as its UserHelper with no screen touched: every function returns the raw
 * JSON response (or null on a network failure), the stored profile keeps its
 * historical key names, and the same requests go out. The only differences
 * are that storage is injected, every query value is now URL-encoded (several
 * were not, which was harmless only because they were digits), and a value
 * that is undefined or null is left out rather than sent as "undefined".
 *
 * IDENTITY TODAY: compware authenticates nothing. Every call below identifies
 * the user by a user_id read from the stored profile, and that id is the only
 * credential. Forward-compatible with token auth: once compware returns a
 * `token` beside the user row, storeSession() keeps it and the api() client
 * sends it. Until then that code path is inert.
 */

const url = (name) => buildEndpoints(getConfig().baseUrl)[name];

const getJson = (name, params) => fetchJson(url(name) + buildQuery(params));

const postJson = (name, body) => fetchJson(url(name), {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

const succeeded = (response) => response && response.status == true && response.data;

export async function getUserInfo() {
    const user = await getStorage().getItem(STORAGE_KEYS.user);
    return user != null ? JSON.parse(user) : null;
}

export async function logoutUser() {
    const storage = getStorage();
    await storage.removeItem(STORAGE_KEYS.user);
    await storage.removeItem(STORAGE_KEYS.token);
}

/**
 * Writes a user record from the backend into the stored profile.
 *
 * Merges over whatever is already stored instead of replacing it: a response
 * that omits a field would otherwise silently drop it locally even though the
 * record is correct server-side.
 *
 * The key names are the ones the mobile app reads (userid, phoneNumber,
 * image) — adding keys is safe, renaming them logs nobody out but breaks
 * every screen that reads them.
 */
export async function storeUser(data) {
    if (!data) {
        return null;
    }

    const stored = await getUserInfo();

    const userInfo = Object.assign({}, stored, {
        userid: data.id,
        email: data.email,
        phoneNumber: data.mobile_number,
        firstname: data.firstname,
        lastname: data.lastname,
        image: data.image,
        isVerified: data.is_verified == true,
        emailVerified: data.email_verified == true,
        pendingPhoneNumber: data.pending_mobile_number ? data.pending_mobile_number : '',
        pendingEmail: data.pending_email ? data.pending_email : '',
    });

    await getStorage().setItem(STORAGE_KEYS.user, JSON.stringify(userInfo));

    return userInfo;
}

/**
 * Stores what a successful login/signup handed back: the user row, and the
 * bearer token once compware starts issuing one (as a `token` key beside
 * `data`). A response without a token leaves any stored token alone.
 */
export async function storeSession(response) {
    if (!succeeded(response)) return null;

    if (typeof response.token === 'string' && response.token !== '') {
        await getStorage().setItem(STORAGE_KEYS.token, response.token);
    }

    return storeUser(response.data);
}

/**
 * Logs in with either channel. Returns the whole response, not a bool: the
 * caller needs the code to tell "wrong password" apart from "this address is
 * not confirmed yet", which wants an offer to resend rather than a refusal.
 *
 * NOTE: the password travels in the query string, as it always has. The
 * portal must not use this — it uses POST /core/user/login once compware
 * has it (plan, chunk 0.6).
 */
export async function checkUser(identity, password) {
    const param = identityChannel(identity) === 'email' ? 'email' : 'phone_number';
    const user = await getJson('URL_USER_CHECK', { [param]: identity, password });

    if (succeeded(user)) {
        await storeSession(user);
    }

    return user;
}

/**
 * What the signup screen is allowed to know about an identity: flags, not the
 * account. getUserByPhoneNumber returns the whole user row to anybody who
 * asks, which is why signup no longer uses it.
 */
export function checkIdentity(identity) {
    return getJson('URL_USER_IDENTITY_CHECK', { identity });
}

/**
 * Mails a 4-digit code — the same shape as the SMS one, so both channels
 * share the code screen. purpose is 'register' or 'reset'.
 */
export function sendEmailCode(email, purpose = 'register') {
    return getJson('URL_USER_EMAIL_CODE_SEND', { email, purpose });
}

/**
 * Trades the code for a single-use ticket, so the raw code never has to
 * survive a screen transition.
 */
export function verifyEmailCode(email, code, purpose = 'register') {
    return getJson('URL_USER_EMAIL_CODE_VERIFY', { email, code, purpose });
}

export function resetPasswordByEmail(email, ticket, password) {
    return getJson('URL_USER_PASSWORD_RESET', { email, ticket, password });
}

/**
 * Returns the whole user row for a number. Only ever call this AFTER the
 * number has been proved by a code — fetching it earlier handed the record to
 * anyone who typed a number they did not own.
 */
export function getUserByPhoneNumber(phoneNumber) {
    return getJson('URL_USER_GET_PHONENUMBER', { phone_number: phoneNumber });
}

export function sendVerificationCode(phoneNumber) {
    return getJson('URL_USER_MESSAGE_SENT', { phone_number: phoneNumber });
}

/**
 * Creates the account, or finishes one that was started by a code.
 *
 * channel says which identity was actually proved, and ticket is the proof
 * for the email one. The backend writes only the identity you proved: an
 * unproved address arriving on a phone signup is refused rather than saved,
 * because setting an address on an account you reached by phone number is a
 * way to claim somebody's login.
 */
export async function signInUser(email, lastname, firstname, picture = '', phoneNumber = '', password = '', channel = 'phone', ticket = '') {
    try {
        const mobileToken = await getStorage().getItem(STORAGE_KEYS.mobileToken);

        const user = await postJson('URL_USER_REGISTER', {
            email,
            firstname,
            lastname,
            mobile_token: mobileToken,
            picture,
            phoneNumber,
            password,
            channel,
            ticket,
        });

        if (succeeded(user)) {
            await storeSession(user);
        }

        return user;
    } catch (error) {
        return null;
    }
}

/**
 * Saves the fields that need no verification. Phone and email are refused by
 * this endpoint on purpose; they each have their own flow below.
 */
export async function updateUserInfo(firstname, lastname, picture = '') {
    const stored = await getUserInfo();

    if (!stored) {
        return false;
    }

    const mobileToken = await getStorage().getItem(STORAGE_KEYS.mobileToken);

    const response = await postJson('URL_USER_UPDATE', {
        user_id: stored.userid,
        firstname,
        lastname,
        picture,
        mobile_token: mobileToken,
    });

    if (succeeded(response)) {
        await storeUser(response.data);
        return true;
    }

    return false;
}

/**
 * Re-reads the profile so verification state picked up elsewhere — an emailed
 * link opened in a browser, say — shows up. On any failure the stored profile
 * is returned untouched: a dropped request must never look like "no longer
 * verified".
 */
export async function refreshUserInfo() {
    const stored = await getUserInfo();

    if (!stored) {
        return null;
    }

    const response = await getJson('URL_USER_GET_ID', { user_id: stored.userid });

    if (succeeded(response)) {
        return storeUser(response.data);
    }

    return stored;
}

/**
 * Starts a phone change: the code goes to the NEW number and nothing is
 * written to the account until it comes back verified.
 *
 * The current password is required: this API authenticates nothing, so
 * without it anyone knowing a user id could point that account at a phone
 * they control and take it over.
 */
export async function sendPhoneChangeCode(phoneNumber, password) {
    const stored = await getUserInfo();

    if (!stored) {
        return null;
    }

    return getJson('URL_USER_PHONE_CHANGE_SEND', {
        user_id: stored.userid,
        phone_number: phoneNumber,
        password: password ? password : '',
    });
}

/**
 * Confirms the pending phone change. The new number comes back on the
 * response and is stored from there, so the client can never disagree with
 * the server about what the account's number is.
 */
export async function verifyPhoneChangeCode(code) {
    const stored = await getUserInfo();

    if (!stored) {
        return null;
    }

    const response = await getJson('URL_USER_PHONE_CHANGE_VERIFY', { user_id: stored.userid, code });

    if (succeeded(response)) {
        await storeUser(response.data);
    }

    return response;
}

/**
 * Starts an email change: the code goes to the NEW address and nothing is
 * written until it comes back. The current password is required for the same
 * reason as the phone change.
 */
export async function changeEmail(email, password) {
    const stored = await getUserInfo();

    if (!stored) {
        return null;
    }

    const response = await getJson('URL_USER_EMAIL_CHANGE', {
        user_id: stored.userid,
        email,
        password: password ? password : '',
    });

    if (succeeded(response)) {
        await storeUser(response.data);
    }

    return response;
}

export async function verifyEmailChangeCode(code) {
    const stored = await getUserInfo();

    if (!stored) {
        return null;
    }

    const response = await getJson('URL_USER_EMAIL_CHANGE_VERIFY', { user_id: stored.userid, code });

    if (succeeded(response)) {
        await storeUser(response.data);
    }

    return response;
}

export async function resendEmailVerification() {
    const stored = await getUserInfo();

    if (!stored) {
        return null;
    }

    return getJson('URL_USER_EMAIL_VERIFY_RESEND', { user_id: stored.userid });
}

export async function deleteProfile() {
    const user = await getUserInfo();

    if (!user) {
        return false;
    }

    const response = await getJson('URL_USER_DELETE', { user_id: user.userid });

    return !!(response && response.status == true);
}
