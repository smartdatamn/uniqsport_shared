import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as reg from '../src/registration.js';
import { STORAGE_KEYS } from '../src/config.js';
import { tr } from '../src/i18n.js';
import { setup } from './helpers.js';

const SIGNED_IN = { [STORAGE_KEYS.token]: '12|' + 'x'.repeat(48), [STORAGE_KEYS.user]: JSON.stringify({ userid: 8520 }) };
const body = (call) => JSON.parse(call.init.body);

test('labels: fee, age groups as the organiser typed them, weights', () => {
    assert.equal(reg.entryLabel({ name: 'Adult', entrance_fee: '30000', fee: null }), 'Adult - 30,000₮');
    assert.equal(reg.entryLabel({ name: 'Kids', entrance_fee: '30000', fee: { entrance_fee: '25000' } }), 'Kids - 25,000₮', 'a fee row wins');
    assert.equal(reg.entryLabel({ name: 'Open' }), 'Open');
    assert.equal(reg.ageLabel({ start_age: 2008, end_age: 1980 }), '2008-1980' + tr('ageSuffix'));
    assert.equal(reg.ageLabel({ start_age: 18, end_age: null }), '18' + tr('ageAndAbove'));
    assert.equal(reg.weightLabel({ weight: '-56' }), '-56' + tr('weightKg'));
});

test('the cascade calls: entries by gender, a division\'s options, an age group\'s weights', async () => {
    const { calls } = setup({
        '/comp/event/entries': () => ({ status: true, data: [{ id: 813 }] }),
        '/comp/event/entry/config': () => ({ status: true, age: [{ id: 926 }], belt: [{ id: 1096 }] }),
        '/comp/event/entry/weight': () => ({ status: true, data: [{ id: 6067 }] }),
    });

    assert.deepEqual(await reg.eventEntries(781, '1'), [{ id: 813 }]);
    assert.deepEqual(calls[0].query, { event_id: '781', gender_code: '1' });
    assert.deepEqual(await reg.entryOptions(813), { ages: [{ id: 926 }], belts: [{ id: 1096 }] });
    assert.deepEqual(await reg.entryWeights(813, 926), [{ id: 6067 }]);
    assert.deepEqual(calls[2].query, { entry_id: '813', age_id: '926' });
});

test('a failed list is an empty list, never an error string', async () => {
    setup({ '/comp/event/entries': () => ({ status: false, data: 'SQLSTATE[42P01] …' }) });
    assert.deepEqual(await reg.eventEntries(1, '1'), []);
});

test('my registrations keep only athletes registered here', async () => {
    const { calls } = setup({
        '/comp/event/registered/members': () => ({ status: true, data: [{ id: 1, registrations: [{ id: 9 }] }, { id: 2, registrations: [] }] }),
    }, { initialStorage: SIGNED_IN });

    const res = await reg.myEventRegistrations(781);

    assert.deepEqual(res.data.map((m) => m.id), [1]);
    assert.deepEqual(body(calls[0]), { user_id: 8520, event_id: 781 });
});

test('registering sends the app\'s body; changing one sends isEdit and its reg_id', async () => {
    const { calls } = setup({ '/comp/event/register': () => ({ status: true }) }, { initialStorage: SIGNED_IN });
    const athlete = { registerNumber: 'уб11223344', lastname: 'Болд', firstname: 'Сараа', birthday: '2011-02-03', genderCode: '2', phoneNumber: '99112233', profileImage: 'https://x/p.png', idImage: 'data:image/jpeg;base64,AA' };
    const entry = { eventId: 781, academyId: 613, academyName: '', entryId: 813, ageId: 926, beltId: 1096, weightId: 6067 };

    await reg.registerForEvent(athlete, entry);
    assert.deepEqual(body(calls[0]), {
        userId: 8520, eventId: 781, registerNumber: 'УБ11223344', firstname: 'Сараа', lastname: 'Болд', birthday: '2011-02-03',
        genderCode: '2', phoneNumber: '99112233', academy: 613, entry: 813, age: 926, belt: 1096, weight: 6067,
        idImage: 'data:image/jpeg;base64,AA', profileImage: 'https://x/p.png', isEdit: false, reg_id: null, academyName: '',
    });

    await reg.registerForEvent(athlete, entry, { regId: 27711 });
    assert.equal(body(calls[1]).isEdit, true);
    assert.equal(body(calls[1]).reg_id, 27711);
});

test('the form\'s checks, in the app\'s order', () => {
    const ok = {
        registerNumber: 'УБ11223344', lastname: 'Б', firstname: 'С', birthday: '2011-02-03', genderCode: '2', phoneNumber: '99',
        academyId: 613, entryId: 813, ageId: 926, beltId: 1096, weightId: 6067, profileImage: 'x', idImage: 'y',
    };
    assert.deepEqual(reg.registrationProblems(ok), []);
    assert.deepEqual(reg.registrationProblems({}), [
        'valRegNumber', 'valLastname', 'valFirstname', 'valBirthday', 'valGender', 'valPhone', 'valAcademy',
        'valEntry', 'valAge', 'valBelt', 'valWeight', 'valPortrait', 'valDocument',
    ]);
    assert.deepEqual(reg.registrationProblems({ ...ok, academyIsOther: true, academyName: ' ' }), ['valAcademyName']);
    assert.deepEqual(reg.registrationProblems({ ...ok, registerNumber: 'P1' }, { foreignPassport: true }), []);
});

test('competitors are grouped by age group and weight class, in compware\'s order', async () => {
    const { calls } = setup({
        '/comp/event/members': () => ({
            status: true,
            data: [
                { regid: 1, ageid: 926, start_age: 2008, end_age: 1980, wid: 6067, weight: '-56', firstname: 'A' },
                { regid: 2, ageid: 926, start_age: 2008, end_age: 1980, wid: 6067, weight: '-56', firstname: 'B' },
                { regid: 3, ageid: 926, start_age: 2008, end_age: 1980, wid: 6073, weight: '-62', firstname: 'C' },
            ],
        }),
    });

    const groups = await reg.competitorGroups(781, 813);

    assert.deepEqual(groups.map((g) => [g.weight, g.members.map((m) => m.firstname)]), [['-56', ['A', 'B']], ['-62', ['C']]]);
    assert.deepEqual(calls[0].query, { event_id: '781', entry_id: '813', belt_id: '', age_id: '' }, 'belt / age sent empty when not chosen');
});
