import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONNECTION_CODE_KEYSPACE,
  createConnectionCode,
  createConnectionSession,
  isValidConnectionCode,
  restoreConnectionSession
} from '../src/connection-session.js';

test('creates a readable connection code with about 31 bits of key space', () => {
  const values = [0, 29, 482193];
  const code = createConnectionCode(() => values.shift());

  assert.equal(code, 'AMBERMAPLE-482193');
  assert.equal(isValidConnectionCode(code), true);
  assert.equal(CONNECTION_CODE_KEYSPACE, 2_048_000_000);
});

test('does not generate the retired potentially loaded words', () => {
  for (let prefix = 0; prefix < 32; prefix += 1) {
    for (let suffix = 0; suffix < 64; suffix += 1) {
      const values = [prefix, suffix, 0];
      const code = createConnectionCode(() => values.shift());

      assert.doesNotMatch(code, /NOBLE|HAWK|EAGLE/);
    }
  }
});

test('builds the same-origin websocket URL without a separate token', () => {
  const values = [30, 34, 7];
  const session = createConnectionSession({
    location: { origin: 'https://dev.blebridge.com' },
    randomInt: () => values.shift()
  });

  assert.equal(session.code, 'SOLAROTTER-000007');
  assert.equal(
    session.bridgeWsUrl,
    'wss://dev.blebridge.com/v1/sessions/SOLAROTTER-000007/bridge'
  );
});

test('restores normalized valid codes and rejects legacy short codes', () => {
  assert.deepEqual(
    restoreConnectionSession(' solarotter-482193 ', { origin: 'http://localhost:4173' }),
    {
      code: 'SOLAROTTER-482193',
      bridgeWsUrl: 'ws://localhost:4173/v1/sessions/SOLAROTTER-482193/bridge'
    }
  );
  assert.equal(restoreConnectionSession('FLOW-4821', { origin: 'http://localhost:4173' }), null);
  assert.equal(restoreConnectionSession('NOBLEHAWK-482193', { origin: 'http://localhost:4173' }), null);
  assert.equal(restoreConnectionSession('PRIMEEAGLE-482193', { origin: 'http://localhost:4173' }), null);
});
