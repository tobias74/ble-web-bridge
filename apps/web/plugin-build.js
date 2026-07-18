import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const PLUGIN_API_VERSION = 1;
export const VIRTUAL_PLUGIN_MODULE_ID = 'virtual:ble-bridge-plugins';
const RESOLVED_VIRTUAL_PLUGIN_MODULE_ID = `\0${VIRTUAL_PLUGIN_MODULE_ID}`;
const RESERVED_COMMAND_TYPES = new Set([
  'bike.grade',
  'bike.resistance',
  'bike.targetPower',
  'treadmill.speed',
  'treadmill.incline'
]);

export async function loadPluginBuild(configPath = process.env.BLE_BRIDGE_PLUGIN_CONFIG) {
  if (!configPath) {
    return {
      configPath: null,
      plugins: []
    };
  }

  const resolvedConfigPath = path.resolve(configPath);
  let config;

  try {
    config = JSON.parse(await readFile(resolvedConfigPath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to read BLE plugin config ${resolvedConfigPath}: ${error.message}`);
  }

  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('BLE plugin config must be an object');
  }

  if (config.apiVersion !== PLUGIN_API_VERSION) {
    throw new Error(`Unsupported BLE plugin config API version: ${config.apiVersion}`);
  }

  if (!Array.isArray(config.plugins)) {
    throw new Error('BLE plugin config plugins must be an array');
  }

  const plugins = [];
  for (const [index, entry] of config.plugins.entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.module !== 'string' || !entry.module.trim()) {
      throw new Error(`BLE plugin config entry ${index} must define a module path`);
    }

    const modulePath = path.resolve(path.dirname(resolvedConfigPath), entry.module);
    let loaded;
    try {
      loaded = await import(pathToFileURL(modulePath).href);
    } catch (error) {
      throw new Error(`Unable to load BLE plugin module ${modulePath}: ${error.message}`);
    }

    validatePluginModule(loaded, modulePath);
    plugins.push({
      modulePath,
      manifest: loaded.manifest
    });
  }

  validatePluginCollection(plugins);

  return {
    configPath: resolvedConfigPath,
    plugins
  };
}

export function createBlePluginBuildPlugin(build) {
  return {
    name: 'ble-bridge-profile-plugins',

    resolveId(id) {
      return id === VIRTUAL_PLUGIN_MODULE_ID ? RESOLVED_VIRTUAL_PLUGIN_MODULE_ID : null;
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_PLUGIN_MODULE_ID) {
        return null;
      }

      const imports = build.plugins.map((plugin, index) => (
        `import plugin${index} from ${JSON.stringify(normalizeImportPath(plugin.modulePath))};`
      ));
      const names = build.plugins.map((_, index) => `plugin${index}`);
      return `${imports.join('\n')}\nexport const BLE_PROFILE_PLUGINS = [${names.join(', ')}];\n`;
    },

    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'ble-plugin-manifest.json',
        source: `${JSON.stringify(createRelayPluginManifest(build), null, 2)}\n`
      });
    }
  };
}

export function createRelayPluginManifest(build) {
  return {
    apiVersion: PLUGIN_API_VERSION,
    plugins: build.plugins.map((plugin) => ({
      id: plugin.manifest.id,
      commands: plugin.manifest.commands || []
    }))
  };
}

export function validatePluginModule(loaded, modulePath = 'plugin module') {
  if (!loaded || typeof loaded !== 'object') {
    throw new Error(`${modulePath} must be an ES module`);
  }

  validatePluginManifest(loaded.manifest, modulePath);

  if (!loaded.default || typeof loaded.default !== 'object') {
    throw new Error(`${modulePath} must default-export a plugin adapter`);
  }

  if (loaded.default.manifest !== loaded.manifest) {
    throw new Error(`${modulePath} default export must reference its named manifest export`);
  }

  if (typeof loaded.default.attach !== 'function') {
    throw new Error(`${modulePath} plugin adapter must define attach()`);
  }
}

export function validatePluginManifest(manifest, source = 'plugin manifest') {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`${source} must export a manifest object`);
  }

  if (manifest.apiVersion !== PLUGIN_API_VERSION) {
    throw new Error(`${source} has unsupported plugin API version: ${manifest.apiVersion}`);
  }

  assertIdentifier(manifest.id, `${source} id`);
  assertNonEmptyString(manifest.label, `${source} label`);

  if (!Array.isArray(manifest.discoveryServices) || manifest.discoveryServices.length === 0) {
    throw new Error(`${source} must declare at least one discovery service`);
  }

  for (const service of manifest.discoveryServices) {
    assertIdentifier(service?.key, `${source} discovery service key`);
    assertNonEmptyString(service?.label, `${source} discovery service label`);
    assertNonEmptyString(service?.service, `${source} discovery service UUID`);
  }

  if (!Array.isArray(manifest.protocols) || manifest.protocols.length === 0) {
    throw new Error(`${source} must declare at least one protocol`);
  }

  for (const protocol of manifest.protocols) {
    assertIdentifier(protocol?.id, `${source} protocol id`);
    assertNonEmptyString(protocol?.label, `${source} protocol label`);
    if (protocol.metricPriorities !== undefined) {
      if (!protocol.metricPriorities || typeof protocol.metricPriorities !== 'object' || Array.isArray(protocol.metricPriorities)) {
        throw new Error(`${source} protocol metricPriorities must be an object`);
      }
      for (const [metric, priority] of Object.entries(protocol.metricPriorities)) {
        assertIdentifier(metric, `${source} metric priority key`);
        if (!Number.isFinite(priority)) {
          throw new Error(`${source} metric priority ${metric} must be numeric`);
        }
      }
    }
  }

  if (manifest.handledCommandTypes !== undefined) {
    if (!Array.isArray(manifest.handledCommandTypes)) {
      throw new Error(`${source} handledCommandTypes must be an array`);
    }
    manifest.handledCommandTypes.forEach((type) => assertIdentifier(type, `${source} handled command type`));
  }

  if (manifest.commands !== undefined && !Array.isArray(manifest.commands)) {
    throw new Error(`${source} commands must be an array`);
  }

  for (const command of manifest.commands || []) {
    validateCommandDescriptor(command, source);
    if (!manifest.handledCommandTypes?.includes(command.type)) {
      throw new Error(`${source} command ${command.type} must also appear in handledCommandTypes`);
    }
  }

  try {
    JSON.stringify(manifest);
  } catch (error) {
    throw new Error(`${source} must be serializable: ${error.message}`);
  }
}

function validateCommandDescriptor(command, source) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    throw new Error(`${source} command descriptor must be an object`);
  }

  assertIdentifier(command.type, `${source} command type`);
  assertNonEmptyString(command.label, `${source} command label`);
  assertIdentifier(command.permissionKey, `${source} command permissionKey`);
  assertNonEmptyString(command.permissionLabel, `${source} command permissionLabel`);
  assertIdentifier(command.capability, `${source} command capability`);

  if (!['standard', 'advanced'].includes(command.tier)) {
    throw new Error(`${source} command ${command.type} tier must be standard or advanced`);
  }

  if (command.defaultEnabled !== undefined && typeof command.defaultEnabled !== 'boolean') {
    throw new Error(`${source} command ${command.type} defaultEnabled must be boolean`);
  }

  if (!command.fields || typeof command.fields !== 'object' || Array.isArray(command.fields)) {
    throw new Error(`${source} command ${command.type} fields must be an object`);
  }

  for (const [name, field] of Object.entries(command.fields)) {
    assertIdentifier(name, `${source} command ${command.type} field name`);
    if (!field || typeof field !== 'object' || Array.isArray(field)) {
      throw new Error(`${source} command ${command.type} field ${name} must be an object`);
    }
    if (!['number', 'integer', 'boolean', 'string'].includes(field.type)) {
      throw new Error(`${source} command ${command.type} field ${name} has unsupported type`);
    }
    if (field.required !== undefined && typeof field.required !== 'boolean') {
      throw new Error(`${source} command ${command.type} field ${name} required must be boolean`);
    }
    if (field.min !== undefined && !Number.isFinite(field.min)) {
      throw new Error(`${source} command ${command.type} field ${name} min must be numeric`);
    }
    if (field.max !== undefined && !Number.isFinite(field.max)) {
      throw new Error(`${source} command ${command.type} field ${name} max must be numeric`);
    }
    if (field.min !== undefined && field.max !== undefined && field.min > field.max) {
      throw new Error(`${source} command ${command.type} field ${name} min exceeds max`);
    }
  }
}

function validatePluginCollection(plugins) {
  assertUnique(plugins.map((plugin) => plugin.manifest.id), 'plugin id');
  assertUnique(plugins.flatMap((plugin) => plugin.manifest.discoveryServices.map((service) => service.key)), 'discovery service key');
  assertUnique(plugins.flatMap((plugin) => plugin.manifest.discoveryServices.map((service) => service.service.toLowerCase())), 'discovery service UUID');
  assertUnique(plugins.flatMap((plugin) => plugin.manifest.protocols.map((protocol) => protocol.id)), 'protocol id');
  assertUnique(plugins.flatMap((plugin) => (plugin.manifest.commands || []).map((command) => command.type)), 'command type');
  for (const command of plugins.flatMap((plugin) => plugin.manifest.commands || [])) {
    if (RESERVED_COMMAND_TYPES.has(command.type)) {
      throw new Error(`BLE plugin command type is reserved by the host: ${command.type}`);
    }
  }
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate BLE plugin ${label}: ${value}`);
    }
    seen.add(value);
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_.-]*$/i.test(value)) {
    throw new Error(`${label} must be a non-empty identifier`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function normalizeImportPath(modulePath) {
  return modulePath.replaceAll('\\', '/');
}
