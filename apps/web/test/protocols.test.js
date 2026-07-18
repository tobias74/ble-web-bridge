import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BLE_DISCOVERY_SERVICES,
  DEFAULT_REMOTE_CONTROL_PERMISSIONS,
  applyBleCommand,
  buildBluetoothRequestOptions,
  evaluateBleCommand,
  parseBatteryLevel,
  parseCrossTrainerData,
  parseCyclingPowerMeasurement,
  parseCyclingSpeedCadenceMeasurement,
  parseDeviceInfoString,
  parseHeartRateMeasurement,
  parseRowerData,
  parseRunningSpeedCadenceMeasurement,
  parseStairClimberData,
  parseStepClimberData,
  serializeBikeGradeCommand,
  serializeBikeResistanceCommand
} from '../src/ftms.js';

test('parses cycling power and derives cadence from crank revolution deltas', () => {
  const state = {};

  parseCyclingPowerMeasurement(view([
    0x20, 0x00,
    0xfa, 0x00,
    0xe8, 0x03,
    0xe8, 0x03
  ]), state);

  const telemetry = parseCyclingPowerMeasurement(view([
    0x20, 0x00,
    0x04, 0x01,
    0xea, 0x03,
    0xe8, 0x07
  ]), state);

  assert.equal(telemetry.values.powerW, 260);
  assert.equal(telemetry.values.cadenceRpm, 120);
  assert.equal(telemetry.raw.cumulativeCrankRevolutions, 1002);
});

test('builds Web Bluetooth request options for default, custom, and unfiltered scans', () => {
  const pluginService = '12345678-1234-5678-1234-56789abcdef0';
  const plugins = [{
    manifest: {
      discoveryServices: [{ key: 'example', label: 'Example', service: pluginService }]
    }
  }];
  const cyclingPowerService = BLE_DISCOVERY_SERVICES.find((service) => service.key === 'cyclingPower').service;
  const heartRateService = BLE_DISCOVERY_SERVICES.find((service) => service.key === 'heartRate').service;
  const defaultOptions = buildBluetoothRequestOptions();
  assert.equal(defaultOptions.filters.length, BLE_DISCOVERY_SERVICES.length);
  assert.equal(defaultOptions.filters[0].services[0], BLE_DISCOVERY_SERVICES[0].service);
  assert(defaultOptions.optionalServices.includes(BLE_DISCOVERY_SERVICES[0].service));

  const customOptions = buildBluetoothRequestOptions({
    services: [
      cyclingPowerService,
      heartRateService
    ],
    plugins
  });
  assert.deepEqual(customOptions.filters.map((filter) => filter.services[0]), [
    cyclingPowerService,
    heartRateService
  ]);
  assert(customOptions.optionalServices.includes(cyclingPowerService));
  assert(customOptions.optionalServices.includes(pluginService));

  const allDevicesOptions = buildBluetoothRequestOptions({
    acceptAllDevices: true,
    services: [cyclingPowerService],
    plugins
  });
  assert.equal(allDevicesOptions.acceptAllDevices, true);
  assert.equal(Object.hasOwn(allDevicesOptions, 'filters'), false);
  assert(allDevicesOptions.optionalServices.includes(cyclingPowerService));
  assert(allDevicesOptions.optionalServices.includes(pluginService));
});

test('parses cycling speed/cadence crank data', () => {
  const state = {};

  parseCyclingSpeedCadenceMeasurement(view([
    0x02,
    0x0a, 0x00,
    0xe8, 0x03
  ]), state);

  const telemetry = parseCyclingSpeedCadenceMeasurement(view([
    0x02,
    0x0c, 0x00,
    0xe8, 0x07
  ]), state);

  assert.equal(telemetry.values.cadenceRpm, 120);
  assert.equal(telemetry.raw.cumulativeCrankRevolutions, 12);
});

test('parses heart rate measurement', () => {
  const telemetry = parseHeartRateMeasurement(view([0x00, 0x99]));

  assert.equal(telemetry.values.heartBpm, 153);
});

test('parses running speed and cadence measurement', () => {
  const telemetry = parseRunningSpeedCadenceMeasurement(view([
    0x07,
    0x80, 0x02,
    0xaa,
    0x7b, 0x00,
    0xd2, 0x04, 0x00, 0x00
  ]));

  assert.equal(telemetry.values.speedMps, 2.5);
  assert.equal(telemetry.values.cadenceSpm, 170);
  assert.equal(telemetry.values.strideLengthM, 1.23);
  assert.equal(telemetry.values.distanceM, 123.4);
  assert.equal(telemetry.raw.pace, 'running');
});

