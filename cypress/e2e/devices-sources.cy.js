describe('GATT devices, telemetry sources, and remote control', () => {
  it('builds the Bluetooth request from the selected GATT Services', () => {
    cy.visitBridge();

    cy.window().then((win) => {
      expect(bridgeSockets(win)).to.have.length(0);
    });
    cy.get('.device-workflow-panel')
      .should('contain', 'Connect device')
      .and('not.contain', 'No BLE devices connected')
      .and('not.contain', 'Assign measurements')
      .and('not.contain', 'Devices & measurements');
    cy.get('.step-index').should('not.exist');
    cy.get('#device-connect-title').should('not.exist');
    assertPositionStableInteraction('.device-connect-button');
    cy.get('.app-nav a.active').then(($activeNavigation) => {
      cy.get('.device-connect-button').then(($connectButton) => {
        expect(getComputedStyle($connectButton[0]).backgroundColor).not.to.equal(
          getComputedStyle($activeNavigation[0]).backgroundColor
        );
      });
    });
    cy.get('.device-connection-state').then(($state) => {
      cy.get('.device-connect-button').then(($button) => {
        const state = $state[0].getBoundingClientRect();
        const button = $button[0].getBoundingClientRect();
        expect(button.width).to.be.at.most(280);
        expect(button.left + button.width / 2).to.be.closeTo(state.left + state.width / 2, 1);
        expect(button.right).to.be.at.most(state.right);
      });
    });
    cy.get('.scan-group-title').should('not.exist');
    cy.get('.system-bar').then(($systemBar) => {
      cy.get('.device-workflow-panel').then(($devices) => {
        expect($devices[0].getBoundingClientRect().top).to.be.greaterThan(
          $systemBar[0].getBoundingClientRect().bottom
        );
      });
    });
    cy.get('.session-panel').should('not.exist');
    cy.get('.scan-service-list').should('not.exist');
    cy.contains('button', 'Connect device').click();
    cy.get('[role="dialog"]').should('contain', 'GATT Services');
    cy.get('.scan-service-toggle').then(($services) => {
      const first = $services[0].getBoundingClientRect();
      const second = $services[1].getBoundingClientRect();
      expect(Math.round(second.left)).to.equal(Math.round(first.left));
      expect(second.top).to.be.greaterThan(first.top);
    });

    cy.get('.scan-service-list input').uncheck();
    cy.contains('button', 'Scan').should('be.disabled');
    cy.get('[data-service-key="cyclingPower"] input').check();
    cy.contains('label', 'Scan all devices').find('input').check();
    cy.contains('button', 'Scan').click();
    cy.get('[role="dialog"]').should('not.exist');

    cy.get('.device-connection-state').should('contain', 'BLE device connected');
    cy.get('#metric-routing-title').should('contain', 'Assign measurements');
    cy.contains('button', 'Disconnect device').should('be.visible');
    cy.window().then((win) => {
      const [options] = win.__bleMock.requests;
      expect(options.acceptAllDevices).to.equal(true);
      expect(options.filters).to.equal(undefined);
      expect(options.optionalServices).to.include('00001818-0000-1000-8000-00805f9b34fb');
    });
  });

  it('selects, persists, and disconnects metric sources', () => {
    cy.visitBridge();
    cy.contains('button', 'Connect device').click();
    cy.contains('button', 'Scan').click();
    cy.get('.device-connection-state').should('contain', 'BLE device connected');
    cy.get('.bridge-status').should('contain', 'Streaming');

    emitMeasurements();

    cy.get('[data-metric-key="powerW"]').should('contain', '210 W');
    cy.get('[data-metric-key="heartBpm"]').should('contain', '153 bpm');
    cy.get('.selection-panel').should('not.exist');
    cy.get('.metrics').should('not.exist');
    cy.get('.source-details').should('not.exist');
    cy.get('.metric-routing-card').then(($cards) => {
      const first = $cards[0].getBoundingClientRect();
      const second = $cards[1].getBoundingClientRect();
      expect(Math.round(second.left)).to.equal(Math.round(first.left));
      expect(second.width).to.be.closeTo(first.width, 1);
      expect(second.top - first.bottom).to.be.at.least(12);
    });

    cy.get('[data-metric-key="powerW"]').within(() => {
      cy.get('select option').should('have.length', 3);
      cy.get('select').should('contain', 'Automatic');
      cy.get('select').should('contain', 'Do not use this value');
      cy.get('select').select('trainer-001::cycling_power');
      cy.get('.metric-live-value').should('contain', '225 W');
    });

    cy.get('[data-metric-key="powerW"]').within(() => {
      cy.get('select').select('__disabled__');
      cy.get('.metric-live-value').should('contain', '—');
    });
    cy.wait(350);
    cy.window().then((win) => {
      const socket = bridgeSockets(win).at(-1);
      const telemetry = socket.sent.map((payload) => JSON.parse(payload)).at(-1);
      expect(telemetry.selected).not.to.have.property('powerW');
      expect(JSON.parse(win.localStorage.getItem('ble-bridge-metric-selections-v1'))).to.include({
        powerW: '__disabled__'
      });
    });
    cy.get('[data-metric-key="powerW"] select').select('trainer-001::cycling_power');

    emitCyclingCadence();
    cy.get('[data-metric-key="cadenceRpm"]').within(() => {
      cy.get('select').select('trainer-001::cycling_power');
      cy.get('.metric-live-value').should('contain', '120 rpm');
    });
    emitRepeatedCyclingCrankEvent();
    cy.get('[data-metric-key="cadenceRpm"] .metric-live-value').should('contain', '120 rpm');

    cy.window().then((win) => {
      expect(JSON.parse(win.localStorage.getItem('ble-bridge-metric-selections-v1'))).to.deep.equal({
        powerW: 'trainer-001::cycling_power',
        cadenceRpm: 'trainer-001::cycling_power'
      });
    });

    cy.window().then((win) => {
      win.__socketBeforeDeviceDisconnect = win.__webSocketMock.latest();
      expect(win.__socketBeforeDeviceDisconnect.readyState).to.equal(win.WebSocket.OPEN);
    });

    cy.contains('button', 'Disconnect device').click();
    cy.get('.device-connection-state').should('not.contain', 'No BLE devices connected');
    cy.contains('button', 'Connect device').should('be.visible');
    cy.get('#metric-routing-title').should('not.exist');
    cy.get('.bridge-status').should('contain', 'Idle');
    cy.get('.system-transmission-button').should('be.disabled');
    cy.window().then((win) => {
      expect(win.__socketBeforeDeviceDisconnect.readyState).to.equal(win.WebSocket.CLOSED);
      expect(bridgeSockets(win)).to.have.length(1);
    });
  });

  it('blocks commands without consent and applies them after remote control is enabled', () => {
    cy.visitBridge();
    cy.get('.commands-panel').should('not.exist');
    cy.contains('button', 'Connect device').click();
    cy.contains('button', 'Scan').click();
    cy.get('.bridge-status').should('contain', 'Streaming');
    cy.get('.device-connection-state').should('contain', 'BLE device connected');

    cy.get('.measurement-column').then(($metrics) => {
      cy.get('.remote-control-panel').then(($remoteControl) => {
        const metricsRect = $metrics[0].getBoundingClientRect();
        const remoteRect = $remoteControl[0].getBoundingClientRect();
        expect(remoteRect.left).to.be.greaterThan(metricsRect.right);
        expect(Math.abs(remoteRect.top - metricsRect.top)).to.be.lessThan(2);
      });
    });
    cy.get('.remote-control-panel').should('contain', 'Enable trainer control');
    cy.get('.control-target select')
      .should('have.value', 'trainer-001::ftms')
      .find('option')
      .should('have.length', 1)
      .and('contain', 'Test Trainer · Fitness Machine Service (FTMS)');
    cy.window().should((win) => {
      expect(JSON.parse(win.localStorage.getItem('ble-bridge-remote-control-target-v1')))
        .to.equal('trainer-001::ftms');
    });
    cy.get('.remote-control-panel').then(($panel) => {
      const panel = $panel[0];
      const panelRect = panel.getBoundingClientRect();
      const copyRect = panel.querySelector('.remote-control-copy').getBoundingClientRect();
      const targetRect = panel.querySelector('.control-target').getBoundingClientRect();
      const masterRect = panel.querySelector('.master-toggle').getBoundingClientRect();
      const toggles = [...panel.querySelectorAll('.control-grid .sub-toggle')]
        .map((toggle) => toggle.getBoundingClientRect());

      expect(Math.abs(masterRect.top - copyRect.top)).to.be.lessThan(2);
      expect(targetRect.top).to.be.at.least(copyRect.bottom);
      expect(masterRect.width).to.be.lessThan(panelRect.width / 2);
      toggles.forEach((toggle, index) => {
        const previousBottom = index === 0 ? targetRect.bottom : toggles[index - 1].bottom;
        expect(toggle.top).to.be.at.least(previousBottom);
      });
    });
    cy.get('.remote-control-panel .sub-toggle input')
      .should('be.disabled');

    emitCommand('blocked-command', 3.5);
    cy.get('.commands-panel').should('be.visible');
    cy.contains('.command-row', 'bike.grade').should('contain', 'blocked: permission_disabled');
    cy.get('.warning-line').should('contain', 'permission disabled');

    cy.contains('label', 'Enable trainer control').find('input').check();
    cy.get('.remote-control-panel .sub-toggle input')
      .should('not.be.disabled');
    cy.contains('.sub-toggle', 'Indoor bike simulation (grade and wind)')
      .find('input')
      .should('be.checked');
    emitCommand('applied-command', 4.5);
    cy.contains('.command-row', '4.5 %').should('contain', 'applied');
    cy.contains('.sub-toggle', 'Indoor bike simulation (grade and wind)')
      .should('contain', 'Last received: 4.5 %')
      .and('contain', 'applied');

    cy.window().then((win) => {
      const writes = win.__bleMock.characteristics.controlPoint.writes;
      expect(writes.map((bytes) => bytes[0])).to.deep.equal([0x00, 0x07, 0x11]);
    });

    cy.contains('label', 'Enable trainer control').find('input').uncheck();
    cy.get('.remote-control-panel .sub-toggle input').should('be.disabled');
    cy.contains('.sub-toggle', 'Indoor bike simulation (grade and wind)')
      .find('input')
      .should('be.checked');
  });
});

