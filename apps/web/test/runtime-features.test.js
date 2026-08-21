import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_RUNTIME_FEATURES,
  applyRuntimeFeaturesToTelemetry,
  loadRuntimeFeatures,
  metricEnabledByRuntimeFeatures,
  normalizeRuntimeFeatures
} from '../src/runtime-features.js';

test('keeps Heart Rate disabled unless the relay explicitly enables it', () => {
  assert.deepEqual(normalizeRuntimeFeatures(), { heartRate: false });
  assert.deepEqual(normalizeRuntimeFeatures({ features: { heartRate: false } }), { heartRate: false });
  assert.deepEqual(normalizeRuntimeFeatures({ features: { heartRate: 'true' } }), { heartRate: false });
  assert.deepEqual(normalizeRuntimeFeatures({ features: { heartRate: true } }), { heartRate: true });
  assert.equal(metricEnabledByRuntimeFeatures('heartBpm', DEFAULT_RUNTIME_FEATURES), false);
  assert.equal(metricEnabledByRuntimeFeatures('powerW', DEFAULT_RUNTIME_FEATURES), true);
});

test('fails closed when the relay configuration cannot be loaded', async () => {
  assert.deepEqual(await loadRuntimeFeatures(async () => ({ ok: false })), { heartRate: false });
  assert.deepEqual(await loadRuntimeFeatures(async () => {
    throw new Error('offline');
  }), { heartRate: false });
});

test('loads an explicit Heart Rate enablement from the relay', async () => {
  const features = await loadRuntimeFeatures(async (url, options) => {
    assert.equal(url, '/v1/config');
    assert.equal(options.headers.accept, 'application/json');
    return {
      ok: true,
      json: async () => ({ features: { heartRate: true } })
    };
  });

  assert.deepEqual(features, { heartRate: true });
});

test('removes Heart Rate from selected and source telemetry without mutating local readings', () => {
  const telemetry = {
    schemaVersion: 2,
    selected: {
      powerW: { sourceId: 'trainer', value: 210 },
      heartBpm: { sourceId: 'sensor', value: 153 }
    },
    sources: {
      trainer: { values: { powerW: 210, heartBpm: 151 } },
      sensor: { values: { heartBpm: 153 } }
    }
  };

  const filtered = applyRuntimeFeaturesToTelemetry(telemetry, { heartRate: false });

  assert.deepEqual(filtered.selected, {
    powerW: { sourceId: 'trainer', value: 210 }
  });
  assert.deepEqual(filtered.sources.trainer.values, { powerW: 210 });
  assert.deepEqual(filtered.sources.sensor.values, {});
  assert.equal(telemetry.sources.sensor.values.heartBpm, 153);
  assert.equal(applyRuntimeFeaturesToTelemetry(telemetry, { heartRate: true }), telemetry);
});
