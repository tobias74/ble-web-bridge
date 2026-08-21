import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONNECTION_SESSION_STORAGE_KEY,
  clearStoredConnectionSession,
  readStoredConnectionSession,
  writeStoredConnectionSession
} from '../src/session-storage.js';

const SESSION = {
  code: 'SOLAROTTER-482193',
  bridgeWsUrl: 'wss://bridge.example/v1/sessions/SOLAROTTER-482193/bridge'
};
const LOCATION = { origin: 'https://bridge.example' };

test('stores only the browser-owned code and rebuilds its same-origin websocket URL', () => {
  const storage = memoryStorage();

  assert.equal(writeStoredConnectionSession(SESSION, storage), true);
  assert.deepEqual(readStoredConnectionSession(storage, LOCATION), {
    code: SESSION.code,
    bridgeWsUrl: SESSION.bridgeWsUrl
  });
  assert.deepEqual(JSON.parse(storage.getItem(CONNECTION_SESSION_STORAGE_KEY)), {
    code: SESSION.code
  });
});

test('rejects and removes malformed or legacy short remembered codes', () => {
  const storage = memoryStorage({
    [CONNECTION_SESSION_STORAGE_KEY]: JSON.stringify({ code: 'FLOW-4821' })
  });

  assert.equal(readStoredConnectionSession(storage, LOCATION), null);
  assert.equal(storage.getItem(CONNECTION_SESSION_STORAGE_KEY), null);

  storage.setItem(CONNECTION_SESSION_STORAGE_KEY, JSON.stringify({
    code: '../../not-a-code'
  }));
  assert.equal(readStoredConnectionSession(storage, LOCATION), null);
});

test('clears a remembered connection session explicitly', () => {
  const storage = memoryStorage({
    [CONNECTION_SESSION_STORAGE_KEY]: JSON.stringify(SESSION)
  });

  clearStoredConnectionSession(storage);
  assert.equal(storage.getItem(CONNECTION_SESSION_STORAGE_KEY), null);
});

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}
