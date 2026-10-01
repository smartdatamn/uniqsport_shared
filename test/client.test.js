import { test } from 'node:test';
import assert from 'node:assert/strict';

import { api, asList, buildQuery, normalize, unwrap, ApiError } from '../src/client.js';
import { configure, memoryStorage, STORAGE_KEYS } from '../src/config.js';
import { setup, raw } from './helpers.js';

test('a failure that puts the message in data comes out with data null', () => {
    // The shape 112 of 114 compware actions return on an exception.
    const env = normalize({ status: false, data: 'SQLSTATE[22P02]: invalid input syntax' });
    assert.equal(env.ok, false);
    assert.equal(env.data, null);
    assert.equal(env.message, 'SQLSTATE[22P02]: invalid input syntax');
    assert.deepEqual(asList(env), [], 'a string data must never reach .map()');
});

test('the corrected failure shape is read the same way', () => {
    const env = normalize({ status: false, data: null, message: 'not found', code: 'registration_not_found' });
    assert.equal(env.message, 'not found');
    assert.equal(env.code, 'registration_not_found');
});

test('success keeps data and the extra top-level fields', () => {
    const env = normalize({ status: true, data: [{ id: 1 }], eventType: 2, isStarted: true });
    assert.equal(env.ok, true);
    assert.deepEqual(asList(env), [{ id: 1 }]);
    assert.equal(env.raw.eventType, 2);
});

test('asList returns [] for object data', () => {
    assert.deepEqual(asList(normalize({ status: true, data: { id: 1 } })), []);
});

test('buildQuery encodes every value and drops undefined/null', () => {
    assert.equal(buildQuery({ a: 'x y', b: undefined, c: null, d: 'Ө&=?', e: 0 }), '?a=x%20y&d=%D3%A8%26%3D%3F&e=0');
    assert.equal(buildQuery({}), '');
});

test('api() sends the version header, encodes the query, and normalises', async () => {
    const { calls } = setup({
        '/comp/event/list': () => ({ status: true, data: [{ id: 7 }] }),
    });

    const env = await api('URL_COMP_EVENT_LIST', { query: { sport_id: 3, name: 'Бөх' } });

    assert.equal(env.ok, true);
    assert.deepEqual(env.data, [{ id: 7 }]);
    assert.equal(calls[0].query.sport_id, '3');
    assert.equal(calls[0].query.name, 'Бөх');
    assert.equal(calls[0].init.method, 'GET');
    assert.equal(calls[0].init.headers['X-Uniq-Api'], '2');
    assert.equal(calls[0].init.headers.Authorization, undefined, 'no token stored, no header');
});

test('api() sends the bearer token once one is stored', async () => {
    const { calls } = setup(
        { '/core/user/get/id': () => ({ status: true, data: {} }) },
        { initialStorage: { [STORAGE_KEYS.token]: 'abc123' } },
    );

    await api('URL_USER_GET_ID');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer abc123');

    await api('URL_USER_GET_ID', { auth: false });
    assert.equal(calls[1].init.headers.Authorization, undefined);
});

test('api() POSTs JSON when given a body', async () => {
    const { calls } = setup({ '/comp/event/register': () => ({ status: true }) });

    await api('URL_COMP_EVENT_REGISTER', { body: { reg_id: 0, eventId: 5 } });

    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), { reg_id: 0, eventId: 5 });
});

test('an HTML error page becomes an http_error envelope, not a crash', async () => {
    // What compware returns today with APP_DEBUG on and an uncaught exception.
    setup({ '/comp/event/team/delete': () => raw(500, '<!doctype html><title>Ignition</title>') });

    const env = await api('URL_COMP_EVENT_TEAM_DELETE', { query: { id: 1 } });
    assert.equal(env.ok, false);
    assert.equal(env.code, 'http_error');
    assert.equal(env.httpStatus, 500);
});

test('a network failure becomes a network_error envelope', async () => {
    setup({ '/comp/event/list': () => { throw new TypeError('Failed to fetch'); } });

    const env = await api('URL_COMP_EVENT_LIST');
    assert.equal(env.code, 'network_error');
    assert.equal(env.message, 'Failed to fetch');
});

test('a slow server becomes a timeout envelope', async () => {
    configure({
        baseUrl: 'https://api.test',
        storage: memoryStorage(),
        timeoutMs: 30,
        // Never answers; only rejects when the client aborts it.
        // Like a real fetch: rejects at once for an already-aborted signal,
        // otherwise only when the client aborts it.
        fetch: (url, init) => new Promise((_, reject) => {
            if (init.signal.aborted) return reject(new Error('aborted'));
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });

    const env = await api('URL_COMP_EVENT_LIST');
    assert.equal(env.code, 'timeout');
});

test('a caller cancelling is reported as aborted, not as a network failure', async () => {
    const controller = new AbortController();
    configure({
        baseUrl: 'https://api.test',
        storage: memoryStorage(),
        // Like a real fetch: rejects at once for an already-aborted signal,
        // otherwise only when the client aborts it.
        fetch: (url, init) => new Promise((_, reject) => {
            if (init.signal.aborted) return reject(new Error('aborted'));
            init.signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });

    // Cancelled before the request goes out (while the token is being read)…
    const early = api('URL_COMP_EVENT_LIST', { signal: controller.signal });
    controller.abort();
    assert.equal((await early).code, 'aborted');

    // …and cancelled while it is in flight.
    const late = new AbortController();
    const inFlight = api('URL_COMP_EVENT_LIST', { signal: late.signal });
    await new Promise((r) => setTimeout(r, 5));
    late.abort();
    assert.equal((await inFlight).code, 'aborted');
});

test('throw: true raises a typed ApiError', async () => {
    setup({ '/comp/event/entries': () => ({ status: false, data: 'boom' }) });

    await assert.rejects(
        api('URL_COMP_EVENT_ENTRIES', { throw: true }),
        (err) => err instanceof ApiError && err.kind === 'api' && err.message === 'boom',
    );
});

test('unwrap returns data or throws', () => {
    assert.deepEqual(unwrap(normalize({ status: true, data: [1] })), [1]);
    assert.throws(() => unwrap(normalize({ status: false, data: 'nope' })), ApiError);
});

test('an unknown endpoint name is a programming error', async () => {
    setup({});
    await assert.rejects(api('URL_DOES_NOT_EXIST'), /unknown endpoint/);
});
