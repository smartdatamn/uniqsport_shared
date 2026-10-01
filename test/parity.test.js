/**
 * The parity suite — the guard that keeps the two clients from drifting.
 *
 * Every rule here is a bug both repos' CLAUDE.md files already record as
 * recurring: a key added to one locale and not the other, a placeholder
 * renamed in one language, an error code with no message. Run `npm test`
 * after ANY edit to this package.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { en } from '../src/lang/en.js';
import { mn } from '../src/lang/mn.js';
import { placeholdersOf } from '../src/i18n.js';
import { ERROR_KEYS } from '../src/errors.js';
import { ENDPOINT_PATHS } from '../src/endpoints.js';

const diff = (a, b) => Object.keys(a).filter((k) => !Object.prototype.hasOwnProperty.call(b, k));

test('en and mn have exactly the same keys', () => {
    assert.deepEqual(diff(en, mn), [], 'keys in en missing from mn');
    assert.deepEqual(diff(mn, en), [], 'keys in mn missing from en');
});

test('no translation is empty or not a string', () => {
    for (const [name, table] of [['en', en], ['mn', mn]]) {
        const bad = Object.entries(table)
            .filter(([, v]) => typeof v !== 'string' || v.trim() === '')
            .map(([k]) => k);
        assert.deepEqual(bad, [], `empty or non-string values in ${name}`);
    }
});

test('every {placeholder} appears in both languages', () => {
    const mismatched = [];
    for (const key of Object.keys(en)) {
        const a = placeholdersOf(en[key]).join(',');
        const b = placeholdersOf(mn[key] ?? '').join(',');
        if (a !== b) mismatched.push(`${key}: en {${a}} vs mn {${b}}`);
    }
    assert.deepEqual(mismatched, []);
});

test('every error code maps to a key that exists in both languages', () => {
    const missing = Object.entries(ERROR_KEYS)
        .filter(([, key]) => !(key in en) || !(key in mn))
        .map(([code, key]) => `${code} -> ${key}`);
    assert.deepEqual(missing, []);
});

test('the fallback keys error handling relies on exist', () => {
    for (const key of ['errorTemporary', 'alertMsgError', 'alertInCorrectNumber']) {
        assert.ok(key in en && key in mn, `missing fallback key ${key}`);
    }
});

test('every endpoint path is well-formed and listed once', () => {
    const paths = Object.values(ENDPOINT_PATHS);
    for (const p of paths) {
        assert.match(p, /^\/[a-z0-9/_-]+$/, `malformed path ${p}`);
    }
    const dupes = paths.filter((p, i) => paths.indexOf(p) !== i);
    assert.deepEqual(dupes, [], 'paths listed more than once');
});
