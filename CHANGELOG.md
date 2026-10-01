# Changelog

All notable changes to `@uniq/shared`. Semver: removing an export or renaming
a string key is a major change.

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
