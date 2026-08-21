import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_METRIC_SOURCE_VALUE,
  DISABLED_METRIC_SOURCE_VALUE,
  metricSourceChoices,
  selectDefaultSourceForMetric,
  selectSourceForMetric,
  sourcePreferenceKey,
  updateMetricSourceSelection
} from '../src/metric-source-selection.js';

const priorities = {
  powerW: ['cycling_power', 'ftms.indoor_bike']
};

const ftms = source({
  deviceKey: 'trainer',
  deviceName: 'Trainer',
  protocol: 'ftms.indoor_bike',
  powerW: 210
});
const powerMeter = source({
  deviceKey: 'pedals',
  deviceName: 'Pedals',
  protocol: 'cycling_power',
  powerW: 225
});

test('selects the highest-priority available source by default', () => {
  assert.equal(
    selectDefaultSourceForMetric([ftms, powerMeter], 'powerW', {}, priorities),
    powerMeter
  );
  assert.equal(
    selectSourceForMetric([ftms, powerMeter], 'powerW', {}, {}, priorities),
    powerMeter
  );
});

test('uses an explicit per-metric source override', () => {
  const selections = { powerW: sourcePreferenceKey(ftms) };

  assert.equal(
    selectSourceForMetric([ftms, powerMeter], 'powerW', selections, {}, priorities),
    ftms
  );
});

test('falls back to the default when an override is unavailable or disabled', () => {
  const selections = { powerW: sourcePreferenceKey(ftms) };
  const disconnectedFtms = { ...ftms, connected: false };

  assert.equal(
    selectSourceForMetric([disconnectedFtms, powerMeter], 'powerW', selections, {}, priorities),
    powerMeter
  );
  assert.deepEqual(
    metricSourceChoices([ftms, powerMeter], 'powerW', { [sourcePreferenceKey(ftms)]: true }),
    [powerMeter]
  );
});

test('removes an override when automatic source selection is restored', () => {
  const current = {
    powerW: sourcePreferenceKey(ftms),
    heartBpm: 'heart-rate::heart_rate'
  };

  assert.deepEqual(
    updateMetricSourceSelection(current, 'powerW', DEFAULT_METRIC_SOURCE_VALUE),
    { heartBpm: 'heart-rate::heart_rate' }
  );
  assert.deepEqual(current, {
    powerW: sourcePreferenceKey(ftms),
    heartBpm: 'heart-rate::heart_rate'
  });
});

test('disables one metric without disabling its source for other values', () => {
  const selections = updateMetricSourceSelection({}, 'powerW', DISABLED_METRIC_SOURCE_VALUE);

  assert.deepEqual(selections, { powerW: DISABLED_METRIC_SOURCE_VALUE });
  assert.equal(
    selectSourceForMetric([ftms, powerMeter], 'powerW', selections, {}, priorities),
    null
  );
  assert.deepEqual(metricSourceChoices([ftms, powerMeter], 'powerW'), [ftms, powerMeter]);
});

function source({ deviceKey, deviceName, protocol, powerW }) {
  return {
    connected: true,
    deviceId: deviceKey,
    deviceKey,
    deviceName,
    protocol,
    sourceId: `${deviceKey}:${protocol}`,
    values: { powerW }
  };
}
