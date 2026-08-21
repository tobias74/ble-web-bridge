describe('privacy, language, and navigation', () => {
  it('collects optional consent without presenting required storage as a choice', () => {
    cy.visitBridge({ consent: null });

    cy.get('[role="dialog"]').should('be.visible').within(() => {
      cy.contains('h2', 'Cookie settings').should('be.visible');
      cy.get('.cookie-consent-required').should('contain', 'Necessary browser storage');
      cy.get('.cookie-consent-required input').should('not.exist');
      cy.get('input[type="checkbox"]').should('have.length', 2);

      cy.contains('label', 'Remember app settings').find('input').check();
      cy.contains('label', 'Tracking and advertising').find('input').check();

      cy.get('.cookie-consent-actions button').then(($buttons) => {
        const boxes = [...$buttons].map((button) => button.getBoundingClientRect());
        expect(new Set(boxes.map((box) => Math.round(box.top))).size).to.equal(1);
        expect(new Set(boxes.map((box) => Math.round(box.height))).size).to.equal(1);
      });

      cy.contains('button', 'Save selection').click();
    });

    cy.get('[role="dialog"]').should('not.exist');
    cy.window().then((win) => {
      expect(JSON.parse(win.localStorage.getItem('ble-bridge.privacyConsent.v1'))).to.deep.equal({
        decided: true,
        rememberSettings: true,
        trackingAdvertising: true
      });
    });

    cy.contains('nav button', 'Cookies').click();
    cy.get('[role="dialog"]').should('be.visible');
    cy.contains('[role="dialog"] button', 'Cancel').click();
    cy.get('[role="dialog"]').should('not.exist');
  });

  it('switches language, persists it, and keeps a permanent page scrollbar', () => {
    cy.visitBridge();

    cy.get('select[aria-label="Language"]').select('de');
    cy.get('html').should('have.attr', 'lang', 'de');
    cy.contains('nav a', 'Über das Projekt').should('be.visible');
    cy.window().its('localStorage').invoke('getItem', 'ble-bridge-language-v1').should('equal', 'de');

    cy.reload();
    cy.get('select[aria-label="Sprache"]').should('have.value', 'de');
    cy.document().then((document) => {
      expect(getComputedStyle(document.documentElement).overflowY).to.equal('scroll');
    });
  });

  it('navigates through the public information pages', () => {
    cy.visitBridge();

    cy.get('a.github-ribbon')
      .should('be.visible')
      .and('have.attr', 'href', 'https://github.com/tobias74/ble-web-bridge')
      .and('have.attr', 'target', '_blank');

    cy.get('.app-nav a.active').should(($active) => {
      const style = getComputedStyle($active[0]);
      expect(style.backgroundColor).to.equal('rgb(232, 236, 234)');
      expect(style.color).to.equal('rgb(48, 54, 51)');
    });

    cy.contains('nav a', 'About').click();
    cy.hash().should('equal', '#about');
    cy.get('#about-title').should('contain', 'About');
    cy.get('.system-bar').should('contain', 'Transmission').and('be.visible');

    cy.contains('nav a', 'Privacy').click();
    cy.hash().should('equal', '#privacy');
    cy.get('#privacy-title').should('contain', 'Privacy');
    cy.get('.system-bar').should('contain', 'BLE connection').and('be.visible');

    cy.contains('nav a', 'Imprint').click();
    cy.hash().should('equal', '#imprint');
    cy.get('#imprint-title').should('contain', 'Imprint');
    cy.get('.system-bar').should('be.visible');

    cy.contains('a.brand-link', 'BLE Bridge').click();
    cy.hash().should('equal', '#bridge');
    cy.get('.device-workflow-panel').should('be.visible');
    cy.get('.session-panel').should('not.exist');
  });
});
