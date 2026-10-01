import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    isUpcoming, splitCompetitions, eventCoverUrl, eventPictureUrls,
    locationPoint, locationAddress, genderKey,
} from '../src/events.js';

const BASE = 'https://smartdata-uniq-app-bucket.s3.ap-northeast-2.amazonaws.com';

test('upcoming is decided in Ulaanbaatar time, not the machine zone', () => {
    // Ends 2026-09-20 00:00 in Ulaanbaatar = 2026-09-19 16:00 UTC.
    const event = { due_date: '2026-09-20 00:00:00' };
    assert.equal(isUpcoming(event, new Date('2026-09-19T15:59:00Z')), true);
    assert.equal(isUpcoming(event, new Date('2026-09-19T16:00:00Z')), false);
});

test('falls back to event_date, and an event with no date is past', () => {
    assert.equal(isUpcoming({ event_date: '2099-01-01 00:00:00' }), true);
    assert.equal(isUpcoming({}), false);
    assert.equal(isUpcoming(null), false);
});

test('splitCompetitions keeps server order within each group and skips junk', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const list = [
        { id: 1, event: { due_date: '2026-09-01 00:00:00' } },
        { id: 2, event: { due_date: '2026-01-01 00:00:00' } },
        { id: 3, event: { due_date: '2026-07-01 00:00:00' } },
        { id: 4 },
        null,
    ];
    const { upcoming, past } = splitCompetitions(list, now);
    assert.deepEqual(upcoming.map((c) => c.id), [1, 3]);
    assert.deepEqual(past.map((c) => c.id), [2]);
    assert.deepEqual(splitCompetitions('SQLSTATE error string'), { upcoming: [], past: [] });
});

test('the cover is the web cover if present, else the mobile cover', () => {
    const mobile = { url: 'm.jpg', picture_type: { code: 'event_cover_mobile', dir_url: '/event/cover_mobile' } };
    const gallery = { url: 'g.jpg', picture_type: { code: 'event_gallery', dir_url: '/event/gallery' } };
    const web = { url: 'w.jpg', picture_type: { code: 'event_cover_web', dir_url: '/event/cover_web' } };

    assert.equal(eventCoverUrl({ pictures: [gallery, mobile] }), `${BASE}/event/cover_mobile/thumbnail/m.jpg`);
    assert.equal(eventCoverUrl({ pictures: [mobile, web] }, 'cropped'), `${BASE}/event/cover_web/cropped/w.jpg`);
    assert.equal(eventCoverUrl({ pictures: [gallery] }), null);
    assert.equal(eventCoverUrl({}), null);

    assert.deepEqual(eventPictureUrls({ pictures: [gallery, mobile, { url: null }] }), [
        `${BASE}/event/gallery/cropped/g.jpg`,
        `${BASE}/event/cover_mobile/cropped/m.jpg`,
    ]);
});

test('locationPoint reads [lng, lat] and never throws', () => {
    // The real shape from compware: a JSON string.
    const loc = { geojsoncenter: '{"type":"Point","coordinates":[106.927973792,47.922254]}' };
    assert.deepEqual(locationPoint(loc), { lat: 47.922254, lng: 106.927973792 });
    assert.equal(locationPoint({ geojsoncenter: null }), null);
    assert.equal(locationPoint({ geojsoncenter: '{broken' }), null);
    assert.equal(locationPoint({ geojsoncenter: { coordinates: [106.9, 47.9] } }).lat, 47.9);
});

test('locationAddress skips missing parts instead of printing "undefined"', () => {
    const loc = {
        aimag_city: { name: 'Улаанбаатар', name_en: 'Ulaanbaatar' },
        soum_district: { name: 'Сүхбаатар' },
        bag_khoroo: null,
        object_name: '30/4',
    };
    assert.equal(locationAddress(loc), 'Улаанбаатар, Сүхбаатар, 30/4');
    assert.equal(locationAddress(loc, (i) => i?.name_en || i?.name), 'Ulaanbaatar, Сүхбаатар, 30/4');
    assert.equal(locationAddress(null), '');
});

test('genderKey accepts the string and number forms', () => {
    assert.equal(genderKey('2'), 'female');
    assert.equal(genderKey(2), 'female');
    assert.equal(genderKey('1'), 'male');
});
