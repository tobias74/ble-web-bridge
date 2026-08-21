import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  createRelayPluginManifest,
  loadPluginBuild
} from '../plugin-build.js';

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url));

test('plugin build is empty when no external config is supplied', async () => {
  const build = await loadPluginBuild('');
  assert.equal(build.configPath, null);
  assert.deepEqual(build.plugins, []);
  assert.deepEqual(createRelayPluginManifest(build), { apiVersion: 1, plugins: [] });
});

test('plugin build resolves and validates external modules', async () => {
  const build = await loadPluginBuild(path.join(FIXTURES, 'valid-plugins.json'));

  assert.equal(build.plugins.length, 1);
  assert.equal(build.plugins[0].manifest.id, 'example.profile');
  assert.deepEqual(createRelayPluginManifest(build).plugins[0].commands[0].fields, {
    level: { type: 'integer', required: true, min: 0, max: 10 }
  });
});

test('plugin build rejects incompatible config versions', async () => {
  await assert.rejects(
    loadPluginBuild(path.join(FIXTURES, 'invalid-version.json')),
    /Unsupported BLE plugin config API version/
  );
});

test('plugin build rejects duplicate identifiers', async () => {
  await assert.rejects(
    loadPluginBuild(path.join(FIXTURES, 'duplicate-plugins.json')),
    /Duplicate BLE plugin plugin id/
  );
});

test('plugin build reports missing configuration files', async () => {
  await assert.rejects(
    loadPluginBuild(path.join(FIXTURES, 'missing.json')),
    /Unable to read BLE plugin config/
  );
});
