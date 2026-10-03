import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as draws from '../src/draws.js';
import { errorMessage } from '../src/errors.js';
import { tr } from '../src/i18n.js';
import { setup } from './helpers.js';

const m = (o) => ({ loser_bracket: false, status: 'pending', winner: null, one: null, two: null, ...o });

test('draws for an event and one draw are GETs by id', async () => {
    const { calls } = setup({ '/comp/event/draws': () => ({ status: true, data: [] }), '/comp/event/draw': () => ({ status: true, data: {} }) });
    await draws.eventDraws(781);
    await draws.eventDraw(5);
    assert.deepEqual(calls.map((c) => [new URL(c.url).pathname, new URL(c.url).searchParams.toString()]), [['/comp/event/draws', 'event_id=781'], ['/comp/event/draw', 'draw_id=5']]);
});

test('the draw for a group, belt optional', () => {
    const list = [{ id: 1, entry_id: 10, age_id: 20, belt_id: 30, weight_id: 40 }, { id: 2, entry_id: 10, age_id: 20, belt_id: 31, weight_id: 41 }];
    assert.equal(draws.drawForGroup(list, { entryId: '10', ageId: 20, beltId: 30, weightId: 40 }).id, 1);
    assert.equal(draws.drawForGroup(list, { entryId: 10, ageId: 20, weightId: 41 }).id, 2);
    assert.equal(draws.drawForGroup(list, { entryId: 10, ageId: 20, beltId: 31, weightId: 40 }), null);
});

test('columns by round in play order; repechage apart', () => {
    const ms = [
        m({ id: 3, round: 2, order: 201, round_name: 'SF' }), m({ id: 1, round: 1, order: 2, round_name: 'QF' }),
        m({ id: 2, round: 1, order: 1, round_name: 'QF' }), m({ id: 9, round: 2, order: 1, round_name: 'Bronze', loser_bracket: true }),
    ];
    assert.deepEqual(draws.bracketColumns(ms).map((c) => [c.round, c.name, c.matches.map((x) => x.id)]), [[1, 'QF', [2, 1]], [2, 'SF', [3]]]);
    assert.deepEqual(draws.loserMatches(ms).map((g) => [g.name, g.matches.map((x) => x.id)]), [['Bronze', [9]]]);
});

test('round-robin standings count decided games only, byes are not games', () => {
    const ms = [
        m({ one: 1, two: 2, winner: 1, status: 'completed' }), m({ one: 2, two: 3, winner: 2, status: 'completed' }),
        m({ one: 1, two: 3 }), m({ one: 4, two: null, winner: 4, status: 'bye' }),
    ];
    assert.deepEqual(draws.standings(ms), [
        { regId: 1, played: 1, wins: 1 }, { regId: 2, played: 2, wins: 1 }, { regId: 3, played: 1, wins: 0 }, { regId: 4, played: 0, wins: 0 },
    ]);
});

test('names by registration id, string keys from JSON too', () => {
    const d = { people: { 7: { lastname: 'Болд', firstname: 'Сараа' } } };
    assert.equal(draws.personName(d, 7), 'Болд Сараа');
    assert.equal(draws.personName(d, '7'), 'Болд Сараа');
    assert.equal(draws.personName(d, null), null);
    assert.equal(draws.personName(d, 8), null);
});

test('an unpublished bracket has a message, as do the labels', () => {
    assert.notEqual(errorMessage('draw_not_found', { fallback: '__none__' }), '__none__');
    for (const k of ['bracketTitle', 'bracketBye', 'bracketTbd', 'bracketRepechage', 'bracketStandings', 'bracketWins']) assert.notEqual(tr(k), k, k);
});

test('small draws play as a round robin whatever the format', () => {
    const linked = [m({ next: 3 }), m({ next: 3 }), m({})];
    const loose = [m({}), m({}), m({})];
    assert.equal(draws.playsAsRoundRobin({ format: 'round_robin', matches: linked }), true);
    assert.equal(draws.playsAsRoundRobin({ format: 'double', matches: loose }), true);
    assert.equal(draws.playsAsRoundRobin({ format: 'single', matches: linked }), false);
    assert.equal(draws.playsAsRoundRobin({ format: 'single', matches: [m({})] }), false);
});
