import assert from 'node:assert/strict';
import test from 'node:test';

import { LANGUAGE_STORAGE_KEY, detectLanguage, normalizeLanguage, translate } from '../src/i18n.js';
import de from '../src/locales/de.js';
import en from '../src/locales/en.js';

test('English and German catalogs contain the same message keys', () => {
  assert.deepEqual(Object.keys(de).sort(), Object.keys(en).sort());
});

test('normalizes supported browser language values', () => {
  assert.equal(normalizeLanguage('de-DE'), 'de');
  assert.equal(normalizeLanguage('de'), 'de');
  assert.equal(normalizeLanguage('en-GB'), 'en');
  assert.equal(normalizeLanguage('fr-FR'), 'en');
});

test('stored language takes priority over the browser language', () => {
  const storage = {
    getItem(key) {
      assert.equal(key, LANGUAGE_STORAGE_KEY);
      return 'en';
    }
  };

  assert.equal(detectLanguage({ storage, navigatorLanguage: 'de-DE' }), 'en');
  assert.equal(detectLanguage({ navigatorLanguage: 'de-DE' }), 'de');
});

test('translates variables and falls back to English or supplied text', () => {
  assert.equal(translate('de', 'devices.disconnectNamed', { name: 'Trainer' }), 'Trainer trennen');
  assert.equal(translate('de', 'missing.key', {}, 'Plugin label'), 'Plugin label');
  assert.equal(translate('fr', 'nav.privacy'), 'Privacy');
});
