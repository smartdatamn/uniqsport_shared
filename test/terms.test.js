import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as terms from '../src/terms.js';

test('both languages: a title, the 12 sections, bullets with bold placeholders', () => {
    for (const locale of ['mn', 'en']) {
        const blocks = terms.termsBlocks(locale);
        assert.equal(blocks[0].type, 'h1', locale);
        assert.equal(blocks.filter((b) => b.type === 'h2').length, 12, locale);
        assert.ok(blocks.filter((b) => b.type === 'li').length > 40, locale);
        assert.ok(blocks.some((b) => b.parts.some((p) => p.bold && p.text.startsWith('['))), locale);
    }
});

test('the refund terms say 98% in both languages, and the acceptance text exists for both', () => {
    assert.match(terms.termsText('en'), /98% of the event registration fee/);
    assert.match(terms.termsText('mn'), /98%-ийг буцаана/);
    assert.ok(terms.TERMS_ACCEPTANCE.mn.length > 100 && terms.TERMS_ACCEPTANCE.en.length > 100);
    assert.equal(terms.termsText('fr'), terms.termsText('mn'));
    assert.ok(terms.TERMS_VERSION);
});
