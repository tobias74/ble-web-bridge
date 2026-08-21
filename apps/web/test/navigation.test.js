import assert from 'node:assert/strict';
import test from 'node:test';

import { pageFromHash, pageHref } from '../src/navigation.js';

test('maps supported hash routes to information pages', () => {
  assert.equal(pageFromHash('#bridge'), 'bridge');
  assert.equal(pageFromHash('#/about'), 'about');
  assert.equal(pageFromHash('#privacy'), 'privacy');
  assert.equal(pageFromHash('#IMPRINT'), 'imprint');
});

test('falls back to the bridge page for unknown hashes', () => {
  assert.equal(pageFromHash(''), 'bridge');
  assert.equal(pageFromHash('#unknown'), 'bridge');
  assert.equal(pageHref('unknown'), '#bridge');
});
