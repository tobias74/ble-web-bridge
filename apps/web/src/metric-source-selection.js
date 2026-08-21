export const DEFAULT_METRIC_SOURCE_VALUE = '__default__';
export const DISABLED_METRIC_SOURCE_VALUE = '__disabled__';

export function sourcePreferenceKey(source) {
  return [
    source.deviceKey || source.deviceName || source.deviceId || 'device',
    source.protocol || 'unknown'
  ].join('::');
}

export function metricSourceChoices(sources, key, disabledMetricSources = {}) {
  return sources.filter((source) => (
    source.connected !== false &&
    Number.isFinite(source.values?.[key]) &&
    !disabledMetricSources[sourcePreferenceKey(source)]
  ));
}

export function selectDefaultSourceForMetric(
  sources,
  key,
  disabledMetricSources = {},
  metricProtocolPriorities = {}
) {
  const choices = metricSourceChoices(sources, key, disabledMetricSources);
  if (choices.length === 0) {
    return null;
  }

  const protocolPriority = metricProtocolPriorities[key] || [];
  for (const protocol of protocolPriority) {
    const source = choices.find((candidate) => candidate.protocol === protocol);
    if (source) {
      return source;
    }
  }

  return choices[0];
}

export function selectSourceForMetric(
  sources,
  key,
  selectedMetricSources = {},
  disabledMetricSources = {},
  metricProtocolPriorities = {}
) {
  if (selectedMetricSources[key] === DISABLED_METRIC_SOURCE_VALUE) {
    return null;
  }

  const choices = metricSourceChoices(sources, key, disabledMetricSources);
  if (choices.length === 0) {
    return null;
  }

  const selectedPreferenceKey = selectedMetricSources[key];
  const selected = selectedPreferenceKey
    ? choices.find((source) => sourcePreferenceKey(source) === selectedPreferenceKey)
    : null;

  return selected || selectDefaultSourceForMetric(
    choices,
    key,
    {},
    metricProtocolPriorities
  );
}

export function updateMetricSourceSelection(current, metricKey, preferenceKey) {
  const next = { ...current };

  if (!preferenceKey || preferenceKey === DEFAULT_METRIC_SOURCE_VALUE) {
    delete next[metricKey];
  } else {
    next[metricKey] = preferenceKey;
  }

  return next;
}
