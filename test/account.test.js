import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as account from '../src/account.js';
import { api } from '../src/client.js';
import { STORAGE_KEYS } from '../src/config.js';
import { errorMessage } from '../src/errors.js';
import { subscribeSession } from '../src/session.js';
import { raw, setup } from './helpers.js';

const USER_ROW = { id: 8520, email: 'a@example.com', mobile_number: null, firstname: 'Бат', lastname: 'Дорж', is_verified: false, email_verified: true };
const TOKEN = '12|' + 'x'.repeat(48);
const LOGIN_OK = { status: true, data: USER_ROW, token: TOKEN, token_type: 'Bearer', expires_at: '2026-10-31T20:00:00+08:00' };

const body = (call) => JSON.parse(call.init.body);
const events = () => {
    const seen = [];
    const stop = subscribeSession((e) => seen.push(e));
    return { seen, stop };
};

test('login posts the password in a JSON body, never the URL, and stores the session', async () => {
    const { calls, storage } = setup({ '/core/user/login': () => LOGIN_OK }, { initialStorage: { [STORAGE_KEYS.token]: 'stale' } });
    const { seen, stop } = events();

    const res = await account.login(' a@example.com ', 'p@ss');
    stop();

    assert.equal(res.ok, true);
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(calls[0].query, {}, 'nothing in the query string');
    assert.deepEqual(body(calls[0]), { email: 'a@example.com', password: 'p@ss', client: 'web' });
    assert.equal(calls[0].init.headers.Authorization, undefined, 'a stale token is not sent to login');

    const dump = storage.dump();
    assert.equal(dump[STORAGE_KEYS.token], TOKEN);
    assert.equal(JSON.parse(dump[STORAGE_KEYS.user]).userid, 8520);
    assert.deepEqual(seen, ['signed_in']);
});

test('a phone number logs in as phone_number', async () => {
    const { calls } = setup({ '/core/user/login': () => LOGIN_OK });
    await account.login('99112233', 'x');
    assert.equal(body(calls[0]).phone_number, '99112233');
    assert.equal(body(calls[0]).email, undefined);
});

test('a refused login stores nothing and passes the code on', async () => {
    const { storage } = setup({ '/core/user/login': () => ({ status: false, data: null, code: 'email_not_verified', message: '…' }) });

    const res = await account.login('a@example.com', 'x');

    assert.equal(res.ok, false);
    assert.equal(res.code, 'email_not_verified');
    assert.deepEqual(storage.dump(), {});
});

test('a "success" without a token is not a sign-in (a compware without token auth)', async () => {
    const { storage } = setup({ '/core/user/login': () => ({ status: true, data: USER_ROW }) });

    const res = await account.login('a@example.com', 'x');

    assert.equal(res.ok, false);
    assert.equal(res.code, 'invalid_response');
    assert.deepEqual(storage.dump(), {}, 'no half-signed-in user');
});

test('a dead token is dropped and the call retried anonymously, so public pages keep working', async () => {
    const { calls, storage } = setup({
        '/comp/event/sport/list': (call) => (call.init.headers.Authorization
            ? raw(401, JSON.stringify({ status: false, data: null, code: 'auth_invalid', message: 'expired' }))
            : { status: true, data: [{ id: 1 }] }),
    }, { initialStorage: { [STORAGE_KEYS.token]: TOKEN, [STORAGE_KEYS.user]: '{"userid":8520}' } });
    const { seen, stop } = events();

    const res = await api('URL_COMP_EVENT_SPORT_LIST');
    stop();

    assert.equal(res.ok, true);
    assert.deepEqual(res.data, [{ id: 1 }]);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].init.headers.Authorization, undefined);
    assert.deepEqual(storage.dump(), {}, 'token and profile forgotten');
    assert.deepEqual(seen, ['expired']);
});

test('auth_invalid without a token sent is left alone (no loop, no event)', async () => {
    const { calls } = setup({ '/core/user/me': () => raw(401, JSON.stringify({ status: false, code: 'auth_invalid' })) });
    const { seen, stop } = events();

    const res = await api('URL_USER_ME');
    stop();

    assert.equal(res.code, 'auth_invalid');
    assert.equal(calls.length, 1);
    assert.deepEqual(seen, []);
});

