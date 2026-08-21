describe('relay sessions', () => {
  it('waits for a BLE device, then creates and streams a session, pauses, resumes, and regenerates it', () => {
    let originalCode;
    cy.visitBridge();

    cy.get('.bridge-status').should('contain', 'No session');
    cy.get('.system-bar .session-code').should('contain', '---- ----');
    cy.get('button[aria-label="Regenerate session"]').should('be.disabled');
    cy.window().then((win) => {
      expect(bridgeSockets(win)).to.have.length(0);
    });

    connectDevice();

    cy.get('.system-bar .session-code span').invoke('text').should('match', /^[A-Z]{6,24}-\d{6}$/);
    cy.get('.bridge-status').should('contain', 'Streaming');
    cy.get('.system-bar').should('contain', 'Bluetooth connection');
    cy.get('.session-panel').should('not.exist');
    cy.contains('button', 'Start session').should('not.exist');
    cy.get('.session-code-value > span').should('have.css', 'text-align', 'center');
    cy.get('.session-code button[aria-label="Regenerate session"]').should('not.contain.text', 'Regenerate session');
    cy.get('.session-code > .system-status-heading').then(($label) => {
      cy.get('.session-code-value > span').then(($code) => {
        expect($label[0].getBoundingClientRect().bottom).to.be.at.most($code[0].getBoundingClientRect().top);
        expect($code[0].scrollWidth).to.be.at.most($code[0].clientWidth);
      });
    });
    cy.get('.system-bar > :not(.system-notices) > .system-status-heading').then(($headings) => {
      const headingTops = [...$headings].map((heading) => heading.getBoundingClientRect().top);
      headingTops.slice(1).forEach((top) => expect(top).to.be.closeTo(headingTops[0], 1));
    });
    cy.get('.session-code-value > span').then(($code) => {
      cy.get('.session-code-tools').then(($tools) => {
        expect($tools[0].getBoundingClientRect().height).to.be.closeTo($code[0].getBoundingClientRect().height, 1);
      });
    });
    cy.get('.system-bar > *').then(($groups) => {
      const widths = [...$groups].map((group) => group.getBoundingClientRect().width);
      expect(widths[1]).to.be.closeTo(widths[0], 1);
      expect(widths[2]).to.be.closeTo(widths[0], 1);
    });
    cy.get('.system-bar').then(($bar) => {
      const heightBeforeNotice = $bar[0].getBoundingClientRect().height;
      cy.window().then((win) => {
        win.__webSocketMock.latest().emitMessage({ type: 'error', error: 'rate_limited' });
      });
      cy.get('.system-notices')
        .should('have.css', 'position', 'fixed')
        .and('contain', 'A telemetry update was briefly throttled. Transmission continues automatically.');
      cy.get('.system-bar').then(($barAfterNotice) => {
        expect($barAfterNotice[0].getBoundingClientRect().height).to.be.closeTo(heightBeforeNotice, 1);
      });
      cy.get('button[aria-label="Dismiss notice"]').click();
      cy.get('.system-notices').should('not.exist');
    });
    cy.viewport(375, 812);
    cy.get('.session-code-value > span').then(($code) => {
      expect($code[0].scrollWidth).to.be.at.most($code[0].clientWidth);
    });
    cy.get('.system-bar .session-code span').invoke('text').then((code) => {
      cy.get('button[aria-label="Copy code"]').click();
      cy.window().its('__clipboardText').should('equal', code);
    });

    cy.wait(300);
    cy.window().then((win) => {
      const messages = win.__webSocketMock.latest().sent.map((payload) => JSON.parse(payload));
      expect(messages.some((message) => message.schemaVersion === 2 && message.sources)).to.equal(true);
      win.__messageCountBeforePause = messages.length;
    });

    cy.contains('button', 'Pause').click();
    cy.get('.bridge-status').should('contain', 'Transmission paused');
    cy.wait(100);
    cy.window().then((win) => {
      win.__messageCountWhilePaused = win.__webSocketMock.latest().sent.length;
    });
    cy.wait(350);
    cy.window().then((win) => {
      expect(win.__webSocketMock.latest().sent).to.have.length(win.__messageCountWhilePaused);
    });

    cy.contains('button', 'Resume').click();
    cy.get('.bridge-status').should('contain', 'Streaming');
    cy.wait(300);
    cy.window().then((win) => {
      expect(win.__webSocketMock.latest().sent.length).to.be.greaterThan(win.__messageCountWhilePaused);
    });

    cy.window().then((win) => {
      cy.stub(win, 'confirm').returns(false).as('confirmRegeneration');
    });
    cy.get('button[aria-label="Regenerate session"]')
      .should('have.attr', 'title', 'Generate a new code and disconnect the current target application')
      .click();
    cy.get('@confirmRegeneration').should('have.been.calledWith', 'Generate a new session code? This will disconnect the currently connected target application.');
    cy.get('.system-bar .session-code span').invoke('text').then((code) => {
      originalCode = code;
    });

    cy.get('@confirmRegeneration').invoke('returns', true);
    cy.get('button[aria-label="Regenerate session"]').click();
    cy.get('.system-bar .session-code span').should(($code) => {
      expect($code.text()).not.to.equal(originalCode);
    });
    cy.get('.bridge-status').should('contain', 'Streaming');
  });

  it('restores the active connection code after a page reload', () => {
    let connectionCode;
    cy.visitBridge();
    connectDevice();
    cy.get('.system-bar .session-code span').invoke('text').then((code) => {
      connectionCode = code;
    });

    cy.window().then((win) => {
      const remembered = JSON.parse(win.localStorage.getItem('ble-bridge.connection-code.v2'));
      expect(remembered.code).to.match(/^[A-Z]{6,24}-\d{6}$/);
      expect(Object.keys(remembered)).to.deep.equal(['code']);
    });

    cy.visitBridge();
    cy.then(() => {
      cy.get('.system-bar .session-code span').should('have.text', connectionCode);
    });
    cy.get('.bridge-status').should('contain', 'Idle');
    cy.get('.system-transmission-button').should('be.disabled');
    cy.get('button[aria-label="Regenerate session"]').should('be.enabled');
    cy.window().then((win) => {
      expect(bridgeSockets(win)).to.have.length(0);
    });

    connectDevice();
    cy.get('.bridge-status').should('contain', 'Streaming');
    cy.window().then((win) => {
      expect(bridgeSockets(win)).to.have.length(1);
    });
  });

  it('retains the browser-owned code when the server drops the runtime channel', () => {
    cy.visitBridge();
    connectDevice();
    cy.get('.system-bar .session-code span').invoke('text').as('connectionCode');

    cy.window().then((win) => {
      win.__webSocketMock.latest().close(1012, 'server restarted');
    });
    cy.get('.bridge-status').should('contain', 'Reconnecting');
    cy.wait(1600);
    cy.window().then((win) => {
      expect(bridgeSockets(win)).to.have.length(2);
      expect(bridgeSockets(win).at(-1).url).not.to.contain('token=');
    });
    cy.get('@connectionCode').then((connectionCode) => {
      cy.get('.system-bar .session-code span').should('have.text', connectionCode);
      cy.window().then((win) => {
        expect(win.__webSocketMock.latest().url).to.contain(encodeURIComponent(connectionCode));
        expect(JSON.parse(win.localStorage.getItem('ble-bridge.connection-code.v2')).code)
          .to.equal(connectionCode);
      });
    });
    cy.get('.bridge-status').should('contain', 'Streaming');
  });
});

function connectDevice() {
  cy.contains('button', 'Connect Bluetooth device').click();
  cy.contains('button', 'Scan for Bluetooth devices').click();
  cy.get('.device-connection-state').should('contain', 'Bluetooth device connected');
}

function bridgeSockets(win) {
  return win.__webSocketMock.sockets.filter((socket) => socket.url.includes('/v1/sessions/'));
}
