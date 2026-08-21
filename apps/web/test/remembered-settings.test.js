import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_REMOTE_CONTROL_PERMISSIONS } from '../src/ftms.js';

import {
  BLE_SCAN_DISPLAY_ALL_STORAGE_KEY,
  BLE_SCAN_SERVICES_STORAGE_KEY,
  METRIC_SELECTION_STORAGE_KEY,
  METRIC_SOURCE_DISABLED_STORAGE_KEY,
  REMOTE_CONTROL_STORAGE_KEY,
  REMOTE_CONTROL_TARGET_STORAGE_KEY,
  REMEMBERED_SETTING_STORAGE_KEYS,
  clearRememberedSettings,
  createDefaultDiscoveryServiceSelection,
  readDisabledMetricSources,
  readDiscoveryServiceSelection,
  readDisplayAllDevices,
  readMetricSelections,
  readRemoteControlPermissions,
  readRemoteControlTarget,
  selectedDiscoveryServiceIds,
  selectedDiscoveryServiceKeys,
  writeRememberedSetting
} from '../src/remembered-settings.js';

const services = [
  { key: 'fitnessMachine', service: 'fitness-machine' },
  { key: 'cyclingPower', service: 'cycling-power' },
  { key: 'heartRate', service: 'heart-rate' }
];

test('creates and resolves GATT Service selections in configured order', () => {
  assert.deepEqual(createDefaultDiscoveryServiceSelection(services), {
    fitnessMachine: true,
    cyclingPower: true,
    heartRate: true
  });

  const selection = { fitnessMachine: false, cyclingPower: true };
  assert.deepEqual(selectedDiscoveryServiceKeys(selection, services), ['cyclingPower', 'heartRate']);
  assert.deepEqual(selectedDiscoveryServiceIds(selection, services), ['cycling-power', 'heart-rate']);
});

test('sanitizes persisted metric source preferences and disabled sources', () => {
  const storage = memoryStorage({
    [METRIC_SELECTION_STORAGE_KEY]: JSON.stringify({
      powerW: 'trainer::cycling_power',
      heartBpm: '',
      unsupported: 'device::unknown'
    }),
    [METRIC_SOURCE_DISABLED_STORAGE_KEY]: JSON.stringify({
      'trainer::ftms.indoor_bike': true,
      'trainer::cycling_power': false,
      '': true
    })
  });

  assert.deepEqual(readMetricSelections(['powerW', 'heartBpm'], storage), {
    powerW: 'trainer::cycling_power'
  });
  assert.deepEqual(readDisabledMetricSources(storage), {
    'trainer::ftms.indoor_bike': true
  });
});

test('sanitizes persisted GATT Service and display-all selections', () => {
  const storage = memoryStorage({
    [BLE_SCAN_SERVICES_STORAGE_KEY]: JSON.stringify(['heartRate', 'unknown', 42]),
    [BLE_SCAN_DISPLAY_ALL_STORAGE_KEY]: JSON.stringify(true)
  });

  assert.deepEqual(readDiscoveryServiceSelection(services, storage), {
    fitnessMachine: false,
    cyclingPower: false,
    heartRate: true
  });
  assert.equal(readDisplayAllDevices(storage), true);

  storage.setItem(BLE_SCAN_DISPLAY_ALL_STORAGE_KEY, JSON.stringify('true'));
  assert.equal(readDisplayAllDevices(storage), false);
});

test('falls back safely when remembered settings are unavailable or malformed', () => {
  const invalidStorage = {
    getItem() {
      throw new Error('storage blocked');
    }
  };

  assert.deepEqual(readMetricSelections(['powerW'], invalidStorage), {});
  assert.deepEqual(readDisabledMetricSources(invalidStorage), {});
  assert.deepEqual(readDiscoveryServiceSelection(services, invalidStorage), {
    fitnessMachine: true,
    cyclingPower: true,
    heartRate: true
  });
  assert.equal(readDisplayAllDevices(invalidStorage), false);
});

test('normalizes remembered remote-control permissions', () => {
  const storage = memoryStorage({
    [REMOTE_CONTROL_STORAGE_KEY]: JSON.stringify({
      enabled: true,
      grade: false,
      resistance: 'yes',
      unsupported: true
    })
  });

  assert.deepEqual(readRemoteControlPermissions(undefined, storage), {
    ...DEFAULT_REMOTE_CONTROL_PERMISSIONS,
    enabled: true,
    grade: false
  });

  storage.setItem(REMOTE_CONTROL_STORAGE_KEY, '{invalid');
  assert.deepEqual(readRemoteControlPermissions(undefined, storage), {
    ...DEFAULT_REMOTE_CONTROL_PERMISSIONS
  });
});

test('sanitizes the remembered remote-control target', () => {
  const storage = memoryStorage({
    [REMOTE_CONTROL_TARGET_STORAGE_KEY]: JSON.stringify('trainer-001::ftms')
  });

  assert.equal(readRemoteControlTarget(storage), 'trainer-001::ftms');
  storage.setItem(REMOTE_CONTROL_TARGET_STORAGE_KEY, JSON.stringify({ id: 'invalid' }));
  assert.equal(readRemoteControlTarget(storage), '');
});

test('writes settings and clears only BLE Bridge remembered-setting keys', () => {
  const storage = memoryStorage({ unrelated: 'keep-me' });

  writeRememberedSetting(METRIC_SELECTION_STORAGE_KEY, { powerW: 'trainer::cycling_power' }, storage);
  assert.deepEqual(JSON.parse(storage.getItem(METRIC_SELECTION_STORAGE_KEY)), {
    powerW: 'trainer::cycling_power'
  });

  for (const key of REMEMBERED_SETTING_STORAGE_KEYS) {
    storage.setItem(key, storage.getItem(key) || 'value');
  }
  clearRememberedSettings(storage);

  assert.equal(storage.getItem('unrelated'), 'keep-me');
  for (const key of REMEMBERED_SETTING_STORAGE_KEYS) {
    assert.equal(storage.getItem(key), null);
  }
});

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, String(value));
    }
  };
}