test('fetchMe without a token answers auth_required without asking', async () => {
    const { calls } = setup({});
    const res = await account.fetchMe();
    assert.equal(res.code, 'auth_required');
    assert.equal(calls.length, 0);
});

test('fetchMe refreshes the stored profile', async () => {
    const { storage } = setup({ '/core/user/me': () => ({ status: true, data: { ...USER_ROW, firstname: 'Шинэ' } }) },
        { initialStorage: { [STORAGE_KEYS.token]: TOKEN } });

    await account.fetchMe();

    assert.equal(JSON.parse(storage.dump()[STORAGE_KEYS.user]).firstname, 'Шинэ');
});

test('logout revokes the token, and signs out locally even when the server cannot be reached', async () => {
    const { calls, storage } = setup({ '/core/user/logout': () => { throw new Error('offline'); } },
        { initialStorage: { [STORAGE_KEYS.token]: TOKEN, [STORAGE_KEYS.user]: '{"userid":8520}' } });
    const { seen, stop } = events();

    await account.logout();
    stop();

    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer ' + TOKEN);
    assert.deepEqual(storage.dump(), {});
    assert.deepEqual(seen, ['signed_out']);
});

test('signup by phone: an account that can already log in is refused before any SMS', async () => {
    const { calls } = setup({
        '/core/user/identity/check': () => ({ status: true, data: { exists: true, can_login: true } }),
        '/core/user/message/send': () => ({ status: true }),
    });

    const res = await account.startVerification('99112233', 'register');

    assert.equal(res.code, 'already_registered');
    assert.deepEqual(calls.map((c) => c.path), ['/core/user/identity/check']);
});

test('signup by phone: a password-less leftover account may finish signing up', async () => {
    const { calls } = setup({
        '/core/user/identity/check': () => ({ status: true, data: { exists: true, can_login: false } }),
        '/core/user/message/send': () => ({ status: true, message: 'sent' }),
    });

    const res = await account.startVerification('99112233', 'register');

    assert.equal(res.ok, true);
    assert.deepEqual(calls[1].query, { phone_number: '99112233' });
});

test('reset by phone: no account, no SMS', async () => {
    const { calls } = setup({ '/core/user/identity/check': () => ({ status: true, data: { exists: false, can_login: false } }) });
    const res = await account.startVerification('99112233', 'reset');
    assert.equal(res.code, 'not_registered');
    assert.equal(calls.length, 1);
});

test('a failed SMS send says so', async () => {
    setup({
        '/core/user/identity/check': () => ({ status: true, data: { exists: false } }),
        '/core/user/message/send': () => ({ status: false, message: 'Баталгаажуулах кодыг илгээлж чадсангүй.' }),
    });
    assert.equal((await account.startVerification('99112233', 'register')).code, 'sms_failed');
});

test('malformed identities are refused without a request', async () => {
    const { calls } = setup({});
    assert.equal((await account.startVerification('9911', 'register')).code, 'phone_invalid');
    assert.equal((await account.startVerification('a@b', 'register')).code, 'email_invalid');
    assert.equal(calls.length, 0);
});

test('an e-mail code is sent with its purpose; the server decides taken / no account', async () => {
    const { calls } = setup({ '/core/user/email/code/send': () => ({ status: false, code: 'no_account' }) });
    const res = await account.startVerification('a@example.com', 'reset');
    assert.deepEqual(calls[0].query, { email: 'a@example.com', purpose: 'reset' });
    assert.equal(res.code, 'no_account');
});

test('confirming an e-mail code yields a proof carrying the ticket', async () => {
    setup({ '/core/user/email/code/verify': () => ({ status: true, data: { ticket: 'T'.repeat(48) } }) });
    const res = await account.confirmVerification('a@example.com', ' 1234 ', 'register');
    assert.deepEqual(res.proof, { channel: 'email', identity: 'a@example.com', ticket: 'T'.repeat(48) });
});

