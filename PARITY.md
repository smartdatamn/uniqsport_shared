# Feature parity

One row per user-facing feature: which shared version carries its logic, and
which version of each client has shipped it. Update the row as part of the
definition of done. A feature that cannot ship on both clients at once ships
behind a flag defaulting off, and the **Notes** column says why.

| Feature | Shared | Mobile (`uniqsport`) | Portal (`uniqsport_portal`) | Notes |
|---|---|---|---|---|
| Browse sports & competitions | 0.1.0 | shipped | — | |
| Event detail (map, countdown) | 0.1.0 | shipped | — | `/comp/event/find/id` works only against production (`view_organization_search` missing elsewhere) |
| Sign in / sign up (phone, email) | 0.1.0 | shipped | — | Portal waits for `POST /core/user/login` (plan 0.6) |
| Profile & identity changes | 0.1.0 | shipped | — | |
| Athlete records | 0.1.0 | shipped | — | |
| Individual registration | 0.1.0 | shipped | — | |
| QPay payment (event) | 0.1.0 | shipped | — | |
| Membership purchase & renewal | 0.1.0 | shipped | — | |
| Competitor list & bracket | 0.1.0 | shipped | — | |
| Notifications (list, count) | 0.1.0 | shipped | — | Web Push not planned for v1 |
| Teams | 0.1.0 | shipped | **deferred** | Team model being redesigned for squad and small-group sports; team payment on hold |
| HiPay saved cards | 0.1.0 | shipped | **blocked** | Return page is React-Native-only; needs a compware change and possibly HiPay-side config |
| Coach role & multi-athlete registration | — | — | — | Planned web-first; designed with the permission model (plan 0.4) |
| Bulk payment | — | — | — | Planned; basket with typed lines |
| Refund requests | — | — | — | Planned mobile-first; admin half exists in compadmin |
