import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as account from '../src/account.js';
import { TERMS_VERSION } from '../src/terms.js';
import { STORAGE_KEYS } from '../src/config.js';
import { setup } from './helpers.js';

test('accepting the Terms posts the current version with the token; none without one', async () => {
    let r = setup({}, { initialStorage: {} });
    assert.equal((await account.acceptTerms()).code, 'auth_required');
    assert.equal(r.calls.length, 0);

    r = setup({ '/core/user/terms/accept': () => ({ status: true, data: {} }) },
        { initialStorage: { [STORAGE_KEYS.token]: '12|' + 'x'.repeat(48), [STORAGE_KEYS.user]: '{"userid":1}' } });
    await account.acceptTerms();
    assert.equal(r.calls[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(r.calls[0].init.body), { version: TERMS_VERSION });
});

test('accepted only when the user holds the current version', () => {
    assert.equal(account.termsAccepted({ terms_version: TERMS_VERSION }), true);
    assert.equal(account.termsAccepted({ terms_version: 'old' }), false);
    assert.equal(account.termsAccepted({}), false);
    assert.equal(account.termsAccepted({ termsVersion: TERMS_VERSION }), true);   // the stored shape
});
