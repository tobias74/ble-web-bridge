import { useEffect, useRef, useState } from 'react';

import { useI18n } from './i18n.js';
import { pageHref } from './navigation.js';

export function PrivacyConsentDialog({
  isVisible,
  onAcceptAll,
  onAcceptSelected,
  onCancel,
  onDeclineAll,
  selectedRememberSettings,
  selectedTrackingAdvertising
}) {
  const { t } = useI18n();
  const [rememberSettings, setRememberSettings] = useState(selectedRememberSettings);
  const [trackingAdvertising, setTrackingAdvertising] = useState(selectedTrackingAdvertising);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isVisible) {
      return undefined;
    }

    setRememberSettings(selectedRememberSettings);
    setTrackingAdvertising(selectedTrackingAdvertising);
    const previousOverflow = globalThis.document?.body?.style?.overflow;
    globalThis.document?.body?.style?.setProperty('overflow', 'hidden');
    dialogRef.current?.focus();

    return () => {
      if (globalThis.document?.body?.style) {
        globalThis.document.body.style.overflow = previousOverflow || '';
      }
    };
  }, [isVisible, selectedRememberSettings, selectedTrackingAdvertising]);

  if (!isVisible) {
    return null;
  }

  return (
    <div className="cookie-consent-backdrop" role="presentation">
      <section
        aria-describedby="cookie-consent-description"
        aria-labelledby="cookie-consent-title"
        aria-modal="true"
        className="cookie-consent-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex="-1"
      >
        <div className="cookie-consent-header">
          <p className="eyebrow">{t('consent.eyebrow')}</p>
          <h2 id="cookie-consent-title">{t('consent.title')}</h2>
          <p id="cookie-consent-description">{t('consent.description')}</p>
        </div>

        <p className="cookie-consent-required">
          <strong>{t('consent.requiredTitle')}</strong>
          <span>{t('consent.requiredDescription')}</span>
        </p>

        <div className="cookie-consent-options">
          <label className="cookie-consent-option">
            <input
              checked={rememberSettings}
              onChange={(event) => setRememberSettings(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>{t('consent.settingsTitle')}</strong>
              <small>{t('consent.settingsDescription')}</small>
            </span>
          </label>
          <label className="cookie-consent-option">
            <input
              checked={trackingAdvertising}
              onChange={(event) => setTrackingAdvertising(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>{t('consent.trackingTitle')}</strong>
              <small>{t('consent.trackingDescription')}</small>
            </span>
          </label>
        </div>

        <div className="cookie-consent-links">
          <a href={pageHref('privacy')} rel="noopener noreferrer" target="_blank">
            {t('nav.privacy')}
          </a>
        </div>

        <div className="cookie-consent-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            {t('consent.cancel')}
          </button>
          <button className="secondary-button" onClick={onDeclineAll} type="button">
            {t('consent.declineAll')}
          </button>
          <button
            className="secondary-button"
            onClick={() => onAcceptSelected({ rememberSettings, trackingAdvertising })}
            type="button"
          >
            {t('consent.acceptSelected')}
          </button>
          <button className="primary-button" onClick={onAcceptAll} type="button">
            {t('consent.acceptAll')}
          </button>
        </div>
      </section>
    </div>
  );
}
