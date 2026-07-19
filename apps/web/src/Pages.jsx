import { Bluetooth, Gamepad2, RadioTower, Settings2, ShieldCheck } from 'lucide-react';

import { useI18n } from './i18n.js';
import { LEGAL_CONTENT } from './legal-content.js';

export function InformationPage({ page }) {
  if (page === 'about') {
    return <AboutPage />;
  }

  if (page === 'privacy' || page === 'imprint') {
    return <LegalPage type={page} />;
  }

  return null;
}

function AboutPage() {
  const { t } = useI18n();
  const steps = [
    ['connect', Bluetooth],
    ['normalize', Settings2],
    ['relay', RadioTower],
    ['control', Gamepad2]
  ];

  return (
    <section className="content-page" aria-labelledby="about-title">
      <div className="content-hero">
        <span className="eyebrow">BLE Bridge</span>
        <h2 id="about-title">{t('about.title')}</h2>
        <p>{t('about.lead')}</p>
      </div>

      <h3 className="section-heading">{t('about.howTitle')}</h3>
      <div className="about-grid">
        {steps.map(([key, Icon]) => (
          <article className="about-card" key={key}>
            <div className="about-icon"><Icon size={22} /></div>
            <h4>{t(`about.${key}Title`)}</h4>
            <p>{t(`about.${key}Text`)}</p>
          </article>
        ))}
      </div>

      <div className="about-notes">
        <article>
          <ShieldCheck size={22} />
          <div>
            <h3>{t('about.privacyTitle')}</h3>
            <p>{t('about.privacyText')}</p>
          </div>
        </article>
        <article>
          <Settings2 size={22} />
          <div>
            <h3>{t('about.pluginsTitle')}</h3>
            <p>{t('about.pluginsText')}</p>
          </div>
        </article>
      </div>
    </section>
  );
}

function LegalPage({ type }) {
  const { language, t } = useI18n();
  const title = t(`legal.${type}Title`);
  const html = LEGAL_CONTENT[type]?.[language] || LEGAL_CONTENT[type]?.en || '';

  return (
    <section className="content-page legal-page" aria-labelledby={`${type}-title`}>
      <div className="content-hero compact">
        <h2 id={`${type}-title`}>{title}</h2>
      </div>
      <div className="legal-copy" dangerouslySetInnerHTML={{ __html: html }} />
    </section>
  );
}
