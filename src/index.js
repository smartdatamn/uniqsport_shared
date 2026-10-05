/**
 * @uniq/shared — logic and strings shared by the UniQ Sport mobile app
 * (uniqsport) and web portal (uniqsport_portal).
 *
 * Call configure() once at startup before anything else. Read CLAUDE.md
 * before adding to this package: no platform imports, no runtime
 * dependencies, no build step.
 */

import * as auth from './auth.js';
import * as i18n from './i18n.js';
import * as payments from './payments.js';
import { currencyFormat } from './format.js';
import { identityChannel, isValidEmail, isValidPhone } from './validation.js';

export {
    configure, getConfig, isConfigured, getStorage, webStorage, memoryStorage, STORAGE_KEYS,
} from './config.js';

export { ENDPOINT_PATHS, buildEndpoints } from './endpoints.js';

export {
    api, fetchJson, normalize, asList, unwrap, buildQuery, getToken,
    ApiError, API_VERSION_HEADER, API_VERSION,
} from './client.js';

export {
    translations, tr, getLocale, setLanguage, load as loadLanguage, subscribe as subscribeLanguage,
    getSupportedLocales, isSupported as isSupportedLocale, getItemField, getItemName, checkLocale,
    placeholdersOf, CONTENT_LOCALE, FALLBACK_LOCALE, DEFAULT_LOCALE,
} from './i18n.js';

export { ERROR_KEYS, errorKey, errorMessage } from './errors.js';

export { PHONE_LENGTH_MN, isValidEmail, isValidPhone, identityChannel } from './validation.js';

export {
    datePart, dateTimePart, serverInstant, countdownTo, currencyFormat,
    pictureUrl, memberPhotoUrl, IMAGE_BASE_URL, SERVER_UTC_OFFSET, SERVER_TIME_ZONE,
} from './format.js';

export {
    parseQPay, qrImageSrc, toAmount, invoiceKind, pollUntilPaid,
    POLL_INTERVAL_EVENT_MS, POLL_INTERVAL_MEMBERSHIP_MS,
    requestEventInvoice, eventInvoicePaid, membershipInvoicePaid, requestMembershipInvoice,
    requestBasketInvoice, basketPaid, basketLineErrors, BASKET_LINE_KEYS, MAX_BASKET_LINES,
} from './payments.js';

export {
    academyEventSheet, registerAthletes, rowErrors, divisionsFor, alreadyEntered,
    suggestAgeGroup, rowNeeds, ROW_ERROR_KEYS, MISSING_KEYS, MAX_BULK_ROWS,
} from './bulkEntry.js';

export {
    requestRefund, myRefunds, withdrawRefund, refundAmount, bankDetailsProblems, refundDeadline, refundsOpen,
    refundOpenFor, mergedWindowEnd, mergedWindowEndText, MERGED_WINDOW_HOURS,
    REFUND_SHARE, REFUND_STATUS_KEYS, BANK_NAMES,
} from './refunds.js';

export { TERMS_VERSION, TERMS_ACCEPTANCE, termsText, termsBlocks } from './terms.js';

// What a sport's registration asks beyond the division, and its belt switch.
export {
    registrationAttributes, attributeValues, toggleOption, attributeProblems, attributeProblemText,
    attributesPayload, attributeLabel, optionLabel, attributeValueText, beltStep, ATTRIBUTE_KINDS,
} from './attributes.js';

export {
    eventDraws, eventDraw, drawForGroup, bracketColumns, loserMatches, matchesByRoundName, standings, personName,
    isRoundRobin, playsAsRoundRobin, ELIMINATION_FORMATS, ROUND_ROBIN_FORMATS,
} from './draws.js';

export { myNotifications, markNotificationsSeen } from './notifications.js';

export { SUPPORT_PHONE, SUPPORT_PHONE_TEL, PRIVACY_POLICY_URL } from './contact.js';

export { readEventConfig, registrationWindow, canPay, canEdit, EVENT_TYPE } from './eventConfig.js';

export {
    isUpcoming, splitCompetitions, eventCoverUrl, eventPictureUrls,
    locationPoint, locationAddress, genderKey, PICTURE_TYPE,
} from './events.js';

export {
    getUserInfo, logoutUser, storeUser, storeSession, checkUser, checkIdentity,
    sendEmailCode, verifyEmailCode, resetPasswordByEmail, getUserByPhoneNumber,
    sendVerificationCode, signInUser, updateUserInfo, refreshUserInfo,
    sendPhoneChangeCode, verifyPhoneChangeCode, changeEmail, verifyEmailChangeCode,
    resendEmailVerification, deleteProfile,
} from './auth.js';

// Token sign-in and the signup / reset flows, on api(). Kept out of auth.js
// so the UserHelper facade below — the mobile app's — stays exactly as it was.
export {
    login, logout, fetchMe, startVerification, confirmVerification,
    completeSignup, completeReset, passwordProblem, PURPOSE, acceptTerms, termsAccepted,
} from './account.js';

export { subscribeSession } from './session.js';

// Individual registration: the division cascade, labels, the form's checks.
export {
    eventEntries, entryOptions, entryWeights, eventAcademies, myEventRegistrations, myAthletesNotInEvent,
    registerForEvent, deleteRegistration, registrationProblems, entryFee, entryLabel, ageLabel, weightLabel,
    REG_STATUS_KEYS, eventEntriesWithCounts, competitorGroups,
} from './registration.js';

// Athletes I manage: list, save, delete, and the app's form rules.
export { myAthletes, saveAthlete, deleteAthlete, athleteProblems } from './members.js';

// Athlete access: claiming records, deciding claims, academy owners and coaches.
export {
    claimMember, cancelClaim, myClaims, claimsToDecide, decideClaim,
    myAcademyRoles, academyCoaches, grantCoach, revokeCoach, academyAthletes, CLAIM_STATUS_KEYS,
} from './athletes.js';

// Profile editing on api(): names, phone / address changes, delete.
export {
    reloadProfile, updateProfile, startPhoneChange, confirmPhoneChange,
    startEmailChange, confirmEmailChange, resendEmailCode, deleteAccount,
} from './profile.js';

/*
 * Drop-in facades with the exact shape of the mobile app's helper classes, so
 * uniqsport/app/classes/*.js can become one-line re-exports and not a single
 * screen has to change. New code should import the named functions instead.
 */

export const UserHelper = Object.freeze({
    ...auth,
    isValidEmail,
    isValidPhone,
    identityChannel,
});

/** LanguageHelper minus style(), which is React Native styling and stays in the app. */
export const LanguageHelper = Object.freeze({
    getSupportedLocales: i18n.getSupportedLocales,
    isSupported: i18n.isSupported,
    getLocale: i18n.getLocale,
    load: i18n.load,
    setLanguage: i18n.setLanguage,
    subscribe: i18n.subscribe,
    tr: i18n.tr,
    getItemField: i18n.getItemField,
    getItemName: i18n.getItemName,
    checkLocale: i18n.checkLocale,
});

export const PaymentHelper = Object.freeze({
    parseQPay: payments.parseQPay,
    toAmount: payments.toAmount,
    errorMessage: payments.errorMessage,
});

export const SmartHelper = Object.freeze({ currencyFormat });
