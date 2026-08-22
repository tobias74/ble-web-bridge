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
    cy.get('.system-bar').should('contain', 'Bluetooth connection').and('be.visible');
    cy.contains('h4', 'Transmission of device and training data through BLE Bridge').should('be.visible');
    cy.contains('p', 'After the Bluetooth connection succeeds').should('exist');
    cy.contains('p', 'It acts as an access key').should('exist');
    cy.contains('h4', 'Data protection provisions about the application and use of Google Analytics (with anonymization function)')
      .should('exist');
    cy.get('.legal-copy h4').then(($headings) => {
      const headings = [...$headings].map((heading) => heading.textContent.trim());
      expect(headings.indexOf('Transmission of device and training data through BLE Bridge'))
        .to.be.lessThan(headings.indexOf('Privacy Policy'));
    });

    cy.contains('nav a', 'Imprint').click();
    cy.hash().should('equal', '#imprint');
    cy.get('#imprint-title').should('contain', 'Imprint');
    cy.get('.system-bar').should('be.visible');

    cy.contains('a.brand-link', 'BLE Bridge').click();
    cy.hash().should('equal', '#bridge');
    cy.get('.device-workflow-panel').should('be.visible');
    cy.get('.session-panel').should('not.exist');
  });

  it('keeps a compact mobile connection indicator and shows full controls only on the connection page', () => {
    cy.viewport(375, 812);
    cy.visitBridge();

    cy.get('.desktop-layout').should('not.exist');
    cy.get('.mobile-app').should('be.visible');
    cy.get('.mobile-appbar').should('contain', 'BLE Bridge');
    cy.get('.mobile-appbar-connection')
      .should('be.visible')
      .and('contain', 'No device')
      .and('have.attr', 'href', '#bridge');
    cy.get('.mobile-appbar').should('not.contain', 'Connection code');
    cy.get('.mobile-appbar-menu')
      .should('be.visible')
      .and('have.attr', 'aria-expanded', 'false')
      .and('have.attr', 'aria-label', 'Open menu');
    cy.get('.mobile-navigation').should('not.exist');

    cy.get('.mobile-appbar-menu').click().should('have.attr', 'aria-expanded', 'true');
    cy.get('.mobile-navigation-overlay').should('be.visible').and('have.css', 'position', 'fixed');
    cy.get('.mobile-navigation').should('be.visible').and('have.attr', 'aria-modal', 'true');
    cy.get('.mobile-navigation-list').children().should('have.length', 5).then(($items) => {
      const boxes = [...$items].map((item) => item.getBoundingClientRect());
      boxes.slice(1).forEach((box, index) => {
        expect(box.left).to.be.closeTo(boxes[0].left, 1);
        expect(box.width).to.be.closeTo(boxes[0].width, 1);
        expect(box.top).to.be.greaterThan(boxes[index].top);
      });
    });
    cy.get('.mobile-navigation-list a.active').should('contain', 'Connection');
    cy.get('body').type('{esc}');
    cy.get('.mobile-navigation').should('not.exist');

    cy.get('.mobile-status-dock').should('not.exist');
    cy.get('.mobile-connection-panel')
      .should('be.visible')
      .and('have.css', 'position', 'static')
      .and('contain', 'Bluetooth connection')
      .and('contain', 'Transmission')
      .and('contain', 'Waiting for Bluetooth device');
    cy.get('.mobile-connection-transmission-action').should('not.exist');
    cy.contains('button', 'Connect Bluetooth device').then(($connect) => {
      cy.get('.mobile-connection-panel').then(($status) => {
        expect($connect[0].getBoundingClientRect().bottom)
          .to.be.at.most($status[0].getBoundingClientRect().top);
      });
    });
    cy.get('.workspace').then(($workspace) => {
      cy.get('.mobile-connection-panel').then(($status) => {
        expect($status[0].getBoundingClientRect().top - $workspace[0].getBoundingClientRect().bottom)
          .to.be.at.least(14);
      });
    });
    cy.get('.mobile-connection-code').should('be.visible');
    cy.get('[data-testid="session-code-value"]')
      .should('be.visible')
      .and('have.text', '---- ----')
      .then(($code) => {
        expect($code[0].scrollWidth).to.be.at.most($code[0].clientWidth);
      });
    cy.get('.mobile-connection-code button[aria-label="Copy code"]').should('be.visible');
    cy.get('button[aria-label="Regenerate session"]').should('be.visible');
    cy.get('.mobile-connection-code').within(() => {
      cy.get('button[aria-label="Regenerate session"]').then(($regenerate) => {
        cy.get('[data-testid="session-code-value"]').then(($code) => {
          cy.get('button[aria-label="Copy code"]').then(($copy) => {
            expect($regenerate[0].getBoundingClientRect().right)
              .to.be.at.most($code[0].getBoundingClientRect().left);
            expect($code[0].getBoundingClientRect().right)
              .to.be.at.most($copy[0].getBoundingClientRect().left);
          });
        });
      });
    });

    cy.contains('button', 'Connect Bluetooth device').click();
    cy.get('.device-connect-dialog').should('be.visible').then(($dialog) => {
      const box = $dialog[0].getBoundingClientRect();
      cy.window().then((window) => {
        expect(box.top + (box.height / 2)).to.be.closeTo(window.innerHeight / 2, 2);
      });
    });
    cy.contains('button', 'Scan for Bluetooth devices').click();
    cy.get('[data-testid="session-code-value"]')
      .should('be.visible')
      .invoke('text')
      .should('match', /^[A-Z]{6,24}-\d{6}$/);
    cy.get('[data-testid="session-code-value"]').then(($code) => {
      expect($code[0].scrollWidth).to.be.at.most($code[0].clientWidth);
    });
    cy.get('.mobile-appbar-connection').should('contain', 'Connected');
    cy.get('.mobile-connection-transmission-action')
      .should('be.visible')
      .and('contain', 'Pause transmission');
    cy.get('[data-testid="session-code-value"]').invoke('text').then((code) => {
      cy.get('.mobile-connection-code button[aria-label="Copy code"]').click();
      cy.window().its('__clipboardText').should('equal', code);
    });
    cy.get('.mobile-copy-toast')
      .should('be.visible')
      .and('have.css', 'position', 'fixed')
      .and('contain', 'Connection code copied');

    cy.get('.mobile-appbar-menu').click();
    cy.contains('.mobile-navigation-list a', 'About').click();
    cy.hash().should('equal', '#about');
    cy.get('.mobile-connection-panel').should('not.exist');
    cy.get('[data-testid="session-code-value"]').should('not.exist');
    cy.get('.mobile-appbar-connection').should('be.visible').and('contain', 'Connected').click();
    cy.hash().should('equal', '#bridge');
    cy.get('.mobile-connection-panel').should('be.visible');

    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.equal(document.documentElement.clientWidth);
    });
  });

  it('keeps long German legal content inside a narrow mobile viewport', () => {
    cy.viewport(320, 720);
    cy.visitBridge({ language: 'de', path: '/#privacy' });

    cy.get('#privacy-title')
      .should('be.visible')
      .and('contain', 'Datenschutzerklärung')
      .then(($title) => {
        cy.get('.legal-page').then(($page) => {
          const titleBox = $title[0].getBoundingClientRect();
          const pageBox = $page[0].getBoundingClientRect();
          expect(titleBox.left).to.be.at.least(pageBox.left);
          expect(titleBox.right).to.be.at.most(pageBox.right);
        });
      });

    cy.document().then((document) => {
      expect(document.documentElement.scrollWidth).to.equal(document.documentElement.clientWidth);
    });
  });
});
