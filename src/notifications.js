import { api, getToken } from './client.js';

/**
 * The signed-in user's notifications, as the portal shows them (compware
 * POST /core/user/notifications/{mine,seen}, token-only). Broadcasts plus
 * those addressed to the user, each once, newest 100 first.
 *
 * Notifications have no per-item read state; "new" means sent after the
 * user last looked (markNotificationsSeen). Reading the list does not mark
 * anything seen - the page decides when the user has looked.
 *
 * The app's own list and count (GET /core/user/notification[/count]) are
 * unchanged and count everything.
 */

const refuse = (code) => ({ ok: false, data: null, code, message: null, raw: null, httpStatus: null });

/** Envelope with data {items: [{id, title, body, json, created_at, is_new}], unseen, seen_at}. */
export async function myNotifications() {
    if (!(await getToken())) return refuse('auth_required');
    return api('URL_USER_NOTIFICATIONS_MINE', { method: 'POST' });
}

export async function markNotificationsSeen() {
    if (!(await getToken())) return refuse('auth_required');
    return api('URL_USER_NOTIFICATIONS_SEEN', { method: 'POST' });
}
