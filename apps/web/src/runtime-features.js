export const DEFAULT_RUNTIME_FEATURES = Object.freeze({
  heartRate: false
});

export function normalizeRuntimeFeatures(input) {
  return {
    heartRate: input?.features?.heartRate === true
  };
}

export async function loadRuntimeFeatures(fetchImplementation = globalThis.fetch) {
  if (typeof fetchImplementation !== 'function') {
    return { ...DEFAULT_RUNTIME_FEATURES };
  }

  try {
    const response = await fetchImplementation('/v1/config', {
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      return { ...DEFAULT_RUNTIME_FEATURES };
    }

    return normalizeRuntimeFeatures(await response.json());
  } catch {
    return { ...DEFAULT_RUNTIME_FEATURES };
  }
}

export function metricEnabledByRuntimeFeatures(metricKey, features = DEFAULT_RUNTIME_FEATURES) {
  return metricKey !== 'heartBpm' || features.heartRate === true;
}

export function applyRuntimeFeaturesToTelemetry(telemetry, features = DEFAULT_RUNTIME_FEATURES) {
  if (features.heartRate === true) {
    return telemetry;
  }

  const selected = { ...(telemetry.selected || {}) };
  delete selected.heartBpm;

  const sources = Object.fromEntries(Object.entries(telemetry.sources || {}).map(([sourceId, source]) => {
    const values = { ...(source.values || {}) };
    delete values.heartBpm;

    return [sourceId, {
      ...source,
      values
    }];
  }));

  return {
    ...telemetry,
    selected,
    sources
  };
}
