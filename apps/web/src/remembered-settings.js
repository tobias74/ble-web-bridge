import {
  BLE_DISCOVERY_SERVICES,
  DEFAULT_REMOTE_CONTROL_PERMISSIONS,
  STANDARD_COMMAND_DEFINITIONS,
  normalizeRemoteControlPermissions
} from './ftms.js';

export const METRIC_SELECTION_STORAGE_KEY = 'ble-bridge-metric-selections-v1';
export const METRIC_SOURCE_DISABLED_STORAGE_KEY = 'ble-bridge-disabled-metric-sources-v1';
export const BLE_SCAN_SERVICES_STORAGE_KEY = 'ble-bridge-selected-ble-services-v1';
export const BLE_SCAN_DISPLAY_ALL_STORAGE_KEY = 'ble-bridge-display-all-devices-v1';
export const REMOTE_CONTROL_STORAGE_KEY = 'ble-bridge-remote-control-permissions-v1';
export const REMOTE_CONTROL_TARGET_STORAGE_KEY = 'ble-bridge-remote-control-target-v1';

export const REMEMBERED_SETTING_STORAGE_KEYS = [
  METRIC_SELECTION_STORAGE_KEY,
  METRIC_SOURCE_DISABLED_STORAGE_KEY,
  BLE_SCAN_SERVICES_STORAGE_KEY,
  BLE_SCAN_DISPLAY_ALL_STORAGE_KEY,
  REMOTE_CONTROL_STORAGE_KEY,
  REMOTE_CONTROL_TARGET_STORAGE_KEY
];

export function createDefaultDiscoveryServiceSelection(discoveryServices = BLE_DISCOVERY_SERVICES) {
  return Object.fromEntries(discoveryServices.map((service) => [service.key, true]));
}

export function selectedDiscoveryServiceKeys(selection, discoveryServices = BLE_DISCOVERY_SERVICES) {
  return discoveryServices
    .filter((service) => selection[service.key] !== false)
    .map((service) => service.key);
}

export function selectedDiscoveryServiceIds(selection, discoveryServices = BLE_DISCOVERY_SERVICES) {
  return discoveryServices
    .filter((service) => selection[service.key] !== false)
    .map((service) => service.service);
}

export function readMetricSelections(summaryMetricKeys, storage = browserStorage()) {
  const parsed = readJson(storage, METRIC_SELECTION_STORAGE_KEY, {});
  if (!isRecord(parsed)) {
    return {};
  }

  return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => (
    summaryMetricKeys.includes(key) && typeof value === 'string' && value.length > 0
  )));
}

export function readDisabledMetricSources(storage = browserStorage()) {
  const parsed = readJson(storage, METRIC_SOURCE_DISABLED_STORAGE_KEY, {});
  if (!isRecord(parsed)) {
    return {};
  }

  return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => (
    key.length > 0 && value === true
  )));
}

export function readDiscoveryServiceSelection(
  discoveryServices = BLE_DISCOVERY_SERVICES,
  storage = browserStorage()
) {
  const parsed = readJson(storage, BLE_SCAN_SERVICES_STORAGE_KEY, null);
  if (!Array.isArray(parsed)) {
    return createDefaultDiscoveryServiceSelection(discoveryServices);
  }

  const configuredKeys = new Set(discoveryServices.map((service) => service.key));
  const selectedKeys = new Set(parsed.filter((key) => (
    typeof key === 'string' && configuredKeys.has(key)
  )));

  return Object.fromEntries(discoveryServices.map((service) => [
    service.key,
    selectedKeys.has(service.key)
  ]));
}

export function readDisplayAllDevices(storage = browserStorage()) {
  return readJson(storage, BLE_SCAN_DISPLAY_ALL_STORAGE_KEY, false) === true;
}

export function readRemoteControlPermissions(
  commandDefinitions = STANDARD_COMMAND_DEFINITIONS,
  storage = browserStorage()
) {
  const parsed = readJson(storage, REMOTE_CONTROL_STORAGE_KEY, {});
  return normalizeRemoteControlPermissions(
    isRecord(parsed) ? parsed : DEFAULT_REMOTE_CONTROL_PERMISSIONS,
    false,
    commandDefinitions
  );
}

export function readRemoteControlTarget(storage = browserStorage()) {
  const value = readJson(storage, REMOTE_CONTROL_TARGET_STORAGE_KEY, '');
  return typeof value === 'string' ? value : '';
}

export function writeRememberedSetting(key, value, storage = browserStorage()) {
  try {
    storage?.setItem?.(key, JSON.stringify(value));
  } catch {
    // Settings remain available for the current page when storage is unavailable.
  }
}

export function clearRememberedSettings(storage = browserStorage()) {
  try {
    for (const key of REMEMBERED_SETTING_STORAGE_KEYS) {
      storage?.removeItem?.(key);
    }
  } catch {
    // There is nothing else to clear when storage is unavailable.
  }
}

function readJson(storage, key, fallback) {
  try {
    return JSON.parse(storage?.getItem?.(key) ?? JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
