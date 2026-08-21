import { installBluetoothMock, installWebSocketMock } from './mocks.js';

const ACCEPTED_CONSENT = {
  decided: true,
  rememberSettings: true,
  trackingAdvertising: false
};

Cypress.Commands.add('visitBridge', (options = {}) => {
  const consent = Object.hasOwn(options, 'consent') ? options.consent : ACCEPTED_CONSENT;
  const language = options.language || 'en';

  return cy.visit(options.path || '/', {
    onBeforeLoad(win) {
      win.localStorage.setItem('ble-bridge-language-v1', language);
      if (consent) {
        win.localStorage.setItem('ble-bridge.privacyConsent.v1', JSON.stringify(consent));
      } else {
        win.localStorage.removeItem('ble-bridge.privacyConsent.v1');
      }

      installWebSocketMock(win);
      installBluetoothMock(win, options.bluetoothDevice);
      Object.defineProperty(win.navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText(value) {
            win.__clipboardText = value;
            return Promise.resolve();
          }
        }
      });
    }
  });
});
