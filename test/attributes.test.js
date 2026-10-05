import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as at from '../src/attributes.js';
import * as reg from '../src/registration.js';
import { STORAGE_KEYS } from '../src/config.js';
import { errorKey } from '../src/errors.js';
import { setLanguage } from '../src/i18n.js';
import { setup } from './helpers.js';

const SIGNED_IN = { [STORAGE_KEYS.token]: '12|' + 'x'.repeat(48), [STORAGE_KEYS.user]: JSON.stringify({ userid: 8520 }) };
const body = (call) => JSON.parse(call.init.body);

const SETUP = {
    sport_id: 4, uses_belts: false,
    attributes: [
        { id: 3, code: 'rank', name: 'Цол', name_en: 'Rank', kind: 'select', scope: 'athlete', required: true, max_length: null,
          options: [{ id: 31, code: 'm', name: 'Мастер', name_en: 'Master' }, { id: 32, code: 'im', name: 'ОУХМ', name_en: null }], value: null, option_ids: [31] },
        { id: 5, code: 'hand', name: 'Гар', name_en: 'Hand', kind: 'multi', scope: 'entry', required: false, max_length: null,
          options: [{ id: 51, name: 'Зүүн' }, { id: 52, name: 'Баруун' }], value: null, option_ids: [] },
        { id: 7, code: 'height', name: 'Өндөр', kind: 'number', scope: 'athlete', required: true, max_length: null, options: [], value: '180', option_ids: [] },
        { id: 9, code: 'nick', name: 'Хоч', kind: 'text', scope: 'entry', required: false, max_length: 5, options: [], value: null, option_ids: [] },
    ],
};

test('the setup: POST with event_id and reg_id (or member_id), normalised', async () => {
    const { calls } = setup({ '/comp/event/attributes': () => ({ status: true, data: SETUP }) });

    const res = await at.registrationAttributes(781, { regId: 27711 });
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(body(calls[0]), { event_id: 781, reg_id: 27711 });
    assert.equal(res.data.usesBelts, false);
    assert.deepEqual(res.data.attributes.map((a) => [a.id, a.kind, a.scope, a.required]), [[3, 'select', 'athlete', true], [5, 'multi', 'entry', false], [7, 'number', 'athlete', true], [9, 'text', 'entry', false]]);
    assert.equal(res.data.attributes[3].maxLength, 5);

    await at.registrationAttributes(781, { memberId: 41 });
    assert.deepEqual(body(calls[1]), { event_id: 781, member_id: 41 });
});

test('a signed-in caller is named, for the kept values', async () => {
    const { calls } = setup({ '/comp/event/attributes': () => ({ status: true, data: SETUP }) }, { initialStorage: SIGNED_IN });
    await at.registrationAttributes(781, { memberId: 41 });
    assert.deepEqual(body(calls[0]), { event_id: 781, user_id: 8520, member_id: 41 });
});

test('a failed setup asks nothing extra (compware still checks)', async () => {
    setup({ '/comp/event/attributes': () => ({ status: false, code: 'event_not_found' }) });
    const res = await at.registrationAttributes(1);
    assert.equal(res.ok, false);
    assert.deepEqual(res.data, { sportId: null, usesBelts: true, attributes: [] });
});

test('values start from what is kept; options toggle by kind', async () => {
    setup({ '/comp/event/attributes': () => ({ status: true, data: SETUP }) });
    const { attributes } = (await at.registrationAttributes(781)).data;
    const values = at.attributeValues(attributes);

    assert.deepEqual(values, { 3: { value: '', optionIds: [31] }, 5: { value: '', optionIds: [] }, 7: { value: '180', optionIds: [] }, 9: { value: '', optionIds: [] } });
    assert.deepEqual(at.toggleOption(attributes[0], values[3], 32).optionIds, [32], 'one choice replaces');
    assert.deepEqual(at.toggleOption(attributes[0], values[3], 31).optionIds, [31], 'a required choice cannot be cleared by tapping it');
    const twice = at.toggleOption(attributes[1], at.toggleOption(attributes[1], values[5], 51), 52);
    assert.deepEqual(twice.optionIds, [51, 52], 'several add up');
    assert.deepEqual(at.toggleOption(attributes[1], twice, 51).optionIds, [52], 'and come off again');
});

