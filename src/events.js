import { IMAGE_BASE_URL, serverInstant } from './format.js';

/**
 * Competition and event helpers shared by both clients: which competitions
 * are upcoming, which picture is the cover, where an event takes place.
 *
 * The mobile app computes these inline in EventCompetitionListScreen and
 * EventDetailScreen. The versions here fix what those get wrong:
 *  - upcoming/past is decided in Ulaanbaatar time, not the device's;
 *  - a location with no point does not crash the screen;
 *  - an address with a missing part does not print "undefined".
 */

export const PICTURE_TYPE = Object.freeze({
    COVER_WEB: 'event_cover_web',
    COVER_MOBILE: 'event_cover_mobile',
    GALLERY: 'event_gallery',
});

/**
 * Whether an event is still to come: its due_date (the last day) is after
 * `now`. Falls back to event_date when due_date is missing. An event with
 * neither counts as past, which is what the mobile app has always done.
 */
export function isUpcoming(event, now = new Date()) {
    const end = serverInstant(event?.due_date) || serverInstant(event?.event_date);
    return !!end && end.getTime() > now.getTime();
}

/**
 * Splits /comp/event/list into upcoming and past competitions. Each item is
 * a uq_event_config row with its event nested under `event`. Server order is
 * kept within each group (compware sorts by reg_end_date, newest first).
 *
 * @param {Array<{event?: object}>} competitions
 * @returns {{upcoming: Array, past: Array}}
 */
export function splitCompetitions(competitions, now = new Date()) {
    const upcoming = [];
    const past = [];

    for (const competition of Array.isArray(competitions) ? competitions : []) {
        if (!competition || !competition.event) continue;
        (isUpcoming(competition.event, now) ? upcoming : past).push(competition);
    }

    return { upcoming, past };
}

function pictureUrlOf(picture, size) {
    if (!picture || !picture.url) return null;
    return IMAGE_BASE_URL + (picture.picture_type?.dir_url || '') + '/' + size + '/' + picture.url;
}

/**
 * URL of an event's cover image: the web cover if one exists, else the
 * mobile cover (the only kind compware holds today), else null.
 *
 * @param {'thumbnail'|'cropped'} [size]
 */
export function eventCoverUrl(event, size = 'thumbnail') {
    const pictures = Array.isArray(event?.pictures) ? event.pictures : [];

    for (const code of [PICTURE_TYPE.COVER_WEB, PICTURE_TYPE.COVER_MOBILE]) {
        const picture = pictures.find((p) => p?.picture_type?.code === code && p.url);
        if (picture) return pictureUrlOf(picture, size);
    }

    return null;
}

/**
 * Every picture of an event, for the detail page's gallery — the mobile
 * carousel shows all of them, cropped.
 *
 * @param {'thumbnail'|'cropped'} [size]
 */
export function eventPictureUrls(event, size = 'cropped') {
    const pictures = Array.isArray(event?.pictures) ? event.pictures : [];
    return pictures.map((p) => pictureUrlOf(p, size)).filter(Boolean);
}

/**
 * A location's map point from its `geojsoncenter` — a GeoJSON Point as JSON
 * TEXT, coordinates in [longitude, latitude] order. Null when absent or
 * malformed, rather than throwing as JSON.parse(null) would.
 *
 * @returns {{lat: number, lng: number} | null}
 */
export function locationPoint(location) {
    let geo = location?.geojsoncenter;

    if (typeof geo === 'string') {
        try { geo = JSON.parse(geo); } catch (error) { return null; }
    }

    const [lng, lat] = Array.isArray(geo?.coordinates) ? geo.coordinates : [];
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * "Улаанбаатар, Сүхбаатар, 8-хороо, 30/4" — city, district, khoroo and
 * building, skipping any part that is missing.
 *
 * @param {(item: object) => string} [nameOf] reads an entity's localized
 *   name; defaults to its `name`.
 */
export function locationAddress(location, nameOf = (item) => item?.name) {
    if (!location) return '';

    return [
        nameOf(location.aimag_city),
        nameOf(location.soum_district),
        nameOf(location.bag_khoroo),
        location.object_name,
    ].filter((part) => typeof part === 'string' && part.trim() !== '').join(', ');
}

/**
 * The translation key for a gender_code. compware sends it as a string
 * ("1"/"2") in some places and a number in others; 2 is female.
 */
export function genderKey(code) {
    return Number(code) === 2 ? 'female' : 'male';
}
