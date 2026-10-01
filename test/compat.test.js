/**
 * Proves the package is a faithful replacement for the mobile app code it was
 * extracted from: same URLs, same strings, same helper method names.
 *
 * Reads the sibling checkout at ../uniqsport. Each check skips itself when
 * that file is absent, or once it has been turned into a shim that no longer
 * contains the original definitions — at that point this package IS the
 * source and there is nothing left to compare against.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildEndpoints, ENDPOINT_PATHS } from '../src/endpoints.js';
import { en } from '../src/lang/en.js';
import { mn } from '../src/lang/mn.js';
import { UserHelper, LanguageHelper, PaymentHelper, SmartHelper } from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(here, '..', '..', 'uniqsport');

function readMobile(rel) {
    const file = path.join(MOBILE, rel);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function staticNames(source) {
    return [...source.matchAll(/^\s*static\s+([A-Za-z0-9_]+)\s*=/gm)].map((m) => m[1]);
}

test('endpoints match uniqsport/app/config/WebServices.js', (t) => {
    const src = readMobile('app/config/WebServices.js');
    const defs = src ? [...src.matchAll(/export const (URL_[A-Z0-9_]+)\s*=\s*HOST_COMPWARE\s*\+\s*["']([^"']+)["']/g)] : [];
    if (defs.length === 0) return t.skip('no original definitions to compare against');

    const original = Object.fromEntries(defs.map((m) => [m[1], m[2]]));
    assert.deepEqual(ENDPOINT_PATHS, original);

    const built = buildEndpoints('http://compware.uniq.mn/');
    assert.equal(built.URL_COMP_EVENT_LIST, 'http://compware.uniq.mn/comp/event/list');
});

test('strings match uniqsport/app/lang/SupportedLanguages.js', async (t) => {
    const src = readMobile('app/lang/SupportedLanguages.js');
    if (!src || !/const en = \{/.test(src)) return t.skip('no original string table to compare against');

    const orig = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
    assert.deepEqual(en, orig.en);
    assert.deepEqual(mn, orig.mn);
});

for (const [file, facade, exclude] of [
    ['app/classes/UserHelper.js', UserHelper, []],
    ['app/classes/LanguageHelper.js', LanguageHelper, ['style']],
    ['app/classes/PaymentHelper.js', PaymentHelper, []],
    ['app/classes/SmartHelper.js', SmartHelper, []],
]) {
    test(`facade covers every method of ${path.basename(file)}`, (t) => {
        const src = readMobile(file);
        const names = src ? staticNames(src).filter((n) => !exclude.includes(n)) : [];
        if (names.length === 0) return t.skip('no original class to compare against');

        const missing = names.filter((n) => typeof facade[n] !== 'function');
        assert.deepEqual(missing, [], `methods missing from the ${path.basename(file, '.js')} facade`);
    });
}
