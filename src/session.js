import { getStorage, STORAGE_KEYS } from './config.js';

/**
 * Who is signed in, as an event stream, so a UI can follow a session that
 * ends somewhere other than a logout button — a token the server stops
 * accepting, say.
 *
 * Events: 'signed_in', 'signed_out', 'expired' (the server refused the token),
 * 'deleted' (the account was deleted). Only the api()-based token
 * flow (login, logout, a rejected token) emits; the mobile app's legacy calls
 * do not, and have no need to.
 */

const listeners = new Set();

/**
 * @param {(event: 'signed_in'|'signed_out'|'expired'|'deleted') => void} listener
 * @returns {() => void} unsubscribe
 */
export function subscribeSession(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function emitSession(event) {
    for (const listener of [...listeners]) {
        try { listener(event); } catch (e) { /* one bad listener must not stop the rest */ }
    }
}

/** Forgets the stored profile and token. Emits nothing; callers say why. */
export async function clearStoredSession() {
    const storage = getStorage();
    await storage.removeItem(STORAGE_KEYS.user);
    await storage.removeItem(STORAGE_KEYS.token);
}
