import { ENDPOINT_PATHS } from './endpoints.js';
import { getConfig, getFetch, getStorage, STORAGE_KEYS } from './config.js';
import { clearStoredSession, emitSession } from './session.js';

/**
 * The compware API client.
 *
 * Two entry points, on purpose:
 *
 *  - fetchJson(url, init)  — the mobile app's historical contract: the parsed
 *    JSON body, or null on any network or parse failure. Exists so the mobile
 *    app's helpers can move here without a single behaviour change.
 *
 *  - api(path, options)    — the normalised client the portal is built on.
 *    Encodes every query value, times out, sends the token, and turns every
 *    answer into one predictable envelope (see normalize below).
 *
 * New code should use api().
 */

/** Sent on every api() call; lets compware opt a client into the v2 error shape. */
export const API_VERSION_HEADER = 'X-Uniq-Api';
export const API_VERSION = '2';

export class ApiError extends Error {
    /**
     * @param {string} message
     * @param {{kind: 'network'|'timeout'|'http'|'parse'|'api', code?: string|null,
     *          httpStatus?: number|null, envelope?: object|null}} details
     */
    constructor(message, details) {
        super(message);
        this.name = 'ApiError';
        this.kind = details.kind;
        this.code = details.code ?? null;
        this.httpStatus = details.httpStatus ?? null;
        this.envelope = details.envelope ?? null;
    }
}

/**
 * Builds a query string, encoding every value. Skips undefined and null so an
 * optional parameter is simply absent rather than sent as "undefined".
 */
export function buildQuery(params) {
    if (!params) return '';

    const parts = [];

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    }

    return parts.length ? '?' + parts.join('&') : '';
}

/**
 * The legacy contract: parsed JSON or null. Never throws.
 */
export async function fetchJson(url, init) {
    try {
        const response = await getFetch()(url, init);
        return await response.json();
    } catch (error) {
        return null;
    }
}

/**
 * Turns any compware answer into one shape:
 *
 *   { ok, data, code, message, raw, httpStatus }
 *
 * The trap this exists for: on failure, 112 of the 114 controller actions put
 * the exception MESSAGE STRING in `data`. A string has `.length`, so a caller
 * checking `data.length > 0` before `data.map(...)` crashes on every error.
 * Here a failed answer always has data === null and the text in `message`,
 * whichever shape the server used.
 *
 * Extra top-level fields some endpoints send alongside data (eventType,
 * isStarted, type, period_year, coverage, …) stay available on `raw`.
 */
export function normalize(raw, httpStatus = null) {
    if (!raw || typeof raw !== 'object') {
        return { ok: false, data: null, code: 'invalid_response', message: null, raw: raw ?? null, httpStatus };
    }

    if (raw.status === true) {
        return { ok: true, data: raw.data ?? null, code: raw.code ?? null, message: raw.message ?? null, raw, httpStatus };
    }

    const stringData = typeof raw.data === 'string' && raw.data !== '' ? raw.data : null;

    return {
        ok: false,
        data: stringData ? null : (raw.data ?? null),
        code: raw.code ?? null,
        message: raw.message ?? stringData,
        raw,
        httpStatus,
    };
}

/**
 * An envelope's data as a list — [] for anything that is not an array. Use
 * this instead of checking .length on data.
 */
export function asList(envelope) {
    return envelope && envelope.ok && Array.isArray(envelope.data) ? envelope.data : [];
}

/** Throws ApiError for a failed envelope, returns data otherwise. For TanStack Query. */
export function unwrap(envelope) {
    if (envelope && envelope.ok) return envelope.data;

    throw new ApiError(envelope?.message || envelope?.code || 'Request failed', {
        kind: 'api',
        code: envelope?.code ?? null,
        httpStatus: envelope?.httpStatus ?? null,
        envelope: envelope ?? null,
    });
}

export async function getToken() {
    try {
        return await getStorage().getItem(STORAGE_KEYS.token);
    } catch (error) {
        return null;
    }
}

