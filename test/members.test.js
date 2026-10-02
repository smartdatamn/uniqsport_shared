import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as members from '../src/members.js';
import { STORAGE_KEYS } from '../src/config.js';
import { errorMessage } from '../src/errors.js';
import { setup } from './helpers.js';

const TOKEN = '12|' + 'x'.repeat(48);
const SIGNED_IN = { [STORAGE_KEYS.token]: TOKEN, [STORAGE_KEYS.user]: JSON.stringify({ userid: 8520 }) };
const body = (call) => JSON.parse(call.init.body);
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

const valid = {
    registerNumber: 'УБ99010112', lastname: 'Дорж', firstname: 'Бат', birthday: '2009-05-17', genderCode: '1',
    profileImage: PNG, idImage: PNG,
};

test('signed out: refused without a request', async () => {
    const { calls } = setup({});
    assert.equal((await members.myAthletes()).code, 'auth_required');
    assert.equal((await members.saveAthlete(valid, { isNew: true })).code, 'auth_required');
    assert.equal(calls.length, 0);
});

test('the list is a POST for the stored user, every sport', async () => {
    const { calls } = setup({ '/comp/event/members/registration': () => ({ status: true, data: [{ id: 1 }] }) }, { initialStorage: SIGNED_IN });

    const res = await members.myAthletes();

    assert.deepEqual(res.data, [{ id: 1 }]);
    assert.deepEqual(body(calls[0]), { user_id: 8520 });
    assert.equal(calls[0].init.headers.Authorization, 'Bearer ' + TOKEN);
});

test('saving sends the whole record, the ID upper-cased, photos only when given', async () => {
    const { calls } = setup({ '/comp/event/register': () => ({ status: true }) }, { initialStorage: SIGNED_IN });

    await members.saveAthlete({ ...valid, registerNumber: ' уб99010112 ', profileImage: null, idImage: null, phoneNumber: ' 99112233 ' }, { isNew: false });

    assert.deepEqual(body(calls[0]), {
        userId: 8520, registerNumber: 'УБ99010112', lastname: 'Дорж', firstname: 'Бат',
        birthday: '2009-05-17', genderCode: '1', phoneNumber: '99112233', isEdit: true,
    });

    await members.saveAthlete(valid, { isNew: true });
    assert.equal(body(calls[1]).profileImage, PNG);
    assert.equal(body(calls[1]).isEdit, false);
});

test('someone else\'s athlete comes back as member_owned_by_other', async () => {
    setup({ '/comp/event/register': () => ({ status: false, data: null, code: 'member_owned_by_other', message: '…' }) }, { initialStorage: SIGNED_IN });
    assert.equal((await members.saveAthlete(valid, { isNew: true })).code, 'member_owned_by_other');
});

test('the form rules match the app', () => {
    assert.deepEqual(members.athleteProblems(valid, { isNew: true }), []);
    assert.deepEqual(members.athleteProblems({ ...valid, registerNumber: 'УБ123' }, { isNew: true }), ['regNumberInvalid']);
    assert.deepEqual(members.athleteProblems({ ...valid, registerNumber: 'X1' }, { isNew: true, foreignPassport: true }), []);
    assert.deepEqual(members.athleteProblems({ ...valid, firstname: ' ' }, { isNew: true }), ['fillAllFields']);
    for (const bad of ['2009-02-30', '17.05.2009', '2999-01-01', '']) {
        assert.deepEqual(members.athleteProblems({ ...valid, birthday: bad }, { isNew: true }), ['valBirthday'], bad);
    }
    assert.deepEqual(members.athleteProblems({ ...valid, genderCode: '' }, { isNew: true }), ['valGender']);
    assert.deepEqual(members.athleteProblems({ ...valid, profileImage: null, idImage: null }, { isNew: true }), ['valPortrait', 'valDocument']);
    assert.deepEqual(members.athleteProblems({ ...valid, profileImage: null, idImage: null }, { isNew: false }), [], 'an existing athlete keeps its photos');
});

test('a refused delete explains itself', () => {
    assert.notEqual(errorMessage('member_has_registrations', { fallback: '__none__' }), '__none__');
});