function assertPositionStableInteraction(selector) {
  cy.get(selector).then(($button) => {
    const button = $button[0];
    const initialRect = button.getBoundingClientRect();
    const transitionProperties = getComputedStyle(button).transitionProperty.split(',').map((value) => value.trim());
    const movingInteractionRules = [];

    for (const sheet of button.ownerDocument.styleSheets) {
      collectMovingInteractionRules(sheet.cssRules, button, movingInteractionRules);
    }

    expect(transitionProperties, 'animated button properties').not.to.include('transform');
    expect(movingInteractionRules, 'hover or active rules that move the connect button').to.deep.equal([]);

    const { MouseEvent } = button.ownerDocument.defaultView;
    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    const interactionRect = button.getBoundingClientRect();
    expect(interactionRect.x).to.equal(initialRect.x);
    expect(interactionRect.y).to.equal(initialRect.y);
    expect(interactionRect.width).to.equal(initialRect.width);
    expect(interactionRect.height).to.equal(initialRect.height);
  });
}

function bridgeSockets(win) {
  return win.__webSocketMock.sockets.filter((socket) => socket.url.includes('/v1/sessions/'));
}

function collectMovingInteractionRules(rules, button, matches) {
  for (const rule of rules) {
    if (rule.cssRules) {
      collectMovingInteractionRules(rule.cssRules, button, matches);
      continue;
    }

    if (!rule.selectorText || !rule.style?.transform || rule.style.transform === 'none') {
      continue;
    }

    for (const selector of rule.selectorText.split(',')) {
      if (!selector.includes(':hover') && !selector.includes(':active')) {
        continue;
      }

      const restingSelector = selector.replaceAll(':hover', '').replaceAll(':active', '').trim();
      if (button.matches(restingSelector)) {
        matches.push(`${selector.trim()} { transform: ${rule.style.transform} }`);
      }
    }
  }
}

