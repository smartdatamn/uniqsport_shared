import { tr } from './i18n.js';

/**
 * Backend failure code -> translation key. The single map for both clients.
 *
 * Consolidated from four places in uniqsport that each kept their own copy:
 * ProfileEditScreen.errorMessage(), PhoneNumberValidateScreen.errorMessage(),
 * PhoneNumberEnterScreen.errorMessage() and PaymentHelper.errorMessage().
 * Where two of them covered the same code they already agreed, so merging
 * changed no message.
 *
 * A new code the server can return is added HERE. The parity tests fail if a
 * key named here is missing from either locale.
 */
export const ERROR_KEYS = Object.freeze({
    // Identity and profile changes
    phone_taken: 'phoneAlreadyRegistered',
    // Kept apart from phone_taken on purpose: telling someone their NUMBER is
    // taken when it was their ADDRESS sends them looking in the wrong place.
    email_taken: 'emailTaken',
    phone_unchanged: 'phoneUnchanged',
    email_unchanged: 'emailUnchanged',
    phone_invalid: 'phoneLength',
    email_invalid: 'emailInvalid',
    no_account: 'emailNoAccount',
    identity_missing: 'identityMissing',
    identity_conflict: 'identityConflict',
    password_invalid: 'currentPasswordWrong',
    // An OTP shell that was never completed has no credential to prove, so it
    // cannot authorise a change to its own identity.
    password_not_set: 'currentPasswordNotSet',
    verification_required: 'verificationRequired',
    email_requires_verification: 'verificationRequired',
    phone_requires_verification: 'verificationRequired',
    ticket_invalid: 'verificationExpired',
    ticket_expired: 'verificationExpired',

    // Codes
    code_invalid: 'codeWrong',
    code_expired: 'codeExpired',
    no_pending_change: 'codeExpired',
    no_pending_email: 'codeExpired',
    no_pending_code: 'codeNotFound',
    too_many_attempts: 'codeTooManyAttempts',
    too_many_requests: 'waitBeforeResend',

    // Payment and membership
    membership_type_not_found: 'errorMembershipTypeNotFound',
    // Takes {year}: "the fee is not set up" is only actionable if the athlete
    // can tell the organiser WHICH year is missing.
    membership_fee_not_set: 'errorMembershipFeeNotSet',
    event_date_missing: 'errorEventDateMissing',
    membership_loop: 'errorMembershipLoop',
    registration_not_found: 'errorRegistrationNotFound',
    membership_active: 'membershipActive',
});

/** The translation key for a code, or null if the code is not known. */
export function errorKey(code) {
    return code && Object.prototype.hasOwnProperty.call(ERROR_KEYS, code) ? ERROR_KEYS[code] : null;
}

/**
 * A translated message for a failure code.
 *
 * @param {string|null|undefined} code
 * @param {{params?: object, fallback?: string, backendText?: unknown}} [options]
 *   params      — placeholder values, e.g. {year: 2027}
 *   fallback    — translation key used when the code is unknown
 *   backendText — the server's own (untranslated) text, shown for an unknown
 *                 code before falling back. Only payments opt into this.
 */
export function errorMessage(code, options = {}) {
    const { params, fallback = 'errorTemporary', backendText } = options;
    const key = errorKey(code);

    if (key) {
        return tr(key, params);
    }

    if (typeof backendText === 'string' && backendText !== '') {
        return backendText;
    }

    return tr(fallback, params);
}
