import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as profile from '../src/profile.js';
import { STORAGE_KEYS } from '../src/config.js';
import { subscribeSession } from '../src/session.js';
import { setup } from './helpers.js';

const TOKEN = '12|' + 'x'.repeat(48);
const SIGNED_IN = {
    [STORAGE_KEYS.token]: TOKEN,
    [STORAGE_KEYS.user]: JSON.stringify({ userid: 8520, firstname: 'Бат', phoneNumber: '99112233', email: 'a@example.com' }),
};
const ROW = { id: 8520, firstname: 'Бат', lastname: 'Дорж', mobile_number: '99112233', email: 'a@example.com', is_verified: true, email_verified: true };

const body = (call) => JSON.parse(call.init.body);
const stored = (storage) => JSON.parse(storage.dump()[STORAGE_KEYS.user]);

test('signed out: refused without a request', async () => {
    const { calls } = setup({});
    assert.equal((await profile.updateProfile({ firstname: 'A', lastname: 'B' })).code, 'auth_required');
    assert.equal(calls.length, 0);
});

test('every call is a POST with the token, the stored user_id, and nothing in the URL', async () => {
    const { calls } = setup({ '/core/user/phone/change/send': () => ({ status: true }) }, { initialStorage: SIGNED_IN });

    await profile.startPhoneChange('88112233', 'cur-pw');

    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(calls[0].query, {}, 'the current password is not in the URL');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer ' + TOKEN);
    assert.deepEqual(body(calls[0]), { user_id: 8520, phone_number: '88112233', password: 'cur-pw' });
});

test('names are trimmed, and the answer rewrites the stored profile', async () => {
    const { calls, storage } = setup({ '/core/user/update': () => ({ status: true, data: { ...ROW, firstname: 'Шинэ' } }) },
        { initialStorage: SIGNED_IN });

    const res = await profile.updateProfile({ firstname: ' Шинэ ', lastname: 'Дорж' });

    assert.equal(res.ok, true);
    assert.deepEqual(body(calls[0]), { user_id: 8520, firstname: 'Шинэ', lastname: 'Дорж' });
    assert.equal(stored(storage).firstname, 'Шинэ');
});

test('a confirmed phone change stores the number the SERVER returns', async () => {
    const { storage } = setup({ '/core/user/phone/change/verify': () => ({ status: true, data: { ...ROW, mobile_number: '88112233' } }) },
        { initialStorage: SIGNED_IN });

    await profile.confirmPhoneChange(' 1234 ');

    assert.equal(stored(storage).phoneNumber, '88112233');
});

test('a refusal leaves the stored profile alone and passes the code on', async () => {
    const { storage } = setup({ '/core/user/email/change': () => ({ status: false, code: 'password_invalid', message: '…' }) },
        { initialStorage: SIGNED_IN });

    const res = await profile.startEmailChange('b@example.com', 'wrong');

    assert.equal(res.code, 'password_invalid');
    assert.equal(stored(storage).email, 'a@example.com');
});

test('deleting the account ends the session', async () => {
    const { calls, storage } = setup({ '/core/user/delete': () => ({ status: true, message: 'success' }) }, { initialStorage: SIGNED_IN });
    const seen = [];
    const stop = subscribeSession((e) => seen.push(e));

    const res = await profile.deleteAccount();
    stop();

    assert.equal(res.ok, true);
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(storage.dump(), {});
    assert.deepEqual(seen, ['deleted']);
});

test('a failed delete keeps the session', async () => {
    const { storage } = setup({ '/core/user/delete': () => ({ status: false, message: 'boom' }) }, { initialStorage: SIGNED_IN });
    await profile.deleteAccount();
    assert.equal(storage.dump()[STORAGE_KEYS.token], TOKEN);
});
