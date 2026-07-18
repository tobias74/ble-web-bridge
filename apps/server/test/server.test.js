import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { WebSocket } from 'ws';

import { buildDemoPowerReading, createApp, loadPluginCommandSchemas } from '../src/app.js';

test('loads extension command schemas from a generated plugin manifest and fails closed', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'ble-plugin-manifest-'));
  const validPath = join(dir, 'valid.json');
  const invalidPath = join(dir, 'invalid.json');
  t.after(() => rm(dir, { recursive: true, force: true }));

  await writeFile(validPath, JSON.stringify({
    apiVersion: 1,
    plugins: [{
      id: 'example.profile',
      commands: [{
        type: 'example.calibrate',
        fields: { level: { type: 'integer', required: true, min: 0, max: 10 } }
      }]
    }]
  }));
  await writeFile(invalidPath, '{not-json');

  assert.equal(loadPluginCommandSchemas(validPath)[0].type, 'example.calibrate');
  assert.deepEqual(loadPluginCommandSchemas(invalidPath), []);
  assert.deepEqual(loadPluginCommandSchemas(join(dir, 'missing.json')), []);
});

test('creates a session with bridge connection details', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);

  const response = await fetch(`${baseUrl}/v1/sessions`, { method: 'POST' });
  assert.equal(response.status, 200);

  const body = await response.json();
  assert.match(body.code, /^[A-Z]+-\d{4}$/);
  assert.equal(typeof body.bridgeToken, 'string');
  assert.equal(typeof body.expiresAt, 'number');
  assert.match(body.bridgeWsUrl, /^ws:\/\/127\.0\.0\.1:/);
});

test('returns 404 for an unknown session', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);

  const response = await fetch(`${baseUrl}/v1/sessions/NOPE-0000/latest`);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'session_not_found' });
});

