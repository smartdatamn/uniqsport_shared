import { api, getToken } from './client.js';

/**
 * Asking for an entry fee back. compware RefundRequestRepository; staff
 * decide in compadmin and transfer the money by hand.
 *
 * Who may ask: whoever may act for the athlete, or whoever paid the entry in
 * a basket. What: a paid, approved entry, until the event's
 * update_final_date. The entry stays as it is until staff decide. The amount
 * is 99% of what was paid (refundAmount) - QPay's 1% is not returned. One
 * request per athlete and competition; a request still 'requested' can be
 * withdrawn, which lets the athlete ask again.
 *
 * Every call is POST and token-only, answering auth_required without a
 * request when no token is stored.
 */

const refuse = (code) => ({ ok: false, data: null, code, message: null, raw: null, httpStatus: null });

async function post(endpoint, body) {
    if (!(await getToken())) return refuse('auth_required');
    return api(endpoint, { method: 'POST', body });
}

/** What staff transfer back: 99% of what was paid, whole tögrög. */
export const REFUND_SHARE = 0.99;
export const refundAmount = (paid) => Math.round(Number(paid || 0) * REFUND_SHARE);

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