/**
 * Calls a compware endpoint and returns a normalised envelope.
 *
 * Transport failures (no network, timeout, a non-JSON body such as an HTML
 * error page) also come back as envelopes with ok:false and a `code` of
 * network_error / timeout / invalid_response — so callers handle exactly one
 * shape. Pass { throw: true } to get an ApiError instead.
 *
 * @param {keyof typeof ENDPOINT_PATHS | string} endpoint
 *        An ENDPOINT_PATHS key (preferred) or a path starting with '/'.
 * @param {{method?: string, query?: object, body?: object, auth?: boolean,
 *          signal?: AbortSignal, timeoutMs?: number, throw?: boolean}} [options]
 */
export async function api(endpoint, options = {}) {
    const { baseUrl, timeoutMs: defaultTimeout } = getConfig();
    const path = ENDPOINT_PATHS[endpoint] ?? endpoint;

    if (typeof path !== 'string' || !path.startsWith('/')) {
        throw new Error(`@uniq/shared: unknown endpoint "${endpoint}"`);
    }

    const method = (options.method || (options.body ? 'POST' : 'GET')).toUpperCase();
    const url = baseUrl + path + buildQuery(options.query);

    const headers = { Accept: 'application/json', [API_VERSION_HEADER]: API_VERSION };

    let sentToken = false;
    if (options.auth !== false) {
        const token = await getToken();
        if (token) {
            headers.Authorization = 'Bearer ' + token;
            sentToken = true;
        }
    }

    const init = { method, headers };

    if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(options.body);
    }

    const timeoutMs = options.timeoutMs ?? defaultTimeout;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timedOut = false;
    let timer = null;

    if (controller) {
        init.signal = controller.signal;
        if (options.signal) {
            if (options.signal.aborted) controller.abort();
            else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
        }
        if (timeoutMs > 0) {
            timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
        }
    }

    // The caller may have cancelled while we were awaiting the token. Do not
    // send a request nobody is waiting for.
    if (options.signal?.aborted) {
        if (timer) clearTimeout(timer);
        const envelope = { ok: false, data: null, raw: null, httpStatus: null, code: 'aborted', message: 'The request was cancelled' };
        if (options.throw) {
            throw new ApiError(envelope.message, { kind: 'network', code: 'aborted', envelope });
        }
        return envelope;
    }

    let envelope;

    try {
        let response;

        try {
            response = await getFetch()(url, init);
        } catch (error) {
            // Distinguish our timeout and a caller cancelling (a component
            // unmounting) from a real network failure — only the last is
            // worth telling the user about.
            const code = timedOut ? 'timeout' : options.signal?.aborted ? 'aborted' : 'network_error';
            envelope = {
                ok: false, data: null, raw: null, httpStatus: null, code,
                message: code === 'timeout' ? 'The request timed out'
                    : code === 'aborted' ? 'The request was cancelled'
                    : (error?.message || 'Network error'),
            };
        }

        if (!envelope) {
            let raw = null;
            try {
                raw = await response.json();
            } catch (error) {
                raw = null;
            }

            envelope = normalize(raw, response.status);

            // A 2xx with a JSON body is the normal case, even for status:false.
            // Anything else without a usable body is an HTTP-level failure.
            if (raw === null && envelope.code === 'invalid_response' && !response.ok) {
                envelope.code = 'http_error';
                envelope.message = `HTTP ${response.status}`;
            }
        }
    } finally {
        if (timer) clearTimeout(timer);
    }

    // compware answers EVERY request carrying a dead token with 401
    // auth_invalid, public ones included — it never quietly falls back to
    // anonymous. So a stored token that expired would break the whole app,
    // browse pages and all. Forget it, tell the UI, and ask again without it:
    // a public call then simply works, and a token-only one comes back
    // auth_required, which is the truth.
    if (sentToken && envelope.code === 'auth_invalid') {
        await clearStoredSession();
        emitSession('expired');
        return api(endpoint, { ...options, auth: false });
    }

    if (options.throw && !envelope.ok) {
        const kind = envelope.code === 'timeout' ? 'timeout'
            : envelope.code === 'network_error' ? 'network'
            : envelope.code === 'http_error' ? 'http'
            : envelope.code === 'invalid_response' ? 'parse'
            : 'api';
        throw new ApiError(envelope.message || envelope.code || 'Request failed', {
            kind, code: envelope.code, httpStatus: envelope.httpStatus, envelope,
        });
    }

    return envelope;
}
