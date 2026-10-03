import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as bulk from '../src/bulkEntry.js';
import { STORAGE_KEYS } from '../src/config.js';
import { errorMessage } from '../src/errors.js';
import { tr } from '../src/i18n.js';
import { setup } from './helpers.js';

const TOKEN = '12|' + 'x'.repeat(48);
const SIGNED_IN = { [STORAGE_KEYS.token]: TOKEN, [STORAGE_KEYS.user]: JSON.stringify({ userid: 8520 }) };
const body = (call) => JSON.parse(call.init.body);

const MEN = {
    id: 10, gender_code: '1',
    ages: [{ id: 101, start_age: 2008, end_age: 1980, weights: [{ id: 1001, weight: '-62' }] }, { id: 102, start_age: 2012, end_age: 2009, weights: [] }],
    belts: [{ id: 201, name: 'White' }],
};
const WOMEN = { id: 11, gender_code: '2', ages: [{ id: 111, start_age: 2010, end_age: 1980, weights: [] }], belts: [] };
const OPEN = { id: 12, gender_code: null, ages: [], belts: [] };

test('without a token: auth_required, and no request', async () => {
    const { calls } = setup({}, { initialStorage: {} });
    assert.equal((await bulk.academyEventSheet(7, 781)).code, 'auth_required');
    assert.equal((await bulk.registerAthletes(7, 781, [])).code, 'auth_required');
    assert.equal(calls.length, 0);
});

test('registering sends the rows, belt and weight only when chosen, and no user id', async () => {
    const { calls } = setup({ '/comp/academy/event/register': () => ({ status: true, data: [{ row: 0, reg_id: 5 }] }) },
        { initialStorage: SIGNED_IN });

    const res = await bulk.registerAthletes(7, 781, [
        { memberId: 1, entryId: 10, ageId: 101, beltId: 201, weightId: 1001 },
        { memberId: 2, entryId: 11, ageId: 111, beltId: null, weightId: '' },
    ]);

    assert.equal(res.ok, true);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer ' + TOKEN);
    assert.deepEqual(body(calls[0]), {
        academy_id: 7, event_id: 781,
        rows: [{ member_id: 1, entry: 10, age: 101, belt: 201, weight: 1001 }, { member_id: 2, entry: 11, age: 111 }],
    });
});

test('a refused batch: the code, and each row\'s reason by index', async () => {
    setup({ '/comp/academy/event/register': () => ({ status: false, data: null, code: 'rows_invalid', message: 'm', rows: [{ row: 1, member_id: 2, code: 'division_gender' }] }) },
        { initialStorage: SIGNED_IN });

    const res = await bulk.registerAthletes(7, 781, [{ memberId: 1, entryId: 10, ageId: 101 }, { memberId: 2, entryId: 10, ageId: 101 }]);

    assert.equal(res.code, 'rows_invalid');
    assert.deepEqual([...bulk.rowErrors(res)], [[1, 'division_gender']]);
    assert.deepEqual([...bulk.rowErrors({ raw: null })], []);
});

test('divisions by gender, open ones for everybody', () => {
    assert.deepEqual(bulk.divisionsFor({ gender_code: '2' }, [MEN, WOMEN, OPEN]).map((d) => d.id), [11, 12]);
    assert.deepEqual(bulk.divisionsFor({ gender_code: 1 }, [MEN, WOMEN, OPEN]).map((d) => d.id), [10, 12]);
});

test('already entered: by division', () => {
    const athlete = { registrations: [{ id: 1, entry_id: 10 }] };
    assert.equal(bulk.alreadyEntered(athlete, 10), true);
    assert.equal(bulk.alreadyEntered(athlete, '11'), false);
    assert.equal(bulk.alreadyEntered({}, 10), false);
});

test('age groups: birth years either way round, sporting ages, or no guess', () => {
    const years = [{ id: 1, start_age: 2014, end_age: 2013 }, { id: 2, start_age: 2012, end_age: 2011 }, { id: 3, start_age: 2008, end_age: 1980 }];
    assert.equal(bulk.suggestAgeGroup('2011-05-01', years, '2026-11-01'), 2);
    assert.equal(bulk.suggestAgeGroup('1995-01-01', years, '2026-11-01'), 3);
    assert.equal(bulk.suggestAgeGroup('2010-01-01', years, '2026-11-01'), null);   // in none

    const ages = [{ id: 4, start_age: 12, end_age: 13 }, { id: 5, start_age: 14, end_age: 15 }, { id: 6, start_age: 18, end_age: null }];
    assert.equal(bulk.suggestAgeGroup('2012-12-31', ages, '2026-03-01'), 5);        // 14 in 2026
    assert.equal(bulk.suggestAgeGroup('1990-01-01', ages, '2026-03-01'), 6);        // open-ended
    assert.equal(bulk.suggestAgeGroup('2010-01-01', ages, '2026-03-01'), null);     // 16: none

    const overlapping = [{ id: 7, start_age: 10, end_age: 13 }, { id: 8, start_age: 13, end_age: 17 }];
    assert.equal(bulk.suggestAgeGroup('2013-06-01', overlapping, '2026-01-01'), null);   // two fit: a person chooses
    assert.equal(bulk.suggestAgeGroup(null, years, '2026-01-01'), null);
    assert.equal(bulk.suggestAgeGroup('2011-01-01', [{ id: 9, start_age: 2011, end_age: null }], '2026-01-01'), null);   // a year, open: ambiguous
});

test('what a row still needs - the server\'s rules', () => {
    const divisions = [MEN, WOMEN];
    assert.deepEqual(bulk.rowNeeds({ entryId: null }, divisions), ['division']);
    assert.deepEqual(bulk.rowNeeds({ entryId: 10 }, divisions), ['age', 'belt']);
    assert.deepEqual(bulk.rowNeeds({ entryId: 10, ageId: 101, beltId: 201 }, divisions), ['weight']);
    assert.deepEqual(bulk.rowNeeds({ entryId: 10, ageId: 101, beltId: 201, weightId: 1001 }, divisions), []);
    assert.deepEqual(bulk.rowNeeds({ entryId: 10, ageId: 102, beltId: 201 }, divisions), []);   // that age has no weights
    assert.deepEqual(bulk.rowNeeds({ entryId: 11, ageId: 111 }, divisions), []);                // no belts, no weights
    assert.deepEqual(bulk.rowNeeds({ entryId: 10, ageId: 111, beltId: 201 }, divisions), ['age']); // another division's age
});

test('every bulk code, row reason and missing item has a message in both languages', () => {
    for (const code of ['event_not_found', 'team_event', 'event_needs_attributes', 'registration_closed', 'no_rows', 'too_many_rows', 'rows_invalid', 'already_entered']) {
        assert.notEqual(errorMessage(code, { fallback: '__none__' }), '__none__', code);
    }
    for (const key of [...Object.values(bulk.ROW_ERROR_KEYS), ...Object.values(bulk.MISSING_KEYS)]) {
        assert.notEqual(tr(key), key, key);
    }
});
