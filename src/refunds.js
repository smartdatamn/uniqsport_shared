import { api, getToken } from './client.js';

/**
 * Asking for an entry fee back. compware RefundRequestRepository; staff
 * decide in compadmin and transfer the money by hand.
 *
 * Who may ask: whoever may act for the athlete, or whoever paid the entry in
 * a basket. What: a paid, approved entry, until registration ends (the
 * event's reg_end_date - refundDeadline). Staff authorize the refund in
 * compadmin, which cancels the entry ('refunded') at once and notifies the
 * person who asked. The amount is 98% of what was paid (refundAmount) - bank
 * and transaction fees, usually 2%, are not returned. One request per athlete
 * and competition; a request still 'requested' can be withdrawn, which lets
 * the athlete ask again.
 *
 * Every call is POST and token-only, answering auth_required without a
 * request when no token is stored.
 */

const refuse = (code) => ({ ok: false, data: null, code, message: null, raw: null, httpStatus: null });

async function post(endpoint, body) {
    if (!(await getToken())) return refuse('auth_required');
    return api(endpoint, { method: 'POST', body });
}

/** What staff transfer back: 98% of what was paid, whole tögrög (2% bank and transaction fees). */
export const REFUND_SHARE = 0.98;
export const refundAmount = (paid) => Math.round(Number(paid || 0) * REFUND_SHARE);

/**
 * The last moment to ask for a refund: the end of registration, from
 * readEventConfig()'s result. Null when the event sets no end.
 */
export function refundDeadline(eventConfig) {
    const end = eventConfig?.config?.reg_end_date;
    return end ? String(end) : null;
}

/** Whether refunds can still be asked for - the server's own isFinished. */
export const refundsOpen = (eventConfig) => eventConfig?.isFinished !== true;

/** Request states, as compware sends them (trimmed), to translation keys. */
export const REFUND_STATUS_KEYS = Object.freeze({
    requested: 'refundStatusRequested',
    approved: 'refundStatusApproved',
    rejected: 'refundStatusRejected',
});

/** Spaces are dropped from the account number, as compware does. */
const accountOf = (value) => String(value ?? '').replace(/\s+/g, '');

/**
 * What the form still lacks, by field: 'bankName', 'bankAccount',
 * 'accountHolder'. The same rules compware applies (bank_details_invalid).
 */
export function bankDetailsProblems({ bankName, bankAccount, accountHolder } = {}) {
    const problems = [];
    const bank = String(bankName ?? '').trim();
    const holder = String(accountHolder ?? '').trim();
    if (bank === '' || bank.length > 100) problems.push('bankName');
    if (!/^[A-Za-z0-9]{5,50}$/.test(accountOf(bankAccount))) problems.push('bankAccount');
    if (holder === '' || holder.length > 200) problems.push('accountHolder');
    return problems;
}

/** Banks people pay from in Mongolia, for the form's suggestions. Free text is still accepted. */
export const BANK_NAMES = Object.freeze([
    'Хаан банк', 'Голомт банк', 'Худалдаа хөгжлийн банк', 'Хас банк', 'Төрийн банк',
    'Капитрон банк', 'Богд банк', 'М банк', 'Ариг банк', 'Тээвэр хөгжлийн банк', 'Чингис хаан банк',
]);

export function requestRefund(regId, { bankName, bankAccount, accountHolder, reason = '' } = {}) {
    return post('URL_COMP_REFUND_REQUEST', {
        reg_id: regId,
        bank_name: String(bankName ?? '').trim(),
        bank_account: accountOf(bankAccount),
        account_holder: String(accountHolder ?? '').trim(),
        reason: String(reason ?? '').trim(),
    });
}

/**
 * My requests, newest first; for one competition when eventId is given.
 * @param {number|null} [eventId]
 */
export const myRefunds = (eventId = null) =>
    post('URL_COMP_REFUND_MINE', eventId ? { event_id: eventId } : {});

export const withdrawRefund = (requestId) => post('URL_COMP_REFUND_WITHDRAW', { request_id: requestId });