test('parses FTMS rower data', () => {
  const telemetry = parseRowerData(view([
    0x2c, 0x02,
    0x32,
    0x2c, 0x01,
    0xe8, 0x03, 0x00,
    0x7a, 0x00,
    0xd2, 0x00,
    0x97
  ]));

  assert.equal(telemetry.values.strokeRateSpm, 25);
  assert.equal(telemetry.values.strokeCount, 300);
  assert.equal(telemetry.values.distanceM, 1000);
  assert.equal(telemetry.values.paceSecondsPer500m, 122);
  assert.equal(telemetry.values.powerW, 210);
  assert.equal(telemetry.values.heartBpm, 151);
});

test('parses FTMS cross trainer data', () => {
  const telemetry = parseCrossTrainerData(view([
    0xcc, 0x09, 0x00,
    0xd0, 0x02,
    0xd2, 0x04, 0x00,
    0x50, 0x00,
    0x4e, 0x00,
    0x37, 0x00,
    0x19, 0x00,
    0x23, 0x00,
    0xb4, 0x00,
    0x96
  ]));

  assert.equal(telemetry.values.speedMps, 2);
  assert.equal(telemetry.values.distanceM, 1234);
  assert.equal(telemetry.values.stepsPerMinute, 80);
  assert.equal(telemetry.values.averageStepRateSpm, 78);
  assert.equal(telemetry.values.inclinePct, 5.5);
  assert.equal(telemetry.values.rampAngleDeg, 2.5);
  assert.equal(telemetry.values.resistanceLevel, 3.5);
  assert.equal(telemetry.values.powerW, 180);
  assert.equal(telemetry.values.heartBpm, 150);
});

test('parses FTMS step and stair climber data', () => {
  const step = parseStepClimberData(view([
    0x2a, 0x00,
    0x0c, 0x00,
    0x59, 0x01,
    0x58, 0x00,
    0x16, 0x00,
    0x8c
  ]));

  assert.equal(step.values.floors, 12);
  assert.equal(step.values.stepCount, 345);
  assert.equal(step.values.stepsPerMinute, 88);
  assert.equal(step.values.elevationGainM, 22);
  assert.equal(step.values.heartBpm, 140);

  const stair = parseStairClimberData(view([
    0x52, 0x00,
    0x09, 0x00,
    0x3c, 0x00,
    0x78, 0x00,
    0x85
  ]));

  assert.equal(stair.values.floors, 9);
  assert.equal(stair.values.stepsPerMinute, 60);
  assert.equal(stair.values.strideCount, 120);
  assert.equal(stair.values.heartBpm, 133);
});

test('parses battery and device information metadata', () => {
  assert.deepEqual(parseBatteryLevel(view([87])), { batteryPct: 87 });
  assert.equal(parseDeviceInfoString(textView('KICKR BIKE\0')), 'KICKR BIKE');
});

test('serializes FTMS bike grade command bytes', () => {
  const bytes = serializeBikeGradeCommand({
    type: 'bike.grade',
    gradePct: 4.5
  });

  assert.deepEqual([...bytes], [0x11, 0x00, 0x00, 0xc2, 0x01, 0x28, 0x33]);
});

test('serializes FTMS bike resistance command bytes', () => {
  const result = serializeBikeResistanceCommand({
    type: 'bike.resistance',
    resistanceLevel: 35
  });

  assert.deepEqual([...result.bytes], [0x04, 0x5e, 0x01]);
  assert.equal(result.appliedResistanceLevel, 35);
});

test('applies FTMS bike command through control point indications', async () => {
  const { characteristic, writes } = createFakeControlPoint();
  const result = await applyBleCommand(
    { type: 'bike.grade', gradePct: 4.5 },
    createBikeControlState(characteristic),
    { remoteControlPermissions: remotePermissions() }
  );

  assert.equal(characteristic.notificationsStarted, true);
  assert.equal(result.status, 'applied');
  assert.deepEqual(writes, [
    [0x00],
    [0x07],
    [0x11, 0x00, 0x00, 0xc2, 0x01, 0x28, 0x33]
  ]);
});