test('confirming a phone code yields a proof; a wrong one yields its code', async () => {
    setup({ '/core/user/verified/code': (call) => (call.query.code === '1234' ? { status: true } : { status: false, code: 'code_invalid' }) });
    assert.deepEqual((await account.confirmVerification('99112233', '1234', 'register')).proof, { channel: 'phone', identity: '99112233' });
    const wrong = await account.confirmVerification('99112233', '0000', 'register');
    assert.equal(wrong.code, 'code_invalid');
    assert.equal(wrong.proof, undefined);
});

test('signup by e-mail registers with the ticket, then signs in', async () => {
    const { calls, storage } = setup({
        '/core/user/register': () => ({ status: true, data: USER_ROW }),
        '/core/user/login': () => LOGIN_OK,
    });

    const res = await account.completeSignup(
        { channel: 'email', identity: 'a@example.com', ticket: 'T' },
        { firstname: ' Бат ', lastname: 'Дорж', password: 'pw', phoneNumber: '99112233' },
    );

    assert.equal(res.ok, true);
    assert.deepEqual(body(calls[0]), {
        email: 'a@example.com', phoneNumber: '99112233', firstname: 'Бат', lastname: 'Дорж',
        picture: '', password: 'pw', channel: 'email', ticket: 'T',
    });
    assert.equal(calls[1].path, '/core/user/login');
    assert.equal(storage.dump()[STORAGE_KEYS.token], TOKEN);
});

test('signup refused by the server stops there', async () => {
    const { calls } = setup({ '/core/user/register': () => ({ status: false, code: 'phone_taken', message: '…' }) });
    const res = await account.completeSignup({ channel: 'email', identity: 'a@example.com', ticket: 'T' },
        { firstname: 'A', lastname: 'B', password: 'pw', phoneNumber: '99112233' });
    assert.equal(res.code, 'phone_taken');
    assert.equal(calls.length, 1);
});

test('created but not signed in is reported as such', async () => {
    setup({
        '/core/user/register': () => ({ status: true, data: USER_ROW }),
        '/core/user/login': () => ({ status: false, code: 'server_error' }),
    });
    const res = await account.completeSignup({ channel: 'phone', identity: '99112233' }, { firstname: 'A', lastname: 'B', password: 'pw' });
    assert.equal(res.ok, false);
    assert.equal(res.created, true);
});

test('phone reset goes through /register with empty names, so the account is never read', async () => {
    const { calls } = setup({
        '/core/user/register': () => ({ status: true, data: USER_ROW }),
        '/core/user/login': () => LOGIN_OK,
    });

    const res = await account.completeReset({ channel: 'phone', identity: '99112233' }, 'new-pw');

    assert.equal(res.ok, true);
    assert.deepEqual(body(calls[0]), {
        email: '', phoneNumber: '99112233', firstname: '', lastname: '', picture: '', password: 'new-pw', channel: 'phone', ticket: '',
    });
    assert.ok(!calls.some((c) => c.path === '/core/user/get/phonenumber'));
});

test('e-mail reset posts the ticket to /password/reset', async () => {
    const { calls } = setup({
        '/core/user/password/reset': () => ({ status: true, data: USER_ROW }),
        '/core/user/login': () => LOGIN_OK,
    });

    await account.completeReset({ channel: 'email', identity: 'a@example.com', ticket: 'T' }, 'new-pw');

    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(body(calls[0]), { email: 'a@example.com', ticket: 'T', password: 'new-pw' });
    assert.deepEqual(calls[0].query, {}, 'the new password is not in the URL');
});

test('the password rule matches the mobile one', () => {
    assert.equal(account.passwordProblem('', ''), 'passwordRequired');
    assert.equal(account.passwordProblem('a', 'b'), 'passwordMismatch');
    assert.equal(account.passwordProblem('a', 'a'), null);
});

test('every new code has a message', () => {
    for (const code of ['invalid_request', 'invalid_credentials', 'email_not_verified', 'phone_not_verified',
        'auth_required', 'auth_invalid', 'already_registered', 'not_registered', 'sms_failed']) {
        assert.notEqual(errorMessage(code, { fallback: '__none__' }), '__none__', code);
    }
});