function emitMeasurements() {
  cy.window().then((win) => {
    win.__bleMock.emit('ftms.indoor_bike', [
      0x44, 0x00,
      0x10, 0x0e,
      0xb4, 0x00,
      0xd2, 0x00
    ]);
    win.__bleMock.emit('cycling_power', [0x00, 0x00, 0xe1, 0x00]);
    win.__bleMock.emit('heart_rate', [0x00, 0x99]);
  });
}

function emitCyclingCadence() {
  cy.window().then((win) => {
    win.__bleMock.emit('cycling_power', [
      0x20, 0x00,
      0xfa, 0x00,
      0xe8, 0x03,
      0xe8, 0x03
    ]);
    win.__bleMock.emit('cycling_power', [
      0x20, 0x00,
      0x04, 0x01,
      0xea, 0x03,
      0xe8, 0x07
    ]);
  });
}

function emitRepeatedCyclingCrankEvent() {
  cy.window().then((win) => {
    win.__bleMock.emit('cycling_power', [
      0x20, 0x00,
      0x04, 0x01,
      0xea, 0x03,
      0xe8, 0x07
    ]);
  });
}

function emitCommand(commandId, gradePct) {
  cy.window().then((win) => {
    win.__webSocketMock.latest().emitMessage({
      type: 'command',
      command: {
        commandId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 5000,
        gradePct,
        type: 'bike.grade'
      }
    });
  });
}
