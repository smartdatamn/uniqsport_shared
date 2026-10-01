/**
 * The one place a host app wires @uniq/shared to its platform.
 *
 * This package must never import AsyncStorage, localStorage, React, Expo or
 * anything else platform-specific. The app passes those in instead:
 *
 *   // mobile
 *   configure({ baseUrl: HOST_COMPWARE, storage: AsyncStorage });
 *
 *   // portal
 *   configure({ baseUrl: import.meta.env.VITE_API_URL, storage: webStorage() });
 *
 * Keeping it injected is also what lets the whole package run under plain
 * Node, which is where the tests run.
 */

/**
 * @typedef {object} Storage
 * @property {(key: string) => Promise<string|null>} getItem
 * @property {(key: string, value: string) => Promise<void>} setItem
 * @property {(key: string) => Promise<void>} removeItem
 */

/**
 * @typedef {object} SharedConfig
 * @property {string} baseUrl         compware root, no trailing slash
 * @property {Storage} storage        async key/value store
 * @property {typeof fetch} [fetch]   defaults to the global fetch
 * @property {number} [timeoutMs]     per-request timeout for the API client
 */

/** @type {SharedConfig|null} */
let current = null;

/** Storage keys. Renaming one logs every existing mobile user out. */
export const STORAGE_KEYS = Object.freeze({
    user: 'user',
    token: 'auth_token',
    mobileToken: '@mobile_token',
    language: 'language',
});

/** @param {SharedConfig} options */
export function configure(options) {
    if (!options || typeof options.baseUrl !== 'string' || options.baseUrl === '') {
        throw new Error('@uniq/shared: configure() needs a baseUrl');
    }

    if (!options.storage || typeof options.storage.getItem !== 'function') {
        throw new Error('@uniq/shared: configure() needs a storage with getItem/setItem/removeItem');
    }

    current = {
        timeoutMs: 20000,
        ...options,
        baseUrl: options.baseUrl.replace(/\/+$/, ''),
    };

    return current;
}

/** @returns {SharedConfig} */
export function getConfig() {
    if (!current) {
        throw new Error('@uniq/shared: call configure() before using the package');
    }

    return current;
}

export function isConfigured() {
    return current !== null;
}

export function getStorage() {
    return getConfig().storage;
}

export function getFetch() {
    const f = getConfig().fetch || globalThis.fetch;

    if (typeof f !== 'function') {
        throw new Error('@uniq/shared: no fetch available — pass one to configure()');
    }

    return f;
}

/**
 * Wraps a synchronous Web Storage (localStorage) in the async interface. A
 * browser that refuses storage — Safari private mode, a blocked cookie
 * policy — degrades to "nothing persisted" rather than throwing.
 */
export function webStorage(store = globalThis.localStorage) {
    return {
        async getItem(key) {
            try { return store.getItem(key); } catch (e) { return null; }
        },
        async setItem(key, value) {
            try { store.setItem(key, value); } catch (e) { /* not persisted */ }
        },
        async removeItem(key) {
            try { store.removeItem(key); } catch (e) { /* nothing to remove */ }
        },
    };
}

/** An in-memory storage, for tests and for Node. */
export function memoryStorage(initial = {}) {
    const map = new Map(Object.entries(initial));

    return {
        async getItem(key) { return map.has(key) ? map.get(key) : null; },
        async setItem(key, value) { map.set(key, String(value)); },
        async removeItem(key) { map.delete(key); },
        dump() { return Object.fromEntries(map); },
    };
}