test('the checks are compware\'s', async () => {
    setup({ '/comp/event/attributes': () => ({ status: true, data: SETUP }) });
    const { attributes } = (await at.registrationAttributes(781)).data;

    const empty = { 3: { value: '', optionIds: [] }, 5: { optionIds: [] }, 7: { value: '  ' }, 9: { value: '' } };
    assert.deepEqual(at.attributeProblems(attributes, empty), [{ attributeId: 3, code: 'attribute_required' }, { attributeId: 7, code: 'attribute_required' }]);

    const wrong = { 3: { optionIds: [31, 32] }, 5: { optionIds: [99] }, 7: { value: 'tall' }, 9: { value: 'toolong' } };
    assert.deepEqual(at.attributeProblems(attributes, wrong).map((p) => p.code), ['attribute_one_option', 'attribute_option', 'attribute_number', 'attribute_too_long']);

    assert.deepEqual(at.attributeProblems(attributes, { 3: { optionIds: [31] }, 7: { value: '180.5' } }), []);
});

test('problems as text name the attribute, in the current language', async () => {
    setup({ '/comp/event/attributes': () => ({ status: true, data: SETUP }) });
    const { attributes } = (await at.registrationAttributes(781)).data;

    await setLanguage('en');
    assert.equal(at.attributeProblemText({ attributeId: 3, code: 'attribute_required' }, attributes), 'Rank: please fill this in');
    assert.equal(at.attributeProblemText({ attribute_id: 9, code: 'attribute_too_long' }, attributes), 'Хоч: at most 5 characters', 'compware\'s shape; no name_en falls back');
    assert.equal(at.optionLabel(attributes[0].options[1]), 'ОУХМ');
    assert.equal(at.attributeValueText(attributes[0], { optionIds: [31] }), 'Master');
    await setLanguage('mn');
    assert.equal(at.attributeLabel(attributes[0]), 'Цол');
    assert.equal(errorKey('attributes_invalid'), 'attributesInvalid');
});

test('the payload sends every attribute; registering carries it only when given', async () => {
    const { calls } = setup({
        '/comp/event/attributes': () => ({ status: true, data: SETUP }),
        '/comp/event/register': () => ({ status: true }),
    }, { initialStorage: SIGNED_IN });
    const { attributes } = (await at.registrationAttributes(781)).data;
    const payload = at.attributesPayload(attributes, { 3: { optionIds: [32] }, 7: { value: ' 181 ' } });

    assert.deepEqual(payload, [
        { attribute_id: 3, option_ids: [32] }, { attribute_id: 5, option_ids: [] },
        { attribute_id: 7, value: '181' }, { attribute_id: 9, value: '' },
    ]);

    const athlete = { registerNumber: 'УБ11223344', genderCode: '1' };
    const entry = { eventId: 781, entryId: 813, ageId: 926, beltId: null, weightId: 6067 };
    await reg.registerForEvent(athlete, entry, { attributes: payload });
    assert.deepEqual(body(calls[1]).attributes, payload);
    await reg.registerForEvent(athlete, entry);
    assert.equal('attributes' in body(calls[2]), false, 'the old body when not given');
});

test('the belt step', () => {
    const belts = [{ id: 1096, name: '--X--' }, { id: 1097, name: 'Blue' }];
    assert.deepEqual(at.beltStep(true, belts), { ask: true, beltId: null });
    assert.deepEqual(at.beltStep(false, belts), { ask: false, beltId: 1096 }, 'no belts: the placeholder is sent');
    assert.deepEqual(at.beltStep(true, []), { ask: false, beltId: null }, 'a division with none is not asked');

    const form = { registerNumber: 'УБ11223344', lastname: 'a', firstname: 'b', birthday: '2000-01-01', genderCode: '1', phoneNumber: '1',
        academyId: 1, entryId: 1, ageId: 1, beltId: null, weightId: 1, profileImage: 'x', idImage: 'y' };
    assert.deepEqual(reg.registrationProblems(form), ['valBelt']);
    assert.deepEqual(reg.registrationProblems(form, { askBelt: false }), []);
});