test('serves built web app and keeps API routes as JSON', async (t) => {
  const webDistDir = await createStaticWebDist(t);
  const { baseUrl, close } = await startTestServer({ webDistDir });
  t.after(close);

  const root = await fetch(`${baseUrl}/`);
  assert.equal(root.status, 200);
  assert.match(root.headers.get('content-type') || '', /text\/html/);
  assert.match(await root.text(), /BLE Bridge Test Shell/);

  const asset = await fetch(`${baseUrl}/assets/app.js`);
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), 'console.log("ok");');

  const nestedRoute = await fetch(`${baseUrl}/devices/settings`);
  assert.equal(nestedRoute.status, 200);
  assert.match(await nestedRoute.text(), /BLE Bridge Test Shell/);

  const health = await fetch(`${baseUrl}/v1/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, 'ble-bridge');

  const missingApi = await fetch(`${baseUrl}/v1/not-found`);
  assert.equal(missingApi.status, 404);
  assert.deepEqual(await missingApi.json(), { error: 'not_found' });
});

test('returns a smooth demo power reading', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);

  const response = await fetch(`${baseUrl}/v1/demo/power`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), [
    'code',
    'schemaVersion',
    'connected',
    'stale',
    'ageMs',
    'expiresAt',
    'lastBridgeSeenAt',
    'power'
  ]);
  assert.equal(body.code, 'DEMO-POWER');
  assert.equal(body.schemaVersion, 2);
  assert.equal(body.connected, true);
  assert.equal(body.stale, false);
  assert.equal(body.ageMs, 0);
  assert.equal(typeof body.expiresAt, 'number');
  assert.equal(typeof body.lastBridgeSeenAt, 'number');
  assert.equal(Number.isInteger(body.power), true);
  assert.equal(body.power >= 130 && body.power <= 170, true);
  assert.equal(body.selected, undefined);
  assert.equal(body.sources, undefined);
});

test('demo power is time-based and bounded', () => {
  assert.equal(buildDemoPowerReading(0).power, 150);
  assert.equal(buildDemoPowerReading(15_000).power, 170);
  assert.equal(buildDemoPowerReading(30_000).power, 150);
  assert.equal(buildDemoPowerReading(45_000).power, 130);
  assert.equal(buildDemoPowerReading(60_000).power, 150);
});

test('rejects bridge websocket with an invalid token', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);
  const session = await createSession(baseUrl);

  const ws = new WebSocket(`${baseUrl.replace('http:', 'ws:')}/v1/sessions/${session.code}/bridge?token=bad`);
  const closeEvent = await waitForClose(ws);
  assert.equal(closeEvent.code, 1008);
});

test('updates latest telemetry after a valid websocket message', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);
  const session = await createSession(baseUrl);
  const ws = new WebSocket(session.bridgeWsUrl);
  t.after(() => ws.close());

  await waitForReady(ws);

  ws.send(JSON.stringify(telemetryEnvelope({
    'dev_1:ftms.indoor_bike': sourceTelemetry('ftms.indoor_bike', {
      cadenceRpm: 82,
      powerW: 144,
      speedMps: 6.8
    })
  })));
  await waitForMessage(ws);

  const response = await fetch(`${baseUrl}/v1/sessions/${session.code}/latest`);
  assert.equal(response.status, 200);
  const latest = await response.json();
  assert.equal(latest.connected, true);
  assert.equal(latest.stale, false);
  assert.equal(latest.schemaVersion, 2);
  assert.equal(latest.powerW, undefined);
  const source = latest.sources['dev_1:ftms.indoor_bike'];
  assert.equal(source.protocol, 'ftms.indoor_bike');
  assert.equal(source.connected, true);
  assert.equal(source.stale, false);
  assert.equal(source.values.cadenceRpm, 82);
  assert.equal(source.values.powerW, 144);
  assert.equal(source.values.speedMps, 6.8);
});

test('stores selected metrics alongside source telemetry', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);
  const session = await createSession(baseUrl);
  const ws = new WebSocket(session.bridgeWsUrl);
  t.after(() => ws.close());

  await waitForReady(ws);

  ws.send(JSON.stringify(telemetryEnvelope({
    'dev_1:example.telemetry': sourceTelemetry('example.telemetry', {
      powerW: 211
    }, {
      sourceId: 'dev_1:example.telemetry'
    }),
    'dev_2:cycling_power': sourceTelemetry('cycling_power', {
      powerW: 235
    }, {
      deviceId: 'dev_2',
      sourceId: 'dev_2:cycling_power'
    })
  }, Date.now(), {
    powerW: {
      sourceId: 'dev_2:cycling_power',
      value: 999
    },
    cadenceRpm: {
      sourceId: 'dev_2:cycling_power',
      value: 90
    }
  })));
  await waitForMessage(ws);

  const response = await fetch(`${baseUrl}/v1/sessions/${session.code}/latest`);
  assert.equal(response.status, 200);
  const latest = await response.json();
  assert.equal(latest.selected.powerW.sourceId, 'dev_2:cycling_power');
  assert.equal(latest.selected.powerW.protocol, 'cycling_power');
  assert.equal(latest.selected.powerW.value, 235);
  assert.equal(latest.selected.powerW.connected, true);
  assert.equal(latest.selected.cadenceRpm, undefined);
});

test('rejects legacy flat websocket telemetry', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);
  const session = await createSession(baseUrl);
  const ws = new WebSocket(session.bridgeWsUrl);
  t.after(() => ws.close());

  await waitForReady(ws);

  ws.send(JSON.stringify({
    connected: true,
    deviceType: 'indoor_bike',
    powerW: 144,
    timestampMs: Date.now()
  }));

  const message = JSON.parse(await waitForMessage(ws));
  assert.equal(message.error, 'invalid_telemetry');
});

test('rejects command for an unknown session', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);

  const response = await postJson(`${baseUrl}/v1/sessions/NOPE-0000/commands`, {
    type: 'bike.grade',
    gradePct: 5
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'session_not_found' });
});

test('rejects command when bridge websocket is not connected', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);
  const session = await createSession(baseUrl);

  const response = await postJson(`${baseUrl}/v1/sessions/${session.code}/commands`, {
    type: 'bike.grade',
    gradePct: 5
  });

  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: 'bridge_not_connected' });
});

test('sends bike command over bridge websocket and returns sent immediately', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);
  const session = await createSession(baseUrl);
  const ws = new WebSocket(session.bridgeWsUrl);
  t.after(() => ws.close());

  await waitForReady(ws);

  ws.send(JSON.stringify(telemetryEnvelope({
    'dev_1:ftms.indoor_bike': sourceTelemetry('ftms.indoor_bike', {
      powerW: 144
    })
  })));
  await waitForMessage(ws);

  const commandMessagePromise = waitForMessage(ws);
  const commandResponsePromise = postJson(`${baseUrl}/v1/sessions/${session.code}/commands`, {
    type: 'bike.grade',
    gradePct: 4.5,
    ttlMs: 3000
  });

  const commandResponse = await commandResponsePromise;
  assert.equal(commandResponse.status, 200);
  const commandBody = await commandResponse.json();
  assert.match(commandBody.commandId, /^cmd_/);
  assert.equal(commandBody.type, 'bike.grade');
  assert.equal(commandBody.status, 'sent');

  const commandMessage = JSON.parse(await commandMessagePromise);
  assert.equal(commandMessage.type, 'command');
  assert.equal(commandMessage.command.type, 'bike.grade');
  assert.equal(commandMessage.command.gradePct, 4.5);
  assert.equal(commandMessage.command.commandId, commandBody.commandId);

  const latestResponse = await fetch(`${baseUrl}/v1/sessions/${session.code}/latest`);
  const latest = await latestResponse.json();
  assert.equal(latest.sources['dev_1:ftms.indoor_bike'].values.powerW, 144);
});

test('routes treadmill command and returns sent immediately', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);
  const session = await createSession(baseUrl);
  const ws = new WebSocket(session.bridgeWsUrl);
  t.after(() => ws.close());

  await waitForReady(ws);

  const commandMessagePromise = waitForMessage(ws);
  const responsePromise = postJson(`${baseUrl}/v1/sessions/${session.code}/commands`, {
    type: 'treadmill.speed',
    speedMps: 3
  });
  const response = await responsePromise;
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.commandId, /^cmd_/);
  assert.equal(body.type, 'treadmill.speed');
  assert.equal(body.status, 'sent');

  const commandMessage = JSON.parse(await commandMessagePromise);
  assert.equal(commandMessage.command.type, 'treadmill.speed');
  assert.equal(commandMessage.command.commandId, body.commandId);
});

test('rate limits commands', async (t) => {
  const { baseUrl, close } = await startTestServer({ maxCommandsPerSecond: 2 });
  t.after(close);
  const session = await createSession(baseUrl);
  const ws = new WebSocket(session.bridgeWsUrl);
  t.after(() => ws.close());

  await waitForReady(ws);

  await postCommandAndDrain(baseUrl, session.code, ws, { type: 'bike.grade', gradePct: 1 });
  await postCommandAndDrain(baseUrl, session.code, ws, { type: 'bike.grade', gradePct: 2 });

  const response = await postJson(`${baseUrl}/v1/sessions/${session.code}/commands`, {
    type: 'bike.grade',
    gradePct: 3
  });
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: 'command_rate_limited' });
});

test('clamps bike command values before dispatch', async (t) => {
  const { baseUrl, close } = await startTestServer();
  t.after(close);
  const session = await createSession(baseUrl);
  const ws = new WebSocket(session.bridgeWsUrl);
  t.after(() => ws.close());

  await waitForReady(ws);

  const gradeMessagePromise = waitForMessage(ws);
  const gradeResponsePromise = postJson(`${baseUrl}/v1/sessions/${session.code}/commands`, {
    type: 'bike.grade',
    gradePct: 99
  });
  const gradeResponse = await gradeResponsePromise;
  assert.equal(gradeResponse.status, 200);
  assert.equal((await gradeResponse.json()).status, 'sent');
  const gradeMessage = JSON.parse(await gradeMessagePromise);
  assert.equal(gradeMessage.command.gradePct, 20);
  assert.equal(gradeMessage.command.rollingResistanceCoefficient, 0.004);

  const resistanceMessagePromise = waitForMessage(ws);
  const resistanceResponsePromise = postJson(`${baseUrl}/v1/sessions/${session.code}/commands`, {
    type: 'bike.resistance',
    resistanceLevel: -10
  });
  const resistanceResponse = await resistanceResponsePromise;
  assert.equal(resistanceResponse.status, 200);
  assert.equal((await resistanceResponse.json()).status, 'sent');
  const resistanceMessage = JSON.parse(await resistanceMessagePromise);
  assert.equal(resistanceMessage.command.resistanceLevel, 0);
});

test('accepts and clamps commands declared by a build-time plugin', async (t) => {
  const { baseUrl, close } = await startTestServer({
    maxCommandsPerSecond: 20,
    pluginCommandSchemas: [{
      type: 'example.calibrate',
      fields: {
        level: { type: 'integer', required: true, min: 0, max: 10 },
        enabled: { type: 'boolean', required: true }
      }
    }]
  });
  t.after(close);
  const session = await createSession(baseUrl);
  const ws = new WebSocket(session.bridgeWsUrl);
  t.after(() => ws.close());

  await waitForReady(ws);

  const targetPower = await postCommandAndRead(baseUrl, session.code, ws, {
    type: 'bike.targetPower',
    targetPowerW: 9999
  });
  assert.equal(targetPower.type, 'bike.targetPower');
  assert.equal(targetPower.targetPowerW, 4000);

  const extension = await postCommandAndRead(baseUrl, session.code, ws, {
    type: 'example.calibrate',
    level: 99,
    enabled: true,
    ignored: 'not declared'
  });
  assert.equal(extension.type, 'example.calibrate');
  assert.equal(extension.level, 10);
  assert.equal(extension.enabled, true);
  assert.equal(extension.ignored, undefined);
});

test('rejects malformed extended command payloads', async (t) => {
  const { baseUrl, close } = await startTestServer({
    pluginCommandSchemas: [{
      type: 'example.calibrate',
      fields: {
        level: { type: 'integer', required: true, min: 0, max: 10 },
        enabled: { type: 'boolean', required: true }
      }
    }]
  });
  t.after(close);

  const missingTargetPower = await postJson(`${baseUrl}/v1/sessions/NOPE-0000/commands`, {
    type: 'bike.targetPower'
  });
  assert.equal(missingTargetPower.status, 400);
  assert.deepEqual(await missingTargetPower.json(), {
    error: 'invalid_command',
    reason: 'targetPowerW_required'
  });

  const missingField = await postJson(`${baseUrl}/v1/sessions/NOPE-0000/commands`, {
    type: 'example.calibrate',
    enabled: true
  });
  assert.equal(missingField.status, 400);
  assert.deepEqual(await missingField.json(), {
    error: 'invalid_command',
    reason: 'level_required'
  });

  const invalidBoolean = await postJson(`${baseUrl}/v1/sessions/NOPE-0000/commands`, {
    type: 'example.calibrate',
    level: 5,
    enabled: 'yes'
  });
  assert.equal(invalidBoolean.status, 400);
  assert.deepEqual(await invalidBoolean.json(), {
    error: 'invalid_command',
    reason: 'enabled_invalid'
  });
});

test('returns latest telemetry for multiple sessions in one batch', async (t) => {
  const { app, baseUrl, close } = await startTestServer();
  t.after(close);
  const bike = await createSession(baseUrl);
  const treadmill = await createSession(baseUrl);

  app.sessionStore.updateTelemetry(bike.code, bike.bridgeToken, telemetryEnvelope({
    'dev_1:ftms.indoor_bike': sourceTelemetry('ftms.indoor_bike', {
      cadenceRpm: 91,
      powerW: 201
    })
  }));

  app.sessionStore.updateTelemetry(treadmill.code, treadmill.bridgeToken, telemetryEnvelope({
    'dev_1:ftms.treadmill': sourceTelemetry('ftms.treadmill', {
      speedMps: 3.2,
      inclinePct: 4
    }, {
      sourceId: 'dev_1:ftms.treadmill'
    })
  }));

  const response = await fetch(`${baseUrl}/v1/sessions/latest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      codes: [
        bike.code.toLowerCase(),
        treadmill.code,
        'NOPE-0000',
        bike.code
      ]
    })
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.now, 'number');
  assert.deepEqual(Object.keys(body.sessions).sort(), [bike.code, 'NOPE-0000', treadmill.code].sort());
  assert.equal(body.sessions[bike.code].schemaVersion, 2);
  assert.equal(body.sessions[bike.code].sources['dev_1:ftms.indoor_bike'].values.cadenceRpm, 91);
  assert.equal(body.sessions[treadmill.code].sources['dev_1:ftms.treadmill'].values.inclinePct, 4);
  assert.deepEqual(body.sessions['NOPE-0000'], {
    code: 'NOPE-0000',
    error: 'session_not_found'
  });
});

