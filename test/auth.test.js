import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as auth from '../src/auth.js';
import { STORAGE_KEYS } from '../src/config.js';
import { setup } from './helpers.js';

const USER_ROW = {
    id: 4102, email: 'a@example.com', mobile_number: '99112233',
    firstname: 'Бат', lastname: 'Дорж', image: '', is_verified: true,
    email_verified: false, pending_mobile_number: null, pending_email: null,
};

test('checkUser sends the right channel, stores the profile, returns the raw response', async () => {
    const { calls, storage } = setup({
        '/core/user/check': () => ({ status: true, data: USER_ROW }),
    });

    const res = await auth.checkUser('99112233', 'p@ss&word');

    assert.equal(res.status, true, 'the raw response, as mobile screens expect');
    assert.equal(calls[0].query.phone_number, '99112233');
    assert.equal(calls[0].query.password, 'p@ss&word', 'special characters survive encoding');

    const stored = JSON.parse((await storage.dump())[STORAGE_KEYS.user]);
    assert.equal(stored.userid, 4102);
    assert.equal(stored.phoneNumber, '99112233');
    assert.equal(stored.isVerified, true);
    assert.equal(stored.pendingEmail, '');
});

test('an @ in the identity logs in by email', async () => {
    const { calls } = setup({ '/core/user/check': () => ({ status: false, code: 'email_not_verified' }) });

    const res = await auth.checkUser('a@example.com', 'x');
    assert.equal(calls[0].query.email, 'a@example.com');
    assert.equal(res.code, 'email_not_verified', 'the code reaches the caller');
});

test('a token beside the user row is stored, ready for token auth', async () => {
    const { storage } = setup({
        '/core/user/check': () => ({ status: true, data: USER_ROW, token: 'tok-1', token_type: 'Bearer' }),
    });

    await auth.checkUser('99112233', 'x');
    assert.equal(storage.dump()[STORAGE_KEYS.token], 'tok-1');
});

test('storeUser merges over the stored profile instead of replacing it', async () => {
    const { storage } = setup({}, {
        initialStorage: { [STORAGE_KEYS.user]: JSON.stringify({ userid: 4102, localOnly: 'keep me' }) },
    });

    await auth.storeUser({ ...USER_ROW, firstname: 'Шинэ' });
    const stored = JSON.parse(storage.dump()[STORAGE_KEYS.user]);

    assert.equal(stored.localOnly, 'keep me');
    assert.equal(stored.firstname, 'Шинэ');
});

test('calls made for the stored user send its user_id', async () => {
    const { calls } = setup(
        { '/core/user/email/verify/resend': () => ({ status: true }) },
        { initialStorage: { [STORAGE_KEYS.user]: JSON.stringify({ userid: 4102 }) } },
    );

    await auth.resendEmailVerification();
    assert.equal(calls[0].query.user_id, '4102');
});

test('no stored user means no request at all', async () => {
    const { calls } = setup({});

    assert.equal(await auth.resendEmailVerification(), null);
    assert.equal(await auth.deleteProfile(), false);
    assert.equal(calls.length, 0);
});

test('refreshUserInfo keeps the stored profile when the request fails', async () => {
    setup(
        { '/core/user/get/id': () => { throw new TypeError('Failed to fetch'); } },
        { initialStorage: { [STORAGE_KEYS.user]: JSON.stringify({ userid: 4102, isVerified: true }) } },
    );

    const user = await auth.refreshUserInfo();
    assert.equal(user.isVerified, true, 'a dropped request must never look like "no longer verified"');
});

test('signInUser POSTs JSON with the stored push token', async () => {
    const { calls } = setup(
        { '/core/user/register': () => ({ status: true, data: USER_ROW }) },
        { initialStorage: { [STORAGE_KEYS.mobileToken]: 'ExponentPushToken[x]' } },
    );

    await auth.signInUser('a@example.com', 'Дорж', 'Бат', '', '', 'pw', 'email', 'ticket-1');
    const body = JSON.parse(calls[0].init.body);

    assert.equal(calls[0].init.method, 'POST');
    assert.equal(body.mobile_token, 'ExponentPushToken[x]');
    assert.equal(body.channel, 'email');
    assert.equal(body.ticket, 'ticket-1');
});

test('logoutUser clears the profile and the token', async () => {
    const { storage } = setup({}, {
        initialStorage: { [STORAGE_KEYS.user]: '{"userid":1}', [STORAGE_KEYS.token]: 't' },
    });

    await auth.logoutUser();
    assert.deepEqual(storage.dump(), {});
});

test('a network failure returns null, as the mobile code expects', async () => {
    setup({ '/core/user/identity/check': () => { throw new TypeError('Failed to fetch'); } });
    assert.equal(await auth.checkIdentity('99112233'), null);
});
