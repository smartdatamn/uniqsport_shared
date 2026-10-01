import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tr, setLanguage, getItemField } from '../src/i18n.js';
import { errorMessage } from '../src/errors.js';
import { datePart, dateTimePart, serverInstant, countdownTo, currencyFormat, pictureUrl, memberPhotoUrl } from '../src/format.js';
import { parseQPay, qrImageSrc, toAmount, invoiceKind, pollUntilPaid, errorMessage as paymentError } from '../src/payments.js';
import { readEventConfig, registrationWindow } from '../src/eventConfig.js';
import { isValidPhone, identityChannel } from '../src/validation.js';
import { en } from '../src/lang/en.js';
import { mn } from '../src/lang/mn.js';
import { setup } from './helpers.js';

test('tr falls back to mn, then to the key itself', async () => {
    setup({});
    await setLanguage('en');
    assert.equal(tr('no_such_key_anywhere'), 'no_such_key_anywhere');
    await setLanguage('mn');
});

test('a missing placeholder value renders empty, not as a stray comma', () => {
    // The mobile original did .join(params[key]); join(undefined) means "use
    // the default separator", so a missing {year} came out as ",".
    const key = Object.keys(mn).find((k) => mn[k].includes('{year}'));
    assert.ok(key, 'expected a {year} string to exist');
    assert.equal(tr(key, { year: undefined }), mn[key].split('{year}').join(''));
    assert.equal(tr(key, { year: 2027 }), mn[key].split('{year}').join('2027'));
});

test('getItemField reads name_en in English and name in Mongolian', async () => {
    setup({});
    const sport = { name: 'Жүдо', name_en: 'Judo' };
    await setLanguage('en');
    assert.equal(getItemField(sport), 'Judo');
    assert.equal(getItemField({ name: 'Жүдо' }), 'Жүдо', 'falls back to the content locale');
    await setLanguage('mn');
    assert.equal(getItemField(sport), 'Жүдо');
});

test('errorMessage: known code translated, unknown code to fallback', () => {
    assert.equal(errorMessage('email_taken'), tr('emailTaken'));
    assert.equal(errorMessage('never_heard_of_it', { fallback: 'alertMsgError' }), tr('alertMsgError'));
});

test('payment errors fall back to the backend text before the generic message', () => {
    assert.equal(paymentError('unknown_code', 'Сервер алдаа'), 'Сервер алдаа');
    assert.equal(paymentError(null, null), tr('errorTemporary'));
    assert.ok(paymentError('membership_fee_not_set', null, { year: 2027 }).includes('2027'));
});

test('server datetimes are read as Ulaanbaatar time, whatever the machine zone', () => {
    // 00:00 in Ulaanbaatar is 16:00 UTC the day before.
    assert.equal(serverInstant('2026-01-10 00:00:00').toISOString(), '2026-01-09T16:00:00.000Z');
    assert.equal(serverInstant('2026-01-10').toISOString(), '2026-01-09T16:00:00.000Z');
    assert.equal(serverInstant('2026-01-10T00:00:00Z').toISOString(), '2026-01-10T00:00:00.000Z');
    assert.equal(serverInstant('not a date'), null);
});

test('display formatting slices, exactly as the app always has', () => {
    assert.equal(datePart('2026-01-10 14:30:00'), '2026-01-10');
    assert.equal(dateTimePart('2026-01-10 14:30:00'), '2026-01-10 14:30');
    assert.equal(datePart(null), '');
});

test('countdown counts to the Ulaanbaatar instant and clamps at zero', () => {
    const now = new Date('2026-01-09T15:00:00.000Z'); // one hour before
    const c = countdownTo('2026-01-10 00:00:00', now);
    assert.deepEqual([c.days, c.hours, c.minutes, c.seconds], [0, 1, 0, 0]);
    assert.equal(countdownTo('2020-01-01 00:00:00', now).totalSeconds, 0);
});

test('currency and image URLs', () => {
    assert.equal(currencyFormat('20000.00', '₮'), '20,000₮');
    assert.equal(
        pictureUrl({ url: 'a.jpg', picture_type: { dir_url: '/event/cover' } }),
        'https://smartdata-uniq-app-bucket.s3.ap-northeast-2.amazonaws.com/event/cover/thumbnail/a.jpg',
    );
    assert.equal(
        memberPhotoUrl('/member/9001/memberpr_1.png'),
        'https://smartdata-uniq-app-bucket.s3.ap-northeast-2.amazonaws.com/member/9001/memberpr_1.png',
    );
    assert.equal(memberPhotoUrl(null), null);
});

test('parseQPay handles the JSON-in-a-string and the error-string cases', () => {
    const qpay = { invoice_id: 'inv1', qr_image: 'AAAA' };
    assert.deepEqual(parseQPay({ response_message: JSON.stringify(qpay) }), qpay);
    assert.equal(parseQPay('Undefined array key "reg_id"'), null, 'data was the error string');
    assert.equal(parseQPay({ response_message: '{not json' }), null);
    assert.equal(qrImageSrc(qpay), 'data:image/jpeg;base64,AAAA');
    assert.equal(toAmount('20000.00'), 20000);
    assert.equal(toAmount('abc'), null);
});

test('invoiceKind tells the three create/invoice answers apart', () => {
    assert.equal(invoiceKind({ status: true, data: {} }), 'event');
    assert.equal(invoiceKind({ status: true, type: 'membership', code: 'membership_required' }), 'membership');
    assert.equal(invoiceKind({ status: true, type: 'membership_choice', options: [] }), 'membership_choice');
    assert.equal(invoiceKind({ status: false, code: 'membership_fee_not_set' }), 'error');
    assert.equal(invoiceKind(null), 'error');
});

test('pollUntilPaid stops when paid and never overlaps checks', async () => {
    let inFlight = 0, maxInFlight = 0, n = 0;
    const result = await pollUntilPaid(async () => {
        inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 15)); // slower than the interval
        inFlight--;
        return ++n === 3;
    }, { intervalMs: 5 });

    assert.equal(result, 'paid');
    assert.equal(n, 3);
    assert.equal(maxInFlight, 1);
});

test('pollUntilPaid can be aborted and times out', async () => {
    const controller = new AbortController();
    const pending = pollUntilPaid(async () => false, { intervalMs: 5, signal: controller.signal });
    controller.abort();
    assert.equal(await pending, 'aborted');
    assert.equal(await pollUntilPaid(async () => false, { intervalMs: 5, timeoutMs: 20 }), 'timeout');
});

test('readEventConfig exposes only the server booleans', () => {
    const cfg = readEventConfig({
        status: true, eventType: 1, data: { id: 112, is_team: false },
        isStarted: true, isFinished: false, isPaymentFinished: false, isUpdateFinished: true,
        genders: [{ gender_code: 1, total: 17 }],
    });
    assert.equal(registrationWindow(cfg), 'open');
    assert.equal(cfg.isOlympiad, false);
    assert.equal(cfg.isUpdateFinished, true);
    assert.equal(Object.isFrozen(cfg), true);
    assert.equal(readEventConfig({ status: false, data: 'boom' }), null);
    assert.equal(readEventConfig({ status: true, eventType: 2, data: {} }).isOlympiad, true);
});

test('validation', () => {
    assert.equal(isValidPhone('99112233'), true);
    assert.equal(isValidPhone('+9761122'), false);
    assert.equal(isValidPhone('9911223'), false);
    assert.equal(identityChannel('a@b.mn'), 'email');
    assert.equal(identityChannel(undefined), 'phone');
});
