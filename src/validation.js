/*
 * TODO(international-phone): every phone number is assumed to be a local
 * 8-digit Mongolian one. Widening that is not a matter of changing this
 * number — several of the places the assumption lives are server-side (SMS
 * carrier routing keys on the first two digits). See "Phone numbers are
 * assumed 8-digit Mongolian" in uniqsport/CLAUDE.md.
 */
export const PHONE_LENGTH_MN = 8;

export function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Exactly 8 digits. A leading + is stripped by the input before this runs. */
export function isValidPhone(phoneNumber) {
    return typeof phoneNumber === 'string'
        && phoneNumber.length === PHONE_LENGTH_MN
        && /^[0-9]+$/.test(phoneNumber);
}

/**
 * A phone number or an email address, told apart the same way the backend
 * does it: an identity containing @ is an address.
 */
export function identityChannel(identity) {
    return (identity ? identity : '').indexOf('@') !== -1 ? 'email' : 'phone';
}
