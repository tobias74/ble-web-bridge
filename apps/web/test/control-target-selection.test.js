import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  collectControlTargets,
  controlTargetSupportsCommand,
  selectControlTarget
} from '../src/control-target-selection.js';

const ftmsTarget = {
  id: 'trainer-a::ftms',
  protocol: 'ftms',
  protocolLabel: 'Fitness Machine Service (FTMS)',
  capabilities: { canWriteGrade: true }
};
const pluginTarget = {
  id: 'trainer-b::vendor-control',
  protocol: 'vendor-control',
  protocolLabel: 'Vendor control',
  capabilities: { canWriteResistance: true }
};

test('collects every control-capable protocol from connected device handles', () => {
  const devices = [
    { id: 'dev_1', name: 'Trainer A', status: 'connected' },
    { id: 'dev_2', name: 'Trainer B', status: 'connected' },
    { id: 'dev_3', name: 'Trainer C', status: 'disconnected' }
  ];
  const handles = new Map([
    ['dev_1', { deviceKey: 'trainer-a', getControlTargets: () => [ftmsTarget] }],
    ['dev_2', { deviceKey: 'trainer-b', getControlTargets: () => [pluginTarget] }],
    ['dev_3', { getControlTargets: () => [{ id: 'disconnected::ftms' }] }]
  ]);

  assert.deepEqual(
    collectControlTargets(devices, handles).map(({ id, deviceId, deviceName }) => ({ id, deviceId, deviceName })),
    [
      { id: 'trainer-a::ftms', deviceId: 'dev_1', deviceName: 'Trainer A' },
      { id: 'trainer-b::vendor-control', deviceId: 'dev_2', deviceName: 'Trainer B' }
    ]
  );
});

test('uses the remembered target when available and otherwise falls back to the first connected target', () => {
  assert.equal(selectControlTarget([ftmsTarget, pluginTarget], pluginTarget.id), pluginTarget);
  assert.equal(selectControlTarget([ftmsTarget, pluginTarget], 'missing'), ftmsTarget);
  assert.equal(selectControlTarget([], ftmsTarget.id), null);
});

test('checks command support against the selected target only', () => {
  assert.equal(
    controlTargetSupportsCommand(ftmsTarget, { capability: 'canWriteGrade' }),
    true
  );
  assert.equal(
    controlTargetSupportsCommand(pluginTarget, { capability: 'canWriteGrade' }),
    false
  );
});
