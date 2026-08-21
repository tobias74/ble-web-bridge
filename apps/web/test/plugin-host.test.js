import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyPluginCommand,
  attachProtocolPlugins,
  getPluginCapabilities
} from '../src/plugin-host.js';

function createPlugin(overrides = {}) {
  const manifest = {
    apiVersion: 1,
    id: 'example.profile',
    label: 'Example profile',
    discoveryServices: [{ key: 'example', label: 'Example', service: 'example-service' }],
    protocols: [{ id: 'example.telemetry', label: 'Example telemetry' }],
    handledCommandTypes: ['example.calibrate'],
    commands: [{
      type: 'example.calibrate',
      permissionKey: 'calibrate',
      capability: 'canCalibrate'
    }]
  };

  return {
    manifest,
    async attach({ emitTelemetry }) {
      emitTelemetry({ protocol: 'example.telemetry', values: { powerW: 200 } });
      return {
        getCapabilities: () => ({ canCalibrate: true }),
        async applyCommand(command) {
          return { commandId: command.commandId, type: command.type, status: 'applied' };
        }
      };
    },
    ...overrides
  };
}

test('plugin host stamps normalized telemetry with host device identity', async () => {
  const telemetry = [];
  const connections = await attachProtocolPlugins({
    plugins: [createPlugin()],
    gattServer: {},
    selectedServices: ['example-service'],
    device: {},
    deviceId: 'dev_1',
    deviceKey: 'physical_1',
    deviceName: 'Example Device',
    deviceInfo: { batteryPct: 90 },
    onTelemetry: (payload) => telemetry.push(payload)
  });

  assert.equal(connections.length, 1);
  assert.equal(telemetry[0].sourceId, 'dev_1:example.telemetry');
  assert.equal(telemetry[0].deviceKey, 'physical_1');
  assert.equal(telemetry[0].values.powerW, 200);
  assert.equal(telemetry[0].info.batteryPct, 90);
  assert.deepEqual(getPluginCapabilities(connections), { canCalibrate: true });
});

test('plugin host isolates attachment errors', async () => {
  const errors = [];
  const connections = await attachProtocolPlugins({
    plugins: [createPlugin({ attach: async () => { throw new Error('attach_failed'); } })],
    gattServer: {},
    selectedServices: ['example-service'],
    onPluginError: (id, error) => errors.push([id, error.message])
  });

  assert.deepEqual(connections, []);
  assert.deepEqual(errors, [['example.profile', 'attach_failed']]);
});

test('plugin commands require permission and capability', async () => {
  const plugin = createPlugin();
  const entry = {
    plugin,
    connection: await plugin.attach({ emitTelemetry() {} })
  };
  const command = { commandId: 'cmd_1', type: 'example.calibrate' };

  assert.equal((await applyPluginCommand(entry, command, {
    remoteControlPermissions: { enabled: false, calibrate: true }
  })).reason, 'permission_disabled');

  assert.equal((await applyPluginCommand(entry, command, {
    remoteControlPermissions: { enabled: true, calibrate: true }
  })).status, 'applied');
});
