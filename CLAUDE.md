# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

`@uniq/shared` — the logic and strings shared by the two UniQ Sport clients:

| Client | Repo | Stack |
|---|---|---|
| Mobile app | `uniqsport` | Expo SDK 57 / React Native, plain JS |
| Web portal | `uniqsport_portal` | Vite + React |

Both talk to the same backend, `compware` (Laravel JSON API). This package is
how a feature lands in both clients at once: **anything touching an endpoint, a
user-facing string, a validation rule or an error code goes here first**, and
neither app may define those in its own tree. That rule is checkable by grep in
review, which is what makes it survivable without CI.

## Commands

```bash
npm test        # node --test — the parity suite plus behaviour tests. No install needed.
```

There is nothing to build and nothing to install: zero dependencies, by design.

## The three rules that keep this package usable from both apps

**1. No platform imports.** Never import React, React Native, Expo,
AsyncStorage, `window`, `document` or `localStorage` here. Every platform
dependency is injected once, at startup:

```js
// uniqsport (mobile)
configure({ baseUrl: HOST_COMPWARE, storage: AsyncStorage });

// uniqsport_portal (web)
configure({ baseUrl: import.meta.env.VITE_API_URL, storage: webStorage() });
```

This is also what lets the whole package run under plain Node, which is where
the tests run.

**2. No runtime dependencies and no build step.** Plain ESM that both Metro and
Vite consume as-is. `main`/`exports` point straight at `src/index.js`. Never add
a `prepare` script — a missing build is the most common way a git dependency
breaks. Never add a `react-native` conditional export — that is exactly where
"works on web, breaks in Metro" lives.

Before committing a change, check Metro still accepts it, from the `uniqsport`
checkout (which has the preset installed):

```bash
cd ../uniqsport && node -e "const b=require('@babel/core'),fs=require('fs'),p=require('path');(function w(d){for(const f of fs.readdirSync(d)){const x=p.join(d,f);if(fs.statSync(x).isDirectory())w(x);else if(x.endsWith('.js'))b.transformSync(fs.readFileSync(x,'utf8'),{filename:x,presets:['babel-preset-expo'],babelrc:false,configFile:false,caller:{name:'metro',bundler:'metro',platform:'android'}})}})('../uniqsport_shared/src');console.log('ok')"
```

**3. Run `npm test` after every edit.** The parity suite enforces what both
clients' CLAUDE.md files record as recurring bugs.

## What the tests enforce

`test/parity.test.js` — permanent, the reason this package exists:
- `mn` and `en` have exactly the same keys
- no translation is empty
- every `{placeholder}` appears in both languages
- every error code in `ERROR_KEYS` maps to a key present in both languages
- every endpoint path is well-formed and listed once

`test/compat.test.js` — proves the package is a faithful replacement for the
mobile code it came from (same URLs, same strings, same helper methods). It
reads the sibling `../uniqsport` checkout and **skips itself** once those files
have become shims, at which point this package is the source of truth.

## Layout

| File | Holds |
|---|---|
| `src/config.js` | `configure()`, storage adapters, `STORAGE_KEYS` |
| `src/endpoints.js` | every compware path, keyed by the mobile app's `URL_*` constant names |
| `src/client.js` | `api()` — the normalised client; `fetchJson()` — the legacy contract |
| `src/auth.js` | account and identity calls (from mobile `UserHelper`) — raw responses, legacy |
| `src/account.js` | token sign-in (`login`/`logout`/`fetchMe`) and the signup / reset flows, on `api()` |
| `src/profile.js` | profile editing on `api()`: names, phone / address changes, delete |
| `src/session.js` | `subscribeSession()` — signed_in / signed_out / expired / deleted events |
| `src/i18n.js`, `src/lang/{mn,en}.js` | `tr()`, `getItemField()`, the string tables |
| `src/errors.js` | the single failure-code → translation-key map |
| `src/payments.js` | QPay parsing, `invoiceKind()`, `pollUntilPaid()` |
| `src/eventConfig.js` | reader for `/comp/event/config` |
| `src/format.js` | dates, currency, image URLs |
| `src/validation.js` | email, phone, identity channel |
| `src/index.js` | public API, plus `UserHelper`/`LanguageHelper`/`PaymentHelper`/`SmartHelper` facades |

## Traps this package exists to absorb — do not reintroduce them in an app

- **On failure, 112 of 114 compware actions put the exception message STRING in
  `data`.** A string has `.length`, so `data.length > 0` passes and `data.map`
  throws. `api()` always returns `{ok, data, code, message, raw, httpStatus}`
  with `data: null` on failure; read lists through `asList(envelope)`.
- **QPay's `data.response_message` is JSON text**, not an object. Use
  `parseQPay()`.
- **`/core/payment/qpay/create/invoice` can answer with a MEMBERSHIP invoice**
  instead of the event one. Branch on `invoiceKind()`.
