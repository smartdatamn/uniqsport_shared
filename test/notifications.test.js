import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as notifications from '../src/notifications.js';
import { STORAGE_KEYS } from '../src/config.js';
import { setup } from './helpers.js';

const SIGNED_IN = { [STORAGE_KEYS.token]: '12|' + 'x'.repeat(48), [STORAGE_KEYS.user]: JSON.stringify({ userid: 8520 }) };

test('without a token: auth_required, and no request', async () => {
    const { calls } = setup({}, { initialStorage: {} });
    assert.equal((await notifications.myNotifications()).code, 'auth_required');
    assert.equal((await notifications.markNotificationsSeen()).code, 'auth_required');
    assert.equal(calls.length, 0);
});

test('list and seen are POSTs with the token, and send no user id', async () => {
    const { calls } = setup({
        '/core/user/notifications/mine': () => ({ status: true, data: { items: [], unseen: 0, seen_at: null } }),
        '/core/user/notifications/seen': () => ({ status: true, data: null }),
    }, { initialStorage: SIGNED_IN });
    const res = await notifications.myNotifications();
    await notifications.markNotificationsSeen();
    assert.equal(res.data.unseen, 0);
    assert.deepEqual(calls.map((c) => [new URL(c.url).pathname, c.init.method, new URL(c.url).search]), [
        ['/core/user/notifications/mine', 'POST', ''], ['/core/user/notifications/seen', 'POST', ''],
    ]);
});
