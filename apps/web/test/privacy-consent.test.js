import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_PRIVACY_CONSENT,
  PRIVACY_CONSENT_STORAGE_KEY,
  allowsTrackingAdvertising,
  normalizePrivacyConsent,
  readPrivacyConsent,
  writePrivacyConsent
} from '../src/privacy-consent.js';

test('normalizes privacy consent with optional settings disabled by default', () => {
  assert.deepEqual(normalizePrivacyConsent(null), DEFAULT_PRIVACY_CONSENT);
  assert.deepEqual(normalizePrivacyConsent({ decided: 1, rememberSettings: 'yes', trackingAdvertising: 1 }), DEFAULT_PRIVACY_CONSENT);
  assert.deepEqual(normalizePrivacyConsent({ decided: true, rememberSettings: true, trackingAdvertising: true }), {
    decided: true,
    rememberSettings: true,
    trackingAdvertising: true
  });
});

test('reads and writes normalized privacy consent', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };

  assert.deepEqual(readPrivacyConsent(storage), DEFAULT_PRIVACY_CONSENT);
  assert.deepEqual(writePrivacyConsent({ decided: true, rememberSettings: true, trackingAdvertising: true }, storage), {
    decided: true,
    rememberSettings: true,
    trackingAdvertising: true
  });
  assert.deepEqual(JSON.parse(values.get(PRIVACY_CONSENT_STORAGE_KEY)), {
    decided: true,
    rememberSettings: true,
    trackingAdvertising: true
  });
  assert.deepEqual(readPrivacyConsent(storage), {
    decided: true,
    rememberSettings: true,
    trackingAdvertising: true
  });
});

test('allows tracking and advertising only after an explicit decision', () => {
  assert.equal(allowsTrackingAdvertising({ trackingAdvertising: true }), false);
  assert.equal(allowsTrackingAdvertising({ decided: true, trackingAdvertising: false }), false);
  assert.equal(allowsTrackingAdvertising({ decided: true, trackingAdvertising: true }), true);
});

test('falls back safely when stored consent is invalid', () => {
  const storage = {
    getItem: () => '{invalid json'
  };

  assert.deepEqual(readPrivacyConsent(storage), DEFAULT_PRIVACY_CONSENT);
});
