# Changelog

All notable changes to `@uniq/shared`. Semver: removing an export or renaming
a string key is a major change.

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
