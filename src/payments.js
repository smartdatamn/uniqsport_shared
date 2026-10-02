import { api } from './client.js';
import { errorMessage as sharedErrorMessage } from './errors.js';

/**
 * QPay helpers shared by the event-fee and membership-fee flows.
 * Moved from uniqsport/app/classes/PaymentHelper.js.
 */

/** How often each flow polls its check-invoice endpoint, as the app does. */
export const POLL_INTERVAL_EVENT_MS = 2000;
export const POLL_INTERVAL_MEMBERSHIP_MS = 3000;

/**
 * data.response_message carries the QPay answer as JSON TEXT, not an object.
 * On an error the backend puts a plain string in data instead of the payment
 * row, so both the shape of data and the parse itself are guarded.
 *
 * @returns {{invoice_id?: string, qr_text?: string, qr_image?: string,
 *            urls?: Array<{name?: string, description?: string, logo?: string, link?: string}>}|null}
 */
export function parseQPay(data) {
    if (!data || typeof data !== 'object' || !data.response_message) {
        return null;
    }

    if (typeof data.response_message === 'object') {
        return data.response_message;
    }

    try {
        return JSON.parse(data.response_message);
    } catch (error) {
        return null;
    }
}

/** A data: URL for QPay's base64 QR image, ready for an <img>/<Image>. */
export function qrImageSrc(qpay) {
    return qpay && qpay.qr_image ? 'data:image/jpeg;base64,' + qpay.qr_image : null;
}

/** Amounts are PostgreSQL numerics and arrive as strings, e.g. "20000.00". */
export function toAmount(value) {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : null;
}

/**
 * Which of the three answers /core/payment/qpay/create/invoice gave.
 *
 * The COMPETITION endpoint can hand back a MEMBERSHIP invoice when the athlete
 * holds no membership covering the competition date — the athlete pays that
 * first, then asks for the competition invoice again. Easy to miss, because
 * nothing about the URL suggests it.
 *
 * @param {object|null} response the raw JSON from create/invoice
 * @returns {'event'|'membership'|'membership_choice'|'error'}
 */
export function invoiceKind(response) {
    if (!response || typeof response !== 'object') return 'error';
    if (response.type === 'membership_choice') return 'membership_choice';
    if (response.status !== true) return 'error';
    if (response.type === 'membership') return 'membership';
    return 'event';
}

/**
 * Turns a payment code into a translated message. An unknown code falls back
 * to the backend's own text, which is untranslated, and then to a generic
 * retryable message — the behaviour the mobile app has always had.
 */
export function errorMessage(code, data, params) {
    return sharedErrorMessage(code, { params, backendText: data, fallback: 'errorTemporary' });
}

/**
 * Polls `check` until it reports paid, the caller aborts, or `timeoutMs`
 * passes. `check` resolves to true when paid. Never overlaps two checks: the
 * next one is scheduled only after the previous one settles, which a bare
 * setInterval does not guarantee on a slow connection.
 *
 * Resolves to 'paid' | 'timeout' | 'aborted'.
 *
 * @param {() => Promise<boolean>} check
 * @param {{intervalMs?: number, timeoutMs?: number, signal?: AbortSignal}} [options]
 */
export function pollUntilPaid(check, options = {}) {
    const { intervalMs = POLL_INTERVAL_EVENT_MS, timeoutMs = 15 * 60 * 1000, signal } = options;
    const deadline = Date.now() + timeoutMs;

    return new Promise((resolve) => {
        let timer = null;

        const stop = (result) => {
            if (timer) clearTimeout(timer);
            signal?.removeEventListener?.('abort', onAbort);
            resolve(result);
        };

        const onAbort = () => stop('aborted');

        if (signal?.aborted) return stop('aborted');
        signal?.addEventListener?.('abort', onAbort, { once: true });

        const tick = async () => {
            if (signal?.aborted) return stop('aborted');

            let paid = false;
            try {
                paid = await check();
            } catch (error) {
                paid = false;
            }

            if (paid) return stop('paid');
            if (signal?.aborted) return stop('aborted');
            if (Date.now() >= deadline) return stop('timeout');

            timer = setTimeout(tick, intervalMs);
        };

        timer = setTimeout(tick, intervalMs);
    });
}

// --- On api(), for the portal ------------------------------------------------

/**
 * Asks compware for the invoice to pay a registration. Answers the api()
 * envelope plus `kind` (invoiceKind) and `qpay` (the parsed QPay answer, for
 * the QR and the payment link).
 *
 * The price is NOT sent: compware charges the division's fee itself (it used
 * to take the client's ?price=, which made every entry 1₮ to anyone who
 * asked). For a competition requiring membership the answer may be a
 * membership invoice or a membership_choice; pay that, then ask again.
 *
 * @param {number} regId
 * @param {{membershipTypeId?: number|null}} [options]
 */
export async function requestEventInvoice(regId, { membershipTypeId = null } = {}) {
    const envelope = await api('URL_COMP_EVENT_PAYMENT_CREATE_QPAY_INVOICE', {
        query: { reg_id: regId, membership_type_id: membershipTypeId ?? undefined },
    });

    return { ...envelope, kind: invoiceKind(envelope.raw), qpay: envelope.ok ? parseQPay(envelope.data) : null };
}

/** Whether a registration's invoice has been paid (compware asks QPay). */
export async function eventInvoicePaid(regId) {
    const envelope = await api('URL_COMP_EVENT_PAYMENT_CHECK_QPAY_INVOICE', { query: { reg_id: regId } });
    return envelope.raw?.status === true;
}

/** Whether a membership invoice has been paid (compware asks QPay). */
export async function membershipInvoicePaid(paymentId) {
    const envelope = await api('URL_COMP_EVENT_PAYMENT_CHECK_QPAY_MEMBERSHIP_INVOICE', { query: { payment_id: paymentId } });
    return envelope.raw?.status === true;
}
