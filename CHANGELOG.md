# Changelog

All notable changes to `@uniq/shared`. Semver: removing an export or renaming
a string key is a major change.

## 0.13.0 — unreleased (Phase A, local only)

### Added
- `payments.js`: `requestMembershipInvoice(memberId, sportId, {membershipTypeId})`
  — a membership on its own, as the app's MembershipScreen buys it.

## 0.12.0 — unreleased (Phase A, local only)

### Added
- `refunds.js`: `requestRefund`, `myRefunds`, `withdrawRefund`, `refundAmount`
  (99% of what was paid), `bankDetailsProblems` (compware's rules),
  `REFUND_STATUS_KEYS`, `REFUND_SHARE`, `BANK_NAMES` (suggestions only).
- Endpoints `URL_COMP_REFUND_REQUEST`, `URL_COMP_REFUND_MINE`,
  `URL_COMP_REFUND_WITHDRAW`.
- Error codes `not_paid`, `not_refundable`, `refund_closed`,
  `bank_details_invalid`, `refund_exists`, `refund_not_found`,
  `refund_decided`; 21 strings. Mongolian is a first draft.

## 0.11.0 — unreleased (Phase A, local only)

### Added
- Bulk payment in `payments.js`: `requestBasketInvoice(eventId, regIds)` (one
  QPay invoice for several registrations; no price sent), `basketPaid`,
  `basketLineErrors`, `BASKET_LINE_KEYS`, `MAX_BASKET_LINES`.
- Endpoints `URL_PAYMENT_BASKET_CREATE`, `URL_PAYMENT_BASKET_CHECK`.
- Error codes `no_lines`, `too_many_lines`, `payment_closed`, `lines_invalid`,
  `invoice_failed`, `basket_not_found`, `in_basket`; 17 strings. Mongolian is a
  first draft.

## 0.10.0 — unreleased (Phase A, local only)

### Added
- `bulkEntry.js` — coach bulk entry: `academyEventSheet`, `registerAthletes`
  (all rows or none), `rowErrors` (a refused batch's reason per row), and the
  pure helpers `divisionsFor`, `alreadyEntered`, `suggestAgeGroup` (birth
  years or ages, either order; null unless exactly one fits) and `rowNeeds`
  (the server's row rules). `ROW_ERROR_KEYS`, `MISSING_KEYS`, `MAX_BULK_ROWS`.
- Endpoints `URL_COMP_ACADEMY_EVENT_SHEET`, `URL_COMP_ACADEMY_EVENT_REGISTER`.
- Error codes `event_not_found`, `team_event`, `event_needs_attributes`,
  `registration_closed`, `no_rows`, `too_many_rows`, `rows_invalid`,
  `already_entered`; 30 strings. Mongolian is a first draft.

## 0.9.0 — unreleased (Phase A, local only)

### Added
- `payments.js`, on `api()`: `requestEventInvoice` (with `kind` and the
  parsed `qpay`; sends no price — compware charges the division's fee),
  `eventInvoicePaid`, `membershipInvoicePaid`.
- Error code `entry_fee_missing`.
- 8 strings for the portal's payment page. Mongolian is a first draft.

## 0.8.0 — unreleased (Phase A, local only)

### Added
- `src/registration.js` — individual registration, the mobile
  EventRegistrationScreen written down: the division cascade (`eventEntries`,
  `entryOptions`, `entryWeights`, `eventAcademies`), `myEventRegistrations`,
  `myAthletesNotInEvent`, `registerForEvent` (the app's request body, field for
  field), `deleteRegistration`, `registrationProblems` (the screen's checks in
  its order), labels (`entryLabel`, `ageLabel`, `weightLabel`, `entryFee`),
  `REG_STATUS_KEYS`, and the competitor list (`eventEntriesWithCounts`,
  `competitorGroups`).
- 14 strings for the portal's registration and competitor pages. Mongolian is a
  first draft.

### Notes
- Age groups are printed as typed: organisers often enter BIRTH YEARS
  (2008-1980), and the app shows them that way.
- `competitorGroups` always sends `belt_id` / `age_id` (empty when unchosen):
  compware read `belt_id` unguarded.

## 0.7.0 — unreleased (Phase A, local only)

### Added
- `src/members.js`, on `api()`: `myAthletes`, `saveAthlete`, `deleteAthlete`
  and `athleteProblems` (the app's athlete-form checks, as keys). The same
  compware calls the app's registration screens make, so a record saved on
  the web is one the app shows.
- Error code `member_has_registrations`.
- 36 strings for the portal's athletes, requests and club pages. Mongolian is
  a first draft.

## 0.6.0 — unreleased (Phase A, local only)

### Added
- `src/athletes.js`, on `api()`, POST and token-only (compware
  docs/design/athlete-access.md): `claimMember`, `cancelClaim`, `myClaims`,
  `claimsToDecide`, `decideClaim`, `myAcademyRoles`, `academyCoaches`,
  `grantCoach`, `revokeCoach`, `academyAthletes`, `CLAIM_STATUS_KEYS`. With no
  token stored each answers `auth_required` without a request.
- Ten endpoints `URL_COMP_ACADEMY_*` / `URL_COMP_MEMBER_CLAIM*`.
- Error codes `member_owned_by_other`, `member_not_found`, `already_yours`,
  `claim_pending`, `claim_not_found`, `not_academy_owner`, `not_academy_staff`,
  `coach_account_not_found`, `coach_member_not_found`, `already_coach`,
  `role_not_found`.
- 18 strings: one per code above, plus `claimRecord`, `claimSent`,
  `claimSignInAgain` and the four `claimStatus*`. Mongolian is a first draft.

### Changed
- `regNumberOwnedByUser` no longer shows a phone number — compware stopped
  sending it (anyone could harvest numbers by national ID). It now offers a
  request instead. Shipped apps still pass `{phone}`; the unused parameter is
  ignored. **Visible to every app user once the OTA ships.**

## 0.5.0 — unreleased (Phase A, local only)

### Added
- `src/profile.js`, on `api()`, all POST: `reloadProfile`, `updateProfile`,
  `startPhoneChange`, `confirmPhoneChange`, `startEmailChange`,
  `confirmEmailChange`, `resendEmailCode`, `deleteAccount`. A successful
  answer carrying the user row rewrites the stored profile.
- Session event `deleted`, emitted by `deleteAccount()`.
- 4 strings: `change`, `accountNoEmail`, `signInDetails`, `accountDeleted`.
  Mongolian is a first draft.

## 0.4.0 — unreleased (Phase A, local only)

### Added
- `src/account.js`, on `api()`: `login`, `logout`, `fetchMe` (token sign-in
  against compware's new `POST /core/user/login`, `/logout`, `/me`) and the
  signup / reset flows `startVerification`, `confirmVerification`,
  `completeSignup`, `completeReset`, plus `passwordProblem` and `PURPOSE`.
- `src/session.js`: `subscribeSession()` — `signed_in`, `signed_out`,
  `expired`.
- Endpoints `URL_USER_LOGIN`, `URL_USER_LOGOUT`, `URL_USER_ME`.
- Error codes `invalid_request`, `invalid_credentials`, `email_not_verified`,
  `phone_not_verified`, `auth_required`, `auth_invalid`, and the client-side
  `already_registered`, `not_registered`, `sms_failed` — all mapped to strings
  that already existed except `auth_invalid` and `invalid_request`.
- 10 strings: `sessionExpired`, `loginMissingFields`, `phoneCodeSent`,
  `noAccountYet`, `haveAccount`, `accountCreated`, `newPassword`,
  `changeIdentity`, `codeResent`, `sendNewCode`. Mongolian is a first draft.

### Changed
- `api()`: a call that sent a token and got `auth_invalid` back now clears the
  stored session, emits `expired`, and is retried once without the token. No
  effect on the mobile app, which stores no token.

### Unused, kept
- `webSignInSoon` — the portal no longer shows it. Removing a key is a major
  change; drop it at 1.0.

## 0.3.0 — unreleased (Phase A, local only)

### Added
- `src/events.js`: `isUpcoming`, `splitCompetitions`, `eventCoverUrl`,
  `eventPictureUrls`, `locationPoint`, `locationAddress`, `genderKey`,
  `PICTURE_TYPE`. The competition list and event detail logic both clients
  need. Unlike the mobile app's inline versions, upcoming/past is decided in
  Ulaanbaatar time, a location without a point does not crash, and a missing
  address part is skipped instead of printing "undefined".
- 8 strings for the portal's browse pages: `sports`, `noUpcomingCompetitions`,
  `noPastCompetitions`, `registrationOpen`, `registrationClosed`,
  `webRegistrationSoon`, `webCompetitorsSoon`, `eventLocation`.

## 0.2.0 — unreleased (Phase A, local only)

### Added
- 14 strings for the web portal's shell, in both languages: `pageNotFound`,
  `pageNotFoundBody`, `goHome`, `somethingWentWrong`, `reloadPage`, `loading`,
  `loginRequired`, `webSignInSoon`, `apiConnected`, `apiUnreachable`,
  `languageMn`, `languageEn`, `portalWelcome`, `portalIntro`.
  The Mongolian wording is a first draft — review it.

## 0.1.0 — unreleased (Phase A, local only)

First extraction from `uniqsport`. No app consumes it yet.

### Moved from uniqsport, unchanged in behaviour
- `src/lang/en.js`, `src/lang/mn.js` — split from
  `app/lang/SupportedLanguages.js`; proven deep-equal to the original.
- `src/endpoints.js` — every path from `app/config/WebServices.js`, under the
  same `URL_*` names; proven equal to the original.
- `src/auth.js` — `app/classes/UserHelper.js`, with AsyncStorage replaced by
  the injected storage.
- `src/i18n.js` — `app/classes/LanguageHelper.js`, minus the RN `style()`.
- `src/payments.js` — `app/classes/PaymentHelper.js`.
- `src/validation.js`, `src/format.js` — `Configuration.js`, `Main.js`,
  `SmartHelper.js`.

### Deliberate behaviour changes
- `tr()` fills a null/undefined placeholder value with an empty string. The
  original passed it to `Array.join`, which treats `undefined` as "use the
  default separator", so a missing `{year}` rendered as `,`.
- Every query value is URL-encoded, and undefined/null values are omitted
  rather than sent as the text "undefined".

### New
- `src/client.js` — `api()`, the normalised client (timeouts, token header,
  `X-Uniq-Api: 2`, one envelope shape for every answer and every failure).
- `src/errors.js` — one failure-code map, consolidated from four copies.
- `src/eventConfig.js` — reader exposing only compware's computed
  registration-window booleans.
- `serverInstant()`, `countdownTo()` — Ulaanbaatar-pinned date arithmetic.
- `invoiceKind()`, `pollUntilPaid()`, `qrImageSrc()`.
- `storeSession()` — stores a bearer token once compware issues one.
