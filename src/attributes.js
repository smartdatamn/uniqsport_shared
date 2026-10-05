import { api } from './client.js';
import { getUserInfo } from './auth.js';
import { getItemField, tr } from './i18n.js';

/**
 * What a sport's registration asks beyond the division: attributes staff set
 * up in compadmin (Бүртгэлийн нэмэлт мэдээлэл, linked on the sport form), and
 * whether the sport uses belts. compware repo\comp\SportAttributes.
 *
 * An attribute:
 *   kind      'select' (one option) | 'multi' (several) | 'number' | 'text'
 *   scope     'athlete' - kept on the athlete for this sport, prefilled on
 *             their next entry; 'entry' - asked on every entry
 *   required  the form refuses to send it empty
 *   options   [{id, code, name, name_en}] for select / multi
 *   value / option_ids   what is kept, for an athlete the caller may act for
 *
 * The form holds values as { [attributeId]: { value: '', optionIds: [] } }
 * (attributeValues gives the starting point), checks them with
 * attributeProblems - compware checks the same again - and sends
 * attributesPayload(...) as the `attributes` option of registerForEvent.
 *
 * Belts: a sport that does not use them keeps one placeholder belt in each
 * division (brackets group by belt). beltStep says whether to ask, and which
 * belt to send when not asking.
 */

export const ATTRIBUTE_KINDS = Object.freeze(['select', 'multi', 'number', 'text']);

const NO_SETUP = Object.freeze({ sportId: null, usesBelts: true, attributes: [] });

/**
 * The event's attributes and belt switch. regId (an entry being changed) or
 * memberId (an athlete picked from my list) brings back what is kept.
 * On failure the envelope's data is the "asks nothing extra" setup; compware
 * still checks the attributes when registering.
 *
 * @param {number} eventId
 * @param {{regId?: number|null, memberId?: number|null}} [options]
 */
export async function registrationAttributes(eventId, { regId = null, memberId = null } = {}) {
    const body = { event_id: eventId };
    // Kept values come only for an athlete the caller may act for. A token
    // names the caller; without one (the app's legacy path) the stored user
    // does, as every other app call does.
    const stored = await getUserInfo().catch(() => null);
    if (stored?.userid) body.user_id = stored.userid;
    if (regId) body.reg_id = regId;
    else if (memberId) body.member_id = memberId;

    const envelope = await api('URL_COMP_EVENT_ATTRIBUTES', { method: 'POST', body });
    if (!envelope.ok || !envelope.data || typeof envelope.data !== 'object') {
        return { ...envelope, data: NO_SETUP };
    }

    const d = envelope.data;
    return {
        ...envelope,
        data: {
            sportId: d.sport_id ?? null,
            usesBelts: d.uses_belts !== false,
            attributes: Array.isArray(d.attributes) ? d.attributes.map(normalise) : [],
        },
    };
}

function normalise(a) {
    return {
        id: Number(a.id),
        code: a.code ?? null,
        name: a.name ?? '',
        name_en: a.name_en ?? null,
        description: a.description ?? null,
        kind: ATTRIBUTE_KINDS.includes(a.kind) ? a.kind : 'text',
        scope: a.scope === 'entry' ? 'entry' : 'athlete',
        required: a.required === true,
        maxLength: a.max_length ? Number(a.max_length) : null,
        options: Array.isArray(a.options) ? a.options.map((o) => ({ ...o, id: Number(o.id) })) : [],
        value: a.value ?? null,
        optionIds: Array.isArray(a.option_ids) ? a.option_ids.map(Number) : [],
    };
}

/**
 * The form's starting values: what is kept, else empty.
 *
 * @param {Array<{id: number, value?: string|null, optionIds?: number[]}>|null|undefined} attributes
 * @returns {Record<number, {value: string, optionIds: number[]}>}
 */
export function attributeValues(attributes) {
    /** @type {Record<number, {value: string, optionIds: number[]}>} */
    const values = {};
    for (const a of attributes ?? []) {
        values[a.id] = { value: a.value == null ? '' : String(a.value), optionIds: [...(a.optionIds ?? [])] };
    }
    return values;
}