- **compware datetimes are naive Ulaanbaatar wall-clock strings.** To display,
  slice (`datePart`, `dateTimePart`). For arithmetic, `serverInstant()`. Never
  `new Date(serverString)` — a browser reads that as its own local time.
- **Registration windows are computed by compware**, as `isStarted` /
  `isFinished` / `isPaymentFinished` / `isUpdateFinished`. Read them with
  `readEventConfig()`; never recompute them from the raw dates.
- **Athlete photos are S3 keys, not URLs** (`profile_url`, `id_url`). Use
  `memberPhotoUrl()`.

## Two APIs in `client.js`, on purpose

- `fetchJson(url, init)` returns the parsed JSON or `null`, never throws. It
  exists only so `auth.js` could move here from the mobile app with **no
  behaviour change**. The mobile screens read raw responses.
- `api(endpoint, options)` is the client new code should use: encodes every
  query value, times out (20s default), sends `X-Uniq-Api: 2` and the bearer
  token, normalises every answer, and reports transport failures as envelopes
  with `code` `network_error` / `timeout` / `aborted` / `http_error` /
  `invalid_response`. `{throw: true}` gives an `ApiError` instead — that is the
  form TanStack Query wants.

## Identity: two paths during the transition

compware is dual-mode (its CLAUDE.md, "Token auth"). **With a bearer token the
token decides who the caller is** — compware overwrites `user_id` / `userId`
in the request. **Without one, the `user_id` sent is the only credential**, as
it has always been.

- **Token path — `account.js`, used by the portal.** `login()` posts to
  `POST /core/user/login` (password in the body), stores the profile and the
  token through `storeSession()`, and emits `signed_in`. `api()` then sends
  `Authorization: Bearer` on every call. `logout()` revokes it server-side and
  forgets it locally even offline. `fetchMe()` re-reads the user.
- **Legacy path — `auth.js`, used by the mobile app.** `checkUser()` sends the
  password in a query string and gets no token. Unchanged so no screen had to
  move; the app switches to `account.js` when it adopts tokens (an OTA-able,
  JS-only change). **The portal must never call `checkUser()`.**

**A dead token is handled inside `api()`.** compware answers *every* request
carrying a bad token with 401 `auth_invalid` — public ones too — rather than
falling back to anonymous. So `api()` clears the stored token and profile,
emits `expired`, and retries the call once without the token. Without that, an
expired token would take the browse pages down with it.

The signup and reset flows are `startVerification` → `confirmVerification`
(→ a `proof`) → `completeSignup` / `completeReset`, each finishing with a
`login()`. They are the mobile PhoneNumberEnter → PhoneNumberValidate →
ProfileEdit sequence, including its client-side refusals
(`already_registered`, `not_registered`), so both apps refuse the same things.
The phone reset deliberately never reads the account: `/get/phonenumber` hands
the whole user row to anyone who asks.

## How the apps consume it

**Phase A — local only (now).** There is no remote yet. Both apps use `npm link`:

```bash
cd uniqsport_shared && npm link
cd ../uniqsport        && npm link @uniq/shared
cd ../uniqsport_portal && npm link @uniq/shared
```

- `npm install` in an app removes the link — re-run `npm link @uniq/shared`.
- **Never** commit `"@uniq/shared": "file:../uniqsport_shared"` to an app's
  `package.json`. It breaks every other developer's install and EAS Build.
- `expo start` and `eas update` work (they bundle on this machine).
  **`eas build` (cloud) cannot see a local link** — no store build can include
  this package until Phase B.

**Phase B — remote.** Push to `smartdatamn/uniqsport_shared`, tag, and switch
both apps to `"@uniq/shared": "github:smartdatamn/uniqsport_shared#v<x.y.z>"`.
Public is preferable (it holds paths and UI strings, no secrets) so EAS Build
can clone it with no `.npmrc` secret.

## Releasing a change (Phase B onward)

1. Edit, `npm test`, Metro check (above).
2. Bump `version` in `package.json` (semver; a removed export or renamed key is
   major), add a `CHANGELOG.md` entry.
3. Commit, tag `v<version>`, push the tag.
4. Bump the tag in **both** apps' `package.json`, `npm install`, commit the
   lockfiles.
5. Update the feature's row in `PARITY.md`.

## Strings

- Keys are camelCase and must exist in **both** `src/lang/mn.js` and
  `src/lang/en.js`. Mongolian is the fallback and the content locale.
- Placeholders are `{name}`, filled by `tr(key, {name: value})`. A null or
  undefined value fills in as empty.
- Backend content uses `name` for Mongolian and `name_en` for English; read it
  with `getItemField(item)`, never `item.name` directly.
- `regNumberOwnedByUser` interpolates the owning account's phone number. That
  lets anyone who guesses a national ID harvest a phone number — see the plan's
  "already a user" section. Do not add new strings that leak another person's
  contact details.
