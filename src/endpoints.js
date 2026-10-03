/**
 * Every compware path either client calls, in one place.
 *
 * The keys are the exact constant names uniqsport has always used in
 * app/config/WebServices.js, so the mobile app can re-export them unchanged.
 * A new endpoint is added HERE and nowhere else — neither app may hardcode a
 * compware path in its own tree.
 *
 * Paths only, no host: the host is the app's business (staging, a LAN
 * address, production) and comes in through configure({ baseUrl }).
 */
export const ENDPOINT_PATHS = Object.freeze({
    // App version — declared, not yet called by any client.
    URL_APP_VERSION_ANDROID: '/android/version',
    URL_APP_VERSION_IOS: '/apple/version',

    // Competition
    URL_COMP_EVENT_LIST: '/comp/event/list',
    URL_EVENT_DETAIL: '/comp/event/find/id',
    URL_COMP_EVENT_CONFIG_CHECK: '/comp/event/config',
    URL_COMP_EVENT_CONFIG_ATTRIBUTES: '/comp/event/config/attributes',
    URL_COMP_EVENT_SPORT_ATTRIBUTES: '/comp/event/sport/attributes',
    URL_COMP_EVENT_SPORT_LIST: '/comp/event/sport/list',
    URL_COMP_EVENT_MEMBER_CHECK: '/comp/event/member/check',
    URL_COMP_EVENT_ENTRIES: '/comp/event/entries',
    URL_COMP_EVENT_ENTRY_CONFIG: '/comp/event/entry/config',
    URL_COMP_EVENT_ENTRY_WEIGHT: '/comp/event/entry/weight',
    URL_COMP_EVENT_ACADEMIES: '/comp/event/academies',
    URL_COMP_EVENT_REGISTER: '/comp/event/register',
    URL_COMP_EVENT_REGISTER_DELETE: '/comp/event/register/delete',
    URL_COMP_EVENT_REGISTERED_MEMBERS: '/comp/event/registered/members',
    URL_COMP_EVENT_MEMBERS: '/comp/event/members',
    URL_COMP_EVENT_MEMBERS_NOTIN: '/comp/event/members/notin/event',
    URL_COMP_EVENT_BRACKET_MEMBERS: '/comp/event/bracket/members',
    URL_COMP_EVENT_MEMBER_REGISTRATION: '/comp/event/members/registration',
    URL_COMP_EVENT_MEMBER_DELETE: '/comp/event/members/delete',

    // Athlete access (compware docs/design/athlete-access.md). POST and
    // token-only: these answer 401 auth_required without a bearer token.
    URL_COMP_ACADEMY_ROLES_MINE: '/comp/academy/roles/mine',
    URL_COMP_ACADEMY_COACHES: '/comp/academy/coaches',
    URL_COMP_ACADEMY_COACH_GRANT: '/comp/academy/coach/grant',
    URL_COMP_ACADEMY_COACH_REVOKE: '/comp/academy/coach/revoke',
    URL_COMP_ACADEMY_ATHLETES: '/comp/academy/athletes',
    URL_COMP_ACADEMY_EVENT_SHEET: '/comp/academy/event/sheet',
    URL_COMP_ACADEMY_EVENT_REGISTER: '/comp/academy/event/register',
    URL_COMP_MEMBER_CLAIM: '/comp/member/claim',
    URL_COMP_MEMBER_CLAIM_CANCEL: '/comp/member/claim/cancel',
    URL_COMP_MEMBER_CLAIMS_MINE: '/comp/member/claims/mine',
    URL_COMP_MEMBER_CLAIMS_PENDING: '/comp/member/claims/pending',
    URL_COMP_MEMBER_CLAIM_DECIDE: '/comp/member/claim/decide',

    // Payment — QPay. create/invoice may answer with a MEMBERSHIP invoice
    // instead of the event one; see payments.js invoiceKind().
    URL_COMP_EVENT_PAYMENT_CREATE_QPAY_INVOICE: '/core/payment/qpay/create/invoice',
    URL_COMP_EVENT_PAYMENT_CHECK_QPAY_INVOICE: '/core/payment/qpay/check/invoice',
    URL_COMP_EVENT_PAYMENT_CREATE_QPAY_MEMBERSHIP_INVOICE: '/core/payment/qpay/create/membership/invoice',
    URL_COMP_EVENT_PAYMENT_CHECK_QPAY_MEMBERSHIP_INVOICE: '/core/payment/qpay/check/membership/invoice',
    URL_PAYMENT_BASKET_CREATE: '/core/payment/basket/create',
    URL_PAYMENT_BASKET_CHECK: '/core/payment/basket/check',
    URL_COMP_REFUND_REQUEST: '/comp/refund/request',
    URL_COMP_EVENT_DRAWS: '/comp/event/draws',
    URL_COMP_EVENT_DRAW: '/comp/event/draw',
    URL_COMP_REFUND_MINE: '/comp/refund/mine',
    URL_COMP_REFUND_WITHDRAW: '/comp/refund/withdraw',

    // Teams. Deferred on the portal pending the team-sports redesign; kept
    // here because the mobile app still calls them.
    URL_COMP_EVENT_TEAM_NOTIN: '/comp/event/team/notin/register',
    URL_COMP_EVENT_TEAM_DELETE: '/comp/event/team/delete',
    URL_COMP_EVENT_TEAM_CREATE: '/comp/event/team/create',
    URL_COMP_EVENT_TEAM_UPDATE: '/comp/event/team/update',
    URL_COMP_EVENT_TEAM_IN: '/comp/event/team/in/register',
    URL_COMP_EVENT_TEAM_CREATE_REG: '/comp/event/team/create/registration',
    URL_COMP_EVENT_TEAM_DELETE_REG: '/comp/event/team/delete/registration',
    URL_COMP_EVENT_TEAM_MEMBER_REG: '/comp/event/team/member/registration',
    URL_COMP_EVENT_TEAM_MEMBER_CHECK: '/comp/event/team/member/check',
    URL_COMP_EVENT_TEAM_MEMBER_CREATE: '/comp/event/team/member/create',
    URL_COMP_EVENT_TEAM_MEMBER_DELETE: '/comp/event/team/member/delete',

    // User. update takes names and picture only; phone and email each have
    // their own verify-first flow below.
    URL_USER_REGISTER_TOKEN: '/core/user/register/token',
    URL_USER_REGISTER: '/core/user/register',
    URL_USER_CHECK: '/core/user/check',
    // Token sign-in: POST only, the password in the body. login returns
    // {token, token_type, expires_at} beside data; logout and me need the
    // token. The portal uses these and never URL_USER_CHECK.
    URL_USER_LOGIN: '/core/user/login',
    URL_USER_LOGOUT: '/core/user/logout',
    URL_USER_ME: '/core/user/me',
    URL_USER_GET_APPLE: '/core/user/get/apple',
    URL_USER_GET_PHONENUMBER: '/core/user/get/phonenumber',
    URL_USER_GET_ID: '/core/user/get/id',
    URL_USER_UPDATE: '/core/user/update',
    URL_USER_PHONE_CHANGE_SEND: '/core/user/phone/change/send',
    URL_USER_PHONE_CHANGE_VERIFY: '/core/user/phone/change/verify',
    URL_USER_EMAIL_CHANGE: '/core/user/email/change',
    URL_USER_EMAIL_CHANGE_VERIFY: '/core/user/email/change/verify',
    URL_USER_EMAIL_VERIFY_RESEND: '/core/user/email/verify/resend',
    // identity/check answers with flags; get/phonenumber hands back the whole
    // user row to anyone who asks, so signup must use identity/check.
    URL_USER_IDENTITY_CHECK: '/core/user/identity/check',
    URL_USER_EMAIL_CODE_SEND: '/core/user/email/code/send',
    URL_USER_EMAIL_CODE_VERIFY: '/core/user/email/code/verify',
    URL_USER_PASSWORD_RESET: '/core/user/password/reset',
    URL_USER_NOTIFICATION: '/core/user/notification',
    URL_USER_NOTIFICATION_COUNT: '/core/user/notification/count',
    URL_USER_NOTIFICATIONS_MINE: '/core/user/notifications/mine',
    URL_USER_NOTIFICATIONS_SEEN: '/core/user/notifications/seen',
    URL_USER_MESSAGE_SENT: '/core/user/message/send',
    URL_USER_VERIFY_CODE: '/core/user/verified/code',
    URL_USER_DELETE: '/core/user/delete',

    // Payment — HiPay saved cards. React-Native-only today: card/add returns
    // a 302 and its return page posts to window.ReactNativeWebView.
    URL_USER_PAYMENT_HIPAY_CARD_ADD: '/core/payment/hipay/card/add',
    URL_USER_PAYMENT_HIPAY_CARD_GET: '/core/payment/hipay/card/get',
    URL_USER_PAYMENT_HIPAY_CARD_REMOVE: '/core/payment/hipay/card/remove',
    URL_USER_PAYMENT_HIPAY_CARD_PAYMENT: '/core/payment/hipay/card/payment',
});

/**
 * The same map with the host prepended — the shape the mobile app's
 * WebServices.js has always exported.
 *
 * @param {string} baseUrl compware root, e.g. 'http://compware.uniq.mn'
 * @returns {Record<keyof typeof ENDPOINT_PATHS, string>}
 */
export function buildEndpoints(baseUrl) {
    const base = String(baseUrl || '').replace(/\/+$/, '');
    const out = {};

    for (const [name, path] of Object.entries(ENDPOINT_PATHS)) {
        out[name] = base + path;
    }

    return Object.freeze(out);
}
