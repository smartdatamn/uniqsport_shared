import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as refunds from '../src/refunds.js';
import { STORAGE_KEYS } from '../src/config.js';
import { errorMessage } from '../src/errors.js';
import { tr } from '../src/i18n.js';
import { setup } from './helpers.js';

const TOKEN = '12|' + 'x'.repeat(48);
const SIGNED_IN = { [STORAGE_KEYS.token]: TOKEN, [STORAGE_KEYS.user]: JSON.stringify({ userid: 8520 }) };

test('without a token: auth_required, and no request', async () => {
    const { calls } = setup({}, { initialStorage: {} });
    assert.equal((await refunds.requestRefund(1, {})).code, 'auth_required');
    assert.equal((await refunds.myRefunds()).code, 'auth_required');
    assert.equal(calls.length, 0);
});

test('a request is a POST with the trimmed bank details, spaces out of the account number', async () => {
    const { calls } = setup({ '/comp/refund/request': () => ({ status: true, data: { id: 3, status: 'requested' } }) }, { initialStorage: SIGNED_IN });

    await refunds.requestRefund(11, { bankName: ' Хаан банк ', bankAccount: '5049 1191 63', accountHolder: ' Болд ', reason: '' });

    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].init.body), { reg_id: 11, bank_name: 'Хаан банк', bank_account: '5049119163', account_holder: 'Болд', reason: '' });
});

test('my requests for one competition; withdrawing by id', async () => {
    const { calls } = setup({
        '/comp/refund/mine': () => ({ status: true, data: [] }),
        '/comp/refund/withdraw': () => ({ status: true, data: { id: 3, withdrawn: true } }),
    }, { initialStorage: SIGNED_IN });

    await refunds.myRefunds(781);
    await refunds.myRefunds();
    await refunds.withdrawRefund(3);
    assert.deepEqual(calls.map((c) => JSON.parse(c.init.body)), [{ event_id: 781 }, {}, { request_id: 3 }]);
});

test('98% back, whole tögrög', () => {
    assert.equal(refunds.refundAmount(30000), 29400);
    assert.equal(refunds.refundAmount('45000.00'), 44100);
    assert.equal(refunds.refundAmount(null), 0);
});

test('bank details: the server\'s rules', () => {
    assert.deepEqual(refunds.bankDetailsProblems({ bankName: 'Хаан банк', bankAccount: '5049 1191 63', accountHolder: 'Болд' }), []);
    assert.deepEqual(refunds.bankDetailsProblems({ bankName: ' ', bankAccount: '50-49', accountHolder: '' }), ['bankName', 'bankAccount', 'accountHolder']);
    assert.deepEqual(refunds.bankDetailsProblems({ bankName: 'X', bankAccount: 'MN12000500', accountHolder: 'Y' }), []);
});

test('every refund code and status has a message', () => {
    for (const code of ['not_paid', 'not_refundable', 'refund_closed', 'bank_details_invalid', 'refund_exists', 'refund_not_found', 'refund_decided']) {
        assert.notEqual(errorMessage(code, { fallback: '__none__' }), '__none__', code);
    }
    for (const key of Object.values(refunds.REFUND_STATUS_KEYS)) assert.notEqual(tr(key), key, key);
});

test('the refund deadline is the end of registration; open until the server says finished', () => {
    assert.equal(refunds.refundDeadline({ config: { reg_end_date: '2026-11-01 00:00:00' } }), '2026-11-01 00:00:00');
    assert.equal(refunds.refundDeadline({ config: {} }), null);
    assert.equal(refunds.refundsOpen({ isFinished: false }), true);
    assert.equal(refunds.refundsOpen({ isFinished: true }), false);
});

test('a merged entry may ask for 24 hours from the move, after registration ended', () => {
    const closed = { isFinished: true };
    const movedAt = '2026-10-04 10:00:00';   // server time, Ulaanbaatar
    const end = refunds.mergedWindowEnd({ merged_at: movedAt });
    assert.equal(end.toISOString(), '2026-10-05T02:00:00.000Z');
    assert.equal(refunds.refundOpenFor(closed, { merged_at: movedAt }, new Date('2026-10-05T01:59:00Z')), true);
    assert.equal(refunds.refundOpenFor(closed, { merged_at: movedAt }, new Date('2026-10-05T02:01:00Z')), false);
    assert.equal(refunds.refundOpenFor(closed, { merged_at: null }), false);
    assert.equal(refunds.refundOpenFor({ isFinished: false }, {}), true);
});

test('the merged window end, shown on the server clock', () => {
    assert.equal(refunds.mergedWindowEndText({ merged_at: '2026-10-04 23:30:00' }), '2026-10-05 23:30:00');
    assert.equal(refunds.mergedWindowEndText({ merged_at: null }), null);
});
