/**
 * Formatting rules both clients must agree on.
 *
 * Dates: compware sends naive datetime strings ("2026-01-10 00:00:00") that
 * mean Ulaanbaatar wall-clock time. Two rules follow:
 *
 *  - To DISPLAY one, slice it. datePart()/dateTimePart() do exactly what the
 *    mobile app has always done with substring(0, 10/16), and need no
 *    timezone at all.
 *  - To do arithmetic with one (a countdown, "is it past?"), convert it with
 *    serverInstant(), which pins it to UTC+8. Never `new Date(serverString)`:
 *    a browser reads that as ITS local time, so a user abroad sees the wrong
 *    competition day — a bug nobody in Ulaanbaatar would ever notice.
 *
 * Better still, do not compute registration windows at all: compware already
 * does, and eventConfig.js exposes its answer.
 */

/** Mongolia has been UTC+8 all year since abolishing DST in 2017. */
export const SERVER_UTC_OFFSET = '+08:00';
export const SERVER_TIME_ZONE = 'Asia/Ulaanbaatar';

/** "2026-01-10 14:30:00" -> "2026-01-10". Empty for anything else. */
export function datePart(value) {
    return typeof value === 'string' ? value.substring(0, 10) : '';
}

/** "2026-01-10 14:30:00" -> "2026-01-10 14:30". */
export function dateTimePart(value) {
    return typeof value === 'string' ? value.substring(0, 16) : '';
}

/**
 * A compware datetime string as an absolute instant, read as Ulaanbaatar time.
 * Strings that already carry an offset or Z are respected. Returns null for
 * anything unparseable.
 */
export function serverInstant(value) {
    if (typeof value !== 'string' || value === '') return null;

    let iso = value.trim().replace(' ', 'T');

    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        iso += 'T00:00:00';
    }

    if (!/([zZ]|[+-]\d{2}:?\d{2})$/.test(iso)) {
        iso += SERVER_UTC_OFFSET;
    }

    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Whole days/hours/minutes/seconds from `now` until a compware datetime.
 * Negative totals clamp to zero. For the event countdown.
 */
export function countdownTo(value, now = new Date()) {
    const target = serverInstant(value);
    if (!target) return null;

    const totalSeconds = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));

    return {
        totalSeconds,
        days: Math.floor(totalSeconds / 86400),
        hours: Math.floor((totalSeconds % 86400) / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60,
    };
}

/**
 * Whole-number amount with thousands separators and a suffix, e.g.
 * currencyFormat("20000.00", "₮") -> "20,000₮". Moved from SmartHelper.
 * Postgres numerics arrive as strings; this accepts either.
 */
export function currencyFormat(value, postFix = '') {
    return parseFloat(value).toFixed(0).replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,') + postFix;
}

/** The S3 bucket every UniQ image lives in (event covers, athlete photos). */
export const IMAGE_BASE_URL = 'https://smartdata-uniq-app-bucket.s3.ap-northeast-2.amazonaws.com';

/**
 * URL of an event/organisation picture: the bucket, the picture type's
 * dir_url, the size variant, then the file name.
 *
 * @param {{url?: string, picture_type?: {dir_url?: string}}} picture
 * @param {'thumbnail'|'cropped'} [size]
 */
export function pictureUrl(picture, size = 'thumbnail') {
    if (!picture || !picture.url) return null;
    const dir = picture.picture_type?.dir_url || '';
    return IMAGE_BASE_URL + dir + '/' + size + '/' + picture.url;
}

/**
 * URL of an athlete photo. compware stores the S3 KEY on the member
 * (profile_url / id_url, e.g. "/member/9001/memberpr_….png"), not a URL.
 */
export function memberPhotoUrl(key) {
    if (!key || typeof key !== 'string') return null;
    if (/^https?:\/\//.test(key)) return key;
    return IMAGE_BASE_URL + (key.startsWith('/') ? key : '/' + key);
}