/** A choice attribute's values after tapping an option. */
export function toggleOption(attribute, current, optionId) {
    const ids = current?.optionIds ?? [];
    const id = Number(optionId);
    if (attribute.kind === 'multi') {
        return { value: '', optionIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] };
    }
    return { value: '', optionIds: ids.includes(id) && !attribute.required ? [] : [id] };
}

const isChoice = (a) => a.kind === 'select' || a.kind === 'multi';
const isEmpty = (a, v) => (isChoice(a) ? !(v?.optionIds?.length) : String(v?.value ?? '').trim() === '');

/**
 * The form's checks, as compware makes them: [{attributeId, code}].
 * Codes: attribute_required, attribute_number, attribute_too_long,
 * attribute_one_option, attribute_option.
 */
export function attributeProblems(attributes, values) {
    const problems = [];
    for (const a of attributes ?? []) {
        const v = values?.[a.id];
        let code = null;

        if (isEmpty(a, v)) {
            if (a.required) code = 'attribute_required';
        } else if (isChoice(a)) {
            const known = new Set(a.options.map((o) => o.id));
            if (v.optionIds.some((id) => !known.has(Number(id)))) code = 'attribute_option';
            else if (a.kind === 'select' && v.optionIds.length > 1) code = 'attribute_one_option';
        } else {
            const text = String(v.value).trim();
            if (a.kind === 'number' && !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(text)) code = 'attribute_number';
            else if (a.maxLength && text.length > a.maxLength) code = 'attribute_too_long';
        }

        if (code) problems.push({ attributeId: a.id, code });
    }
    return problems;
}

const PROBLEM_KEYS = Object.freeze({
    attribute_required: 'attrRequired',
    attribute_number: 'attrNumber',
    attribute_too_long: 'attrTooLong',
    attribute_one_option: 'attrInvalid',
    attribute_option: 'attrInvalid',
    attribute_unknown: 'attrInvalid',
});

/**
 * A problem as text, naming the attribute: "Rank: please fill this in".
 * Takes the client's problems ({attributeId}) or compware's ({attribute_id}).
 */
export function attributeProblemText(problem, attributes) {
    const id = Number(problem.attributeId ?? problem.attribute_id);
    const attribute = (attributes ?? []).find((a) => a.id === id);
    const text = tr(PROBLEM_KEYS[problem.code] ?? 'attrInvalid', { max: attribute?.maxLength ?? '' });
    return attribute ? `${attributeLabel(attribute)}: ${text}` : text;
}

/** What registerForEvent sends: every attribute, so clearing one clears it. */
export function attributesPayload(attributes, values) {
    return (attributes ?? []).map((a) => {
        const v = values?.[a.id];
        return isChoice(a)
            ? { attribute_id: a.id, option_ids: [...(v?.optionIds ?? [])] }
            : { attribute_id: a.id, value: String(v?.value ?? '').trim() };
    });
}

export const attributeLabel = (attribute) => getItemField(attribute, 'name') ?? '';
export const optionLabel = (option) => getItemField(option, 'name') ?? '';

/** "Rank: Master" - a kept value for display. */
export function attributeValueText(attribute, value) {
    if (isChoice(attribute)) {
        return attribute.options.filter((o) => (value?.optionIds ?? []).includes(o.id)).map(optionLabel).join(', ');
    }
    return String(value?.value ?? '');
}

/**
 * Whether to ask for a belt, and what to send when not asking. A sport
 * without belts, or a division with none: not asked; the division's first
 * belt (its placeholder) is sent, or none.
 *
 * @returns {{ ask: boolean, beltId: number|null }}
 */
export function beltStep(usesBelts, belts) {
    const list = Array.isArray(belts) ? belts : [];
    if (usesBelts !== false && list.length > 0) return { ask: true, beltId: null };
    return { ask: false, beltId: list.length > 0 ? Number(list[0].id) : null };
}
