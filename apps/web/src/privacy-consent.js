export const PRIVACY_CONSENT_STORAGE_KEY = 'ble-bridge.privacyConsent.v1';

export const DEFAULT_PRIVACY_CONSENT = Object.freeze({
  decided: false,
  rememberSettings: false,
  trackingAdvertising: false
});

export function normalizePrivacyConsent(value) {
  return {
    decided: value?.decided === true,
    rememberSettings: value?.rememberSettings === true,
    trackingAdvertising: value?.trackingAdvertising === true
  };
}

export function allowsTrackingAdvertising(value) {
  const consent = normalizePrivacyConsent(value);
  return consent.decided && consent.trackingAdvertising;
}

export function readPrivacyConsent(storage = browserStorage()) {
  if (!storage) {
    return { ...DEFAULT_PRIVACY_CONSENT };
  }

  try {
    return normalizePrivacyConsent(JSON.parse(storage.getItem(PRIVACY_CONSENT_STORAGE_KEY) ?? 'null'));
  } catch {
    return { ...DEFAULT_PRIVACY_CONSENT };
  }
}

export function writePrivacyConsent(value, storage = browserStorage()) {
  const consent = normalizePrivacyConsent(value);

  try {
    storage?.setItem(PRIVACY_CONSENT_STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // The choice still applies to the current page when storage is unavailable.
  }

  return consent;
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