test('reports failed FTMS control point result codes', async () => {
  const { characteristic } = createFakeControlPoint((requestCode) => (
    requestCode === 0x11 ? 0x05 : 0x01
  ));

  const result = await applyBleCommand(
    { type: 'bike.grade', gradePct: 4.5 },
    createBikeControlState(characteristic),
    { remoteControlPermissions: remotePermissions() }
  );

  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'ftms_control_not_permitted');
});

test('blocks treadmill commands and treadmill-connected bike writes', () => {
  assert.deepEqual(evaluateBleCommand(
    { type: 'treadmill.speed', speedMps: 3 },
    { canWriteGrade: true, isTreadmill: false },
    remotePermissions()
  ), {
    ok: false,
    reason: 'treadmill_control_disabled'
  });

  assert.deepEqual(evaluateBleCommand(
    { type: 'bike.grade', gradePct: 5 },
    { canWriteGrade: true, isTreadmill: true },
    remotePermissions()
  ), {
    ok: false,
    reason: 'treadmill_control_disabled'
  });
});

test('blocks bike command when remote control is off or unsupported', () => {
  assert.deepEqual(evaluateBleCommand(
    { type: 'bike.grade', gradePct: 5 },
    { canWriteGrade: true, isTreadmill: false },
    remotePermissions({ enabled: false })
  ), {
    ok: false,
    reason: 'permission_disabled'
  });

  assert.deepEqual(evaluateBleCommand(
    { type: 'bike.resistance', resistanceLevel: 30 },
    { canWriteResistance: false, isTreadmill: false },
    remotePermissions()
  ), {
    ok: false,
    reason: 'capability_not_supported'
  });
});

test('blocks each bike command when master or specific permission is off', () => {
  const cases = [
    {
      command: { type: 'bike.grade', gradePct: 5 },
      permissionKey: 'grade',
      capabilityKey: 'canWriteGrade'
    },
    {
      command: { type: 'bike.resistance', resistanceLevel: 30 },
      permissionKey: 'resistance',
      capabilityKey: 'canWriteResistance'
    },
    {
      command: { type: 'bike.targetPower', targetPowerW: 250 },
      permissionKey: 'targetPower',
      capabilityKey: 'canWriteTargetPower'
    }
  ];

  for (const { command, permissionKey, capabilityKey } of cases) {
    const capabilities = {
      [capabilityKey]: true,
      isTreadmill: false
    };

    assert.deepEqual(evaluateBleCommand(command, capabilities, remotePermissions({ enabled: false })), {
      ok: false,
      reason: 'permission_disabled'
    });

    assert.deepEqual(evaluateBleCommand(command, capabilities, remotePermissions({ [permissionKey]: false })), {
      ok: false,
      reason: 'permission_disabled'
    });
  }
});

test('blocks unsupported advanced writes by capability', () => {
  assert.deepEqual(evaluateBleCommand(
    { type: 'bike.targetPower', targetPowerW: 250 },
    { canWriteTargetPower: false, isTreadmill: false },
    remotePermissions()
  ), {
    ok: false,
    reason: 'capability_not_supported'
  });

});

function view(bytes) {
  return new DataView(Uint8Array.from(bytes).buffer);
}

function textView(value) {
  const bytes = new TextEncoder().encode(value);
  return new DataView(bytes.buffer);
}

function createBikeControlState(controlPoint) {
  return {
    isIndoorBike: true,
    isTreadmill: false,
    controlPoint,
    controlPointHandler: null,
    controlNotificationsStarted: false,
    controlStarted: false,
    controlQueue: Promise.resolve(),
    pendingControlPointResponse: null,
    supportedResistanceRange: null
  };
}

function remotePermissions(overrides = {}) {
  return {
    ...DEFAULT_REMOTE_CONTROL_PERMISSIONS,
    enabled: true,
    targetPower: true,
    ...overrides
  };
}

function createFakeControlPoint(resultForRequest = () => 0x01) {
  const writes = [];
  let listener = null;
  const characteristic = {
    notificationsStarted: false,
    async startNotifications() {
      this.notificationsStarted = true;
      return this;
    },
    addEventListener(type, handler) {
      if (type === 'characteristicvaluechanged') {
        listener = handler;
      }
    },
    removeEventListener() {},
    async writeValueWithResponse(bytes) {
      writes.push([...bytes]);
      const requestCode = bytes[0];
      queueMicrotask(() => {
        listener?.({
          target: {
            value: view([0x80, requestCode, resultForRequest(requestCode)])
          }
        });
      });
    }
  };

  return {
    characteristic,
    writes
  };
}
