import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clampGrade, createBikeGradeCommand, resolvePowerInput, selectPowerSource } from '../src/relayClient.js';
import { createRideState, roadGradeAt, shouldSendGradeCommand, updateRideState } from '../src/simulation.js';

test('selects preferred power source from schema v2 latest response', () => {
  const latest = latestWithSources({
    'dev_1:heart_rate': source('heart_rate', { heartBpm: 151 }),
    'dev_2:cycling_power': source('cycling_power', { powerW: 230, cadenceRpm: 91 }),
    'dev_3:ftms.indoor_bike': source('ftms.indoor_bike', { powerW: 210, speedMps: 7.2 })
  });

  const selected = selectPowerSource(latest);
  assert.equal(selected.powerW, 210);
  assert.equal(selected.source.sourceId, 'dev_3:ftms.indoor_bike');
  assert.equal(selected.cadenceRpm, 91);
  assert.equal(selected.heartBpm, 151);
  assert.equal(selected.speedMps, 7.2);
});

test('prefers FTMS power before standalone cycling power', () => {
  const latest = latestWithSources({
    'dev_1:cycling_power': source('cycling_power', { powerW: 230 }),
    'dev_2:ftms.indoor_bike': source('ftms.indoor_bike', { powerW: 210 })
  });

  const selected = selectPowerSource(latest);
  assert.equal(selected.powerW, 210);
  assert.equal(selected.source.sourceId, 'dev_2:ftms.indoor_bike');
});

test('uses selected power source when provided by relay', () => {
  const latest = latestWithSources({
    'dev_1:cycling_power': source('cycling_power', { powerW: 230 }),
    'dev_2:cycling_power': source('cycling_power', { powerW: 210 })
  });
  latest.selected = {
    powerW: {
      sourceId: 'dev_1:cycling_power',
      value: 230,
      connected: true,
      stale: false
    }
  };

  const selected = selectPowerSource(latest);
  assert.equal(selected.powerW, 230);
  assert.equal(selected.source.sourceId, 'dev_1:cycling_power');
});

test('falls back to manual power without relay power', () => {
  assert.deepEqual(resolvePowerInput(null, 165), {
    powerW: 165,
    source: null,
    cadenceRpm: null,
    heartBpm: null,
    speedMps: null,
    fallbackReason: 'missing_latest',
    mode: 'manual'
  });

  const latest = latestWithSources({
    'dev_1:heart_rate': source('heart_rate', { heartBpm: 140 })
  });
  const resolved = resolvePowerInput(latest, 190);
  assert.equal(resolved.mode, 'manual');
  assert.equal(resolved.powerW, 190);
  assert.equal(resolved.heartBpm, 140);
  assert.equal(resolved.fallbackReason, 'no_power_source');
});

test('clamps grade command payload', () => {
  assert.equal(clampGrade(17), 10);
  assert.equal(clampGrade(-12), -10);
  assert.deepEqual(createBikeGradeCommand(12.4), {
    type: 'bike.grade',
    gradePct: 10,
    ttlMs: 3000
  });
});

test('simulation speed responds to power and grade', () => {
  const lowPower = createRideState();
  const highPower = createRideState();

  let low = lowPower;
  let high = highPower;
  for (let index = 0; index < 90; index += 1) {
    low = updateRideState(low, { powerW: 80 }, 1 / 30);
    high = updateRideState(high, { powerW: 320 }, 1 / 30);
  }

  assert.ok(high.speedMps > low.speedMps);
  assert.ok(high.distanceM > low.distanceM);

  const flatState = { ...createRideState(), distanceM: 268, speedMps: 9 };
  const hillState = { ...createRideState(), distanceM: 40, speedMps: 9 };
  const flatGrade = roadGradeAt(flatState.distanceM);
  const hillGrade = roadGradeAt(hillState.distanceM);
  assert.ok(flatGrade < hillGrade);
  const flat = updateRideState(flatState, { powerW: 180 }, 1);
  const hill = updateRideState(hillState, { powerW: 180 }, 1);
  assert.ok(flat.speedMps > hill.speedMps);
});

test('grade command send decision is rate limited without a grade-change threshold', () => {
  assert.equal(shouldSendGradeCommand(null, 2, 1000, null), true);
  assert.equal(shouldSendGradeCommand(2, 2.1, 1500, 1000), false);
  assert.equal(shouldSendGradeCommand(2, 2.1, 2000, 1000), true);
  assert.equal(shouldSendGradeCommand(2, Number.NaN, 3000, 1000), false);
});

function latestWithSources(sources) {
  return {
    schemaVersion: 2,
    connected: true,
    stale: false,
    sources: Object.fromEntries(Object.entries(sources).map(([sourceId, sourceValue]) => [
      sourceId,
      {
        ...sourceValue,
        sourceId
      }
    ]))
  };
}

function source(protocol, values) {
  return {
    sourceId: `dev:${protocol}`,
    deviceId: 'dev',
    deviceName: protocol,
    protocol,
    connected: true,
    stale: false,
    values
  };
}