test('validates batch latest request bodies', async (t) => {
  const { baseUrl, close } = await startTestServer({ maxBatchCodes: 2 });
  t.after(close);

  const missingCodes = await fetch(`${baseUrl}/v1/sessions/latest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.equal(missingCodes.status, 400);
  assert.deepEqual(await missingCodes.json(), {
    error: 'codes_must_be_array',
    maxCodes: 2
  });

  const badCodes = await fetch(`${baseUrl}/v1/sessions/latest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ codes: ['BLUE-0001', 42] })
  });
  assert.equal(badCodes.status, 400);
  assert.deepEqual(await badCodes.json(), {
    error: 'codes_must_be_strings',
    maxCodes: 2
  });

  const tooManyCodes = await fetch(`${baseUrl}/v1/sessions/latest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ codes: ['BLUE-0001', 'RIDE-0002', 'FLOW-0003'] })
  });
  assert.equal(tooManyCodes.status, 400);
  assert.deepEqual(await tooManyCodes.json(), {
    error: 'too_many_codes',
    maxCodes: 2
  });
});

test('marks telemetry stale after the stale window', async (t) => {
  const { baseUrl, close } = await startTestServer({ staleMs: 30, idleTtlMs: 5000 });
  t.after(close);
  const session = await createSession(baseUrl);
  const ws = new WebSocket(session.bridgeWsUrl);
  t.after(() => ws.close());

  await waitForReady(ws);
  ws.send(JSON.stringify(telemetryEnvelope({
    'dev_1:cycling_speed_cadence': sourceTelemetry('cycling_speed_cadence', {
      cadenceRpm: 60
    }, {
      sourceId: 'dev_1:cycling_speed_cadence'
    })
  })));
  await waitForMessage(ws);
  await sleep(50);

  const response = await fetch(`${baseUrl}/v1/sessions/${session.code}/latest`);
  assert.equal(response.status, 200);
  const latest = await response.json();
  assert.equal(latest.connected, false);
  assert.equal(latest.stale, true);
  assert.equal(latest.sources['dev_1:cycling_speed_cadence'].connected, false);
  assert.equal(latest.sources['dev_1:cycling_speed_cadence'].stale, true);
});

test('removes expired idle sessions', async (t) => {
  const { baseUrl, close } = await startTestServer({
    sessionTtlMs: 10_000,
    idleTtlMs: 25,
    cleanupIntervalMs: 0
  });
  t.after(close);
  const session = await createSession(baseUrl);

  await sleep(40);
  const response = await fetch(`${baseUrl}/v1/sessions/${session.code}/latest`);
  assert.equal(response.status, 404);
});

test('rejects oversized websocket payloads', async (t) => {
  const { close, baseUrl } = await startTestServer({ maxPayloadBytes: 64 });
  t.after(close);
  const session = await createSession(baseUrl);
  const ws = new WebSocket(session.bridgeWsUrl);
  t.after(() => ws.close());

  await waitForReady(ws);
  ws.send(JSON.stringify(telemetryEnvelope({
    'dev_1:heart_rate': sourceTelemetry('heart_rate', {
      heartBpm: 153
    }, {
      raw: { value: 'x'.repeat(200) },
      sourceId: 'dev_1:heart_rate'
    })
  })));

  const message = JSON.parse(await waitForMessage(ws));
  assert.equal(message.error, 'payload_too_large');
});

test('rate limits telemetry updates', async (t) => {
  const { close, baseUrl } = await startTestServer({ maxTelemetryPerSecond: 2 });
  t.after(close);
  const session = await createSession(baseUrl);
  const ws = new WebSocket(session.bridgeWsUrl);
  t.after(() => ws.close());

  await waitForReady(ws);

  ws.send(JSON.stringify(telemetryEnvelope({
    'dev_1:cycling_speed_cadence': sourceTelemetry('cycling_speed_cadence', { cadenceRpm: 1 }, { sourceId: 'dev_1:cycling_speed_cadence' })
  })));
  await waitForMessage(ws);
  ws.send(JSON.stringify(telemetryEnvelope({
    'dev_1:cycling_speed_cadence': sourceTelemetry('cycling_speed_cadence', { cadenceRpm: 2 }, { sourceId: 'dev_1:cycling_speed_cadence' })
  })));
  await waitForMessage(ws);
  ws.send(JSON.stringify(telemetryEnvelope({
    'dev_1:cycling_speed_cadence': sourceTelemetry('cycling_speed_cadence', { cadenceRpm: 3 }, { sourceId: 'dev_1:cycling_speed_cadence' })
  })));

  const message = JSON.parse(await waitForMessage(ws));
  assert.equal(message.error, 'rate_limited');
});

async function startTestServer(options = {}) {
  const app = createApp({
    logger: false,
    cleanupIntervalMs: 0,
    webDistDir: '',
    ...options
  });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    app,
    baseUrl,
    close: () => app.close()
  };
}

async function createStaticWebDist(t) {
  const dir = await mkdtemp(join(tmpdir(), 'ble-bridge-web-'));
  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, 'index.html'), '<!doctype html><html><body>BLE Bridge Test Shell</body></html>');
  await writeFile(join(dir, 'assets', 'app.js'), 'console.log("ok");');
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function createSession(baseUrl) {
  const response = await fetch(`${baseUrl}/v1/sessions`, { method: 'POST' });
  assert.equal(response.status, 200);
  return response.json();
}

function postJson(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function telemetryEnvelope(sources, timestampMs = Date.now(), selected = {}) {
  return {
    schemaVersion: 2,
    timestampMs,
    selected,
    sources
  };
}

function sourceTelemetry(protocol, values = {}, options = {}) {
  const sourceId = options.sourceId || `dev_1:${protocol}`;
  return {
    sourceId,
    deviceId: options.deviceId || 'dev_1',
    deviceName: options.deviceName || 'Test Device',
    protocol,
    connected: options.connected ?? true,
    timestampMs: options.timestampMs || Date.now(),
    values,
    info: options.info || {},
    raw: options.raw || {}
  };
}

async function postCommandAndDrain(baseUrl, code, ws, command) {
  const commandMessagePromise = waitForMessage(ws);
  const response = await postJson(`${baseUrl}/v1/sessions/${code}/commands`, command);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'sent');
  await commandMessagePromise;
}

async function postCommandAndRead(baseUrl, code, ws, command) {
  const commandMessagePromise = waitForMessage(ws);
  const response = await postJson(`${baseUrl}/v1/sessions/${code}/commands`, command);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'sent');
  return JSON.parse(await commandMessagePromise).command;
}

function waitForOpen(ws) {
  if (ws.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}

async function waitForReady(ws) {
  const messagePromise = waitForMessage(ws);
  await waitForOpen(ws);
  return messagePromise;
}

function waitForClose(ws) {
  return new Promise((resolve) => {
    ws.addEventListener('close', resolve, { once: true });
  });
}

function waitForMessage(ws) {
  return new Promise((resolve, reject) => {
    ws.addEventListener('message', (event) => resolve(event.data), { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
