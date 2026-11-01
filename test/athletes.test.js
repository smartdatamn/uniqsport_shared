import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as athletes from '../src/athletes.js';
import { STORAGE_KEYS } from '../src/config.js';
import { errorMessage } from '../src/errors.js';
import { tr } from '../src/i18n.js';
import { setup } from './helpers.js';

const TOKEN = '12|' + 'x'.repeat(48);
const SIGNED_IN = { [STORAGE_KEYS.token]: TOKEN, [STORAGE_KEYS.user]: JSON.stringify({ userid: 8520 }) };
const body = (call) => JSON.parse(call.init.body);

test('without a token: auth_required, and no request', async () => {
    const { calls } = setup({}, { initialStorage: { [STORAGE_KEYS.user]: JSON.stringify({ userid: 8520 }) } });

    for (const res of [await athletes.claimMember('УБ12345678'), await athletes.myAcademyRoles(), await athletes.decideClaim(1, true)]) {
        assert.equal(res.code, 'auth_required');
    }
    assert.equal(calls.length, 0);
});

test('a claim is a POST with the token and the trimmed ID — and no user id', async () => {
    const { calls } = setup({ '/comp/member/claim': () => ({ status: true, data: { id: 5, member_id: 9, status: 'pending' } }) },
        { initialStorage: SIGNED_IN });

    const res = await athletes.claimMember('  УБ12345678 ');

    assert.equal(res.ok, true);
    assert.equal(res.data.status, 'pending');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer ' + TOKEN);
    assert.deepEqual(body(calls[0]), { register_number: 'УБ12345678' });
});

test('deciding sends approve / reject', async () => {
    const { calls } = setup({ '/comp/member/claim/decide': () => ({ status: true, data: { id: 5, status: 'rejected' } }) },
        { initialStorage: SIGNED_IN });

    await athletes.decideClaim(5, false);
    assert.deepEqual(body(calls[0]), { claim_id: 5, decision: 'reject' });
});

test('granting a coach sends the account and the ID, trimmed', async () => {
    const { calls } = setup({ '/comp/academy/coach/grant': () => ({ status: true, data: { id: 3 } }) }, { initialStorage: SIGNED_IN });

    await athletes.grantCoach(7, ' coach@example.com ', ' ук99010112 ');
    assert.deepEqual(body(calls[0]), { academy_id: 7, identity: 'coach@example.com', register_number: 'ук99010112' });
});

test('every athlete-access code and claim state has a message', () => {
    for (const code of ['member_owned_by_other', 'member_not_found', 'already_yours', 'claim_pending', 'claim_not_found',
        'not_academy_owner', 'not_academy_staff', 'coach_account_not_found', 'coach_member_not_found', 'already_coach', 'role_not_found']) {
        assert.notEqual(errorMessage(code, { fallback: '__none__' }), '__none__', code);
    }
    for (const key of Object.values(athletes.CLAIM_STATUS_KEYS)) {
        assert.notEqual(tr(key), key, key);
    }
});

test('the ownership message no longer shows a phone number — and ignores one passed by an old screen', () => {
    const text = tr('regNumberOwnedByUser', { phone: '99112233' });
    assert.ok(!text.includes('99112233'));
    assert.ok(!text.includes('{phone}'));
});

test('choosing a club, school or region sends the athlete, the kind and the row; null clears it (0)', async () => {
    const { calls } = setup({ '/comp/member/affiliation': () => ({ status: true, data: { id: 9, kind: 'school', school_id: null, academy: null } }) },
        { initialStorage: SIGNED_IN });

    await athletes.changeAthleteAffiliation(9, 'school', 44);
    await athletes.changeAthleteAffiliation(9, 'region', null);
    await athletes.changeAthleteClub(9, 7);
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(body(calls[0]), { member_id: 9, kind: 'school', academy_id: 44 });
    assert.deepEqual(body(calls[1]), { member_id: 9, kind: 'region', academy_id: 0 });
    assert.deepEqual(body(calls[2]), { member_id: 9, kind: 'club', academy_id: 7 });
    assert.notEqual(errorMessage('academy_not_found', { fallback: '__none__' }), '__none__');
});

test('the pick lists come by kind; a failed call gives empty lists', async () => {
    setup({ '/comp/member/affiliation/options': () => ({ status: true, data: { club: [{ id: 1, name: 'A' }], school: [{ id: 2, name: 'S' }], region: [] } }) },
        { initialStorage: SIGNED_IN });
    const opts = await athletes.affiliationOptions();
    assert.deepEqual([opts.club.map((c) => c.id), opts.school.map((c) => c.id), opts.region], [[1], [2], []]);

    setup({}, { initialStorage: {} });
    const none = await athletes.affiliationOptions();
    assert.deepEqual([none.ok, none.code, none.club], [false, 'auth_required', []]);
});

test('every affiliation kind has its strings', () => {
    for (const a of athletes.AFFILIATIONS) {
        assert.notEqual(tr(a.label), a.label);
        assert.notEqual(tr(a.none), a.none);
    }
});
