import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as payments from '../src/payments.js';
import { STORAGE_KEYS } from '../src/config.js';
import { errorMessage } from '../src/errors.js';
import { tr } from '../src/i18n.js';
import { setup } from './helpers.js';

const TOKEN = '12|' + 'x'.repeat(48);
const SIGNED_IN = { [STORAGE_KEYS.token]: TOKEN, [STORAGE_KEYS.user]: JSON.stringify({ userid: 8520 }) };

const BASKET = {
    status: true, type: 'basket',
    data: { id: 7, amount: '60000', status: 'pending', response_message: JSON.stringify({ invoice_id: 'FAKE-B', qr_image: 'iVBOR' }), lines: [{ reg_id: 1 }, { reg_id: 2 }] },
};

test('without a token: auth_required / not paid, and no request', async () => {
    const { calls } = setup({}, { initialStorage: {} });
    assert.equal((await payments.requestBasketInvoice(781, [1, 2])).code, 'auth_required');
    assert.equal(await payments.basketPaid(7), false);
    assert.equal(calls.length, 0);
});

test('a basket is a POST of the event and the registrations, no price, and parses the QR', async () => {
    const { calls } = setup({ '/core/payment/basket/create': () => BASKET }, { initialStorage: SIGNED_IN });

    const res = await payments.requestBasketInvoice(781, [1, 2]);

    assert.equal(res.ok, true);
    assert.equal(res.qpay.invoice_id, 'FAKE-B');
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].init.body), { event_id: 781, reg_ids: [1, 2] });
});

test('a refused basket: each registration\'s reason', async () => {
    setup({ '/core/payment/basket/create': () => ({ status: false, data: null, code: 'lines_invalid', message: 'm', lines: [{ reg_id: 2, code: 'membership_required' }] }) },
        { initialStorage: SIGNED_IN });

    const res = await payments.requestBasketInvoice(781, [1, 2]);
    assert.equal(res.code, 'lines_invalid');
    assert.equal(res.qpay, null);
    assert.deepEqual([...payments.basketLineErrors(res)], [[2, 'membership_required']]);
});

test('paid only when compware says so', async () => {
    let paid = false;
    setup({ '/core/payment/basket/check': () => ({ status: true, data: { paid } }) }, { initialStorage: SIGNED_IN });
    assert.equal(await payments.basketPaid(7), false);
    paid = true;
    assert.equal(await payments.basketPaid(7), true);
});

test('every basket code and line reason has a message', () => {
    for (const code of ['no_lines', 'too_many_lines', 'payment_closed', 'lines_invalid', 'invoice_failed', 'basket_not_found', 'in_basket']) {
        assert.notEqual(errorMessage(code, { fallback: '__none__' }), '__none__', code);
    }
    for (const key of Object.values(payments.BASKET_LINE_KEYS)) {
        assert.notEqual(tr(key), key, key);
    }
});

test('a standalone membership invoice sends the athlete and the sport, and reads "already covered"', async () => {
    const { calls } = setup({ '/core/payment/qpay/create/membership/invoice': () => ({ status: false, code: 'membership_active', data: {}, period_end: '2026-12-31' }) });
    const res = await payments.requestMembershipInvoice(41, 1, { membershipTypeId: 3 });
    const url = new URL(calls[0].url);
    assert.deepEqual([url.searchParams.get('member_id'), url.searchParams.get('sport_id'), url.searchParams.get('membership_type_id')], ['41', '1', '3']);
    assert.equal(res.code, 'membership_active');
    assert.equal(res.raw.period_end, '2026-12-31');
});
