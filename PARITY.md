# Feature parity

One row per user-facing feature: which shared version carries its logic, and
which version of each client has shipped it. Update the row as part of the
definition of done. A feature that cannot ship on both clients at once ships
behind a flag defaulting off, and the **Notes** column says why.

| Feature | Shared | Mobile (`uniqsport`) | Portal (`uniqsport_portal`) | Notes |
|---|---|---|---|---|
| Browse sports & competitions | 0.3.0 | shipped | chunk 3 | Portal splits upcoming/past in Ulaanbaatar time via `splitCompetitions`; mobile still uses device time |
| Event detail (map, countdown) | 0.3.0 | shipped | chunk 3 (map: Leaflet/OSM) | `/comp/event/find/id` works only against production (`view_organization_search` missing elsewhere) |
| Sign in / sign up / password reset (phone, email) | 0.4.0 | shipped (legacy `GET /check`, no token) | chunk 4 (token) | Same flow and refusals via `account.js`; mobile moves to it when it adopts tokens |
| Profile & identity changes | 0.5.0 | shipped (legacy GET, no token) | chunk 5 (POST, token) | Same verify-first rules; no avatar on either (no upload path exists) |
| Athlete records | 0.7.0 | inside registration only | chunk 6 (list, add, edit, delete) | Web-first: the app has no athlete list outside registering |
| Deciding claims, managing club coaches | 0.6.0 | — | chunk 6 | Web-first; mobile has only "request this record" |
| Individual registration | 0.8.0 | shipped | chunk 7 (register, change, delete) | Same request body as the app; paying is chunk 8 |
| QPay payment (event) | 0.9.0 | shipped | chunk 8 (QR, payment link, poll; membership first when required) | The app still sends a price; compware ignores it |
| Membership purchase & renewal | 0.1.0 | shipped | — | |
| Competitor list & bracket | 0.8.0 | shipped | chunk 7 (list, read-only) | Brackets: chunk 11 |
| Notifications (list, count) | 0.1.0 | shipped | — | Web Push not planned for v1 |
| Teams | 0.1.0 | shipped | **deferred** | Team model being redesigned for squad and small-group sports; team payment on hold |
| HiPay saved cards | 0.1.0 | shipped | **blocked** | Return page is React-Native-only; needs a compware change and possibly HiPay-side config |
| Claim a record someone else created | 0.6.0 | built (button on both national-ID screens; needs a token — next sign-in) | — | compware enforces who may act for an athlete (docs/design/athlete-access.md) |
| Coach role & multi-athlete registration | 0.6.0 (API calls) | — | — | Backend and compadmin done; portal coach screens next, web-first |
| Bulk payment | — | — | — | Planned; basket with typed lines |
| Refund requests | — | — | — | Planned mobile-first; admin half exists in compadmin |
