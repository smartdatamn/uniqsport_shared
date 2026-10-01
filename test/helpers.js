import { configure, memoryStorage } from '../src/config.js';

/**
 * Configures the package against an in-memory store and a scripted fetch.
 * `routes` maps a path (no host, no query) to a handler returning either a
 * plain object (sent as a 200 JSON body), or {status, body} for full control,
 * or throwing to simulate a network failure.
 */
export function setup(routes = {}, { initialStorage = {}, timeoutMs } = {}) {
    const storage = memoryStorage(initialStorage);
    const calls = [];

    const fetch = async (url, init = {}) => {
        const u = new URL(url);
        const call = { url, path: u.pathname, query: Object.fromEntries(u.searchParams), init };
        calls.push(call);

        const handler = routes[u.pathname];
        if (!handler) return response(404, '<html>Not Found</html>');

        const out = await handler(call);
        if (out && out.__raw) return response(out.status, out.body);
        return response(200, JSON.stringify(out));
    };

    configure({ baseUrl: 'https://api.test', storage, fetch, ...(timeoutMs ? { timeoutMs } : {}) });

    return { storage, calls };
}

/** A non-JSON (or custom-status) response body. */
export const raw = (status, body) => ({ __raw: true, status, body });

function response(status, body) {
    return {
        status,
        ok: status >= 200 && status < 300,
        async json() { return JSON.parse(body); },
    };
}
