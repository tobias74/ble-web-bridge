const POWER_PROTOCOLS = ['ftms.indoor_bike', 'cycling_power'];
const CADENCE_PROTOCOLS = ['ftms.indoor_bike', 'cycling_power', 'cycling_speed_cadence'];
const HEART_PROTOCOLS = ['heart_rate', 'ftms.indoor_bike', 'ftms.treadmill', 'ftms.rower', 'ftms.cross_trainer'];
const SPEED_PROTOCOLS = ['ftms.indoor_bike', 'ftms.treadmill', 'ftms.cross_trainer', 'running_speed_cadence'];

export function getDefaultRelayUrl() {
  if (import.meta.env.VITE_RELAY_BASE_URL) {
    return trimTrailingSlash(import.meta.env.VITE_RELAY_BASE_URL);
  }

  return `${window.location.protocol}//${window.location.hostname}:8787`;
}

export async function getLatest(relayUrl, code) {
  const response = await fetch(`${trimTrailingSlash(relayUrl)}/v1/sessions/${encodeURIComponent(code)}/latest`);
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error || `latest_failed_${response.status}`);
  }

  return body;
}

export async function sendBikeGrade(relayUrl, code, gradePct) {
  const response = await fetch(`${trimTrailingSlash(relayUrl)}/v1/sessions/${encodeURIComponent(code)}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'bike.grade',
      gradePct: clampGrade(gradePct),
      ttlMs: 3000
    })
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error || body?.reason || `command_failed_${response.status}`);
  }

  return body;
}

export function selectPowerSource(latest) {
  if (!latest || latest.schemaVersion !== 2 || latest.stale || !latest.sources || typeof latest.sources !== 'object') {
    return {
      powerW: null,
      source: null,
      cadenceRpm: null,
      heartBpm: null,
      speedMps: null,
      fallbackReason: 'missing_latest'
    };
  }

  const sources = Object.values(latest.sources).filter((source) => (
    source?.connected !== false && !source?.stale && source.values && typeof source.values === 'object'
  ));
  const selectedPower = readSelectedMetric(latest, sources, 'powerW');
  const powerSource = selectedPower?.source || findMetricSource(sources, 'powerW', POWER_PROTOCOLS);

  if (!powerSource) {
    return {
      powerW: null,
      source: null,
      cadenceRpm: readSelectedMetric(latest, sources, 'cadenceRpm')?.value ?? readMetric(sources, 'cadenceRpm', CADENCE_PROTOCOLS),
      heartBpm: readSelectedMetric(latest, sources, 'heartBpm')?.value ?? readMetric(sources, 'heartBpm', HEART_PROTOCOLS),
      speedMps: readSelectedMetric(latest, sources, 'speedMps')?.value ?? readMetric(sources, 'speedMps', SPEED_PROTOCOLS),
      fallbackReason: 'no_power_source'
    };
  }

  return {
    powerW: selectedPower?.value ?? powerSource.values.powerW,
    source: powerSource,
    cadenceRpm: readSelectedMetric(latest, sources, 'cadenceRpm')?.value ?? readMetric(sources, 'cadenceRpm', CADENCE_PROTOCOLS),
    heartBpm: readSelectedMetric(latest, sources, 'heartBpm')?.value ?? readMetric(sources, 'heartBpm', HEART_PROTOCOLS),
    speedMps: readSelectedMetric(latest, sources, 'speedMps')?.value ?? readMetric(sources, 'speedMps', SPEED_PROTOCOLS),
    fallbackReason: ''
  };
}

export function resolvePowerInput(latest, manualPowerW) {
  const selected = selectPowerSource(latest);
  if (Number.isFinite(selected.powerW)) {
    return {
      ...selected,
      powerW: selected.powerW,
      mode: 'relay'
    };
  }

  return {
    ...selected,
    powerW: manualPowerW,
    mode: 'manual'
  };
}

export function createBikeGradeCommand(gradePct) {
  return {
    type: 'bike.grade',
    gradePct: clampGrade(gradePct),
    ttlMs: 3000
  };
}

export function clampGrade(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-10, Math.min(10, value));
}

export function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function findMetricSource(sources, metricName, preferredProtocols) {
  for (const protocol of preferredProtocols) {
    const source = sources.find((candidate) => (
      candidate.protocol === protocol && Number.isFinite(candidate.values?.[metricName])
    ));

    if (source) {
      return source;
    }
  }

  return sources.find((candidate) => Number.isFinite(candidate.values?.[metricName])) || null;
}

function readMetric(sources, metricName, preferredProtocols) {
  const source = findMetricSource(sources, metricName, preferredProtocols);
  return source?.values?.[metricName] ?? null;
}

function readSelectedMetric(latest, sources, metricName) {
  const selected = latest.selected?.[metricName];
  if (!selected || selected.connected === false || selected.stale || !Number.isFinite(selected.value)) {
    return null;
  }

  const source = sources.find((candidate) => (
    candidate.sourceId === selected.sourceId && Number.isFinite(candidate.values?.[metricName])
  ));

  if (!source) {
    return null;
  }

  return {
    source,
    value: source.values[metricName]
  };
}
