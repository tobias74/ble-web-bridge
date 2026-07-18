import {
  Activity,
  AlertTriangle,
  Bluetooth,
  Check,
  Copy,
  Gauge,
  HeartPulse,
  Link,
  Pause,
  Play,
  Radio,
  RefreshCw,
  SlidersHorizontal,
  Unplug,
  Zap
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { createSession, getDefaultRelayUrl, trimTrailingSlash } from './api.js';
import {
  BLE_DISCOVERY_SERVICES,
  DEFAULT_REMOTE_CONTROL_PERMISSIONS,
  STANDARD_COMMAND_DEFINITIONS,
  commandPermissionKey,
  connectBleDevice,
  normalizeRemoteControlPermissions
} from './ftms.js';
import {
  formatPluginCommand,
  getPluginCommandDefinitions,
  getPluginDiscoveryServices,
  getPluginMetricPriorities,
  pluginCommandLabel
} from './plugin-host.js';

const SEND_INTERVAL_MS = 250;
const HEARTBEAT_INTERVAL_MS = 5000;
const MAX_COMMAND_HISTORY = 5;
const METRIC_SELECTION_STORAGE_KEY = 'ble-bridge-metric-selections-v1';
const METRIC_SOURCE_DISABLED_STORAGE_KEY = 'ble-bridge-disabled-metric-sources-v1';
const BLE_SCAN_SERVICES_STORAGE_KEY = 'ble-bridge-selected-ble-services-v1';
const BLE_SCAN_DISPLAY_ALL_STORAGE_KEY = 'ble-bridge-display-all-devices-v1';
const REMOTE_CONTROL_STORAGE_KEY = 'ble-bridge-remote-control-permissions-v1';
export default function App({ plugins = [] }) {
  const commandDefinitions = useMemo(() => [
    ...STANDARD_COMMAND_DEFINITIONS,
    ...getPluginCommandDefinitions(plugins)
  ], [plugins]);
  const remoteControlOptions = useMemo(() => commandDefinitions.map((command) => ({
    key: command.permissionKey,
    label: command.permissionLabel,
    capability: command.capability,
    tier: command.tier
  })), [commandDefinitions]);
  const discoveryServices = useMemo(() => [
    ...BLE_DISCOVERY_SERVICES,
    ...getPluginDiscoveryServices(plugins)
  ], [plugins]);
  const metricProtocolPriorities = useMemo(() => mergeMetricProtocolPriorities(
    getPluginMetricPriorities(plugins)
  ), [plugins]);
  const [relayUrl, setRelayUrl] = useState(() => localStorage.getItem('ble-bridge-relay-url') || getDefaultRelayUrl());
  const [session, setSession] = useState(null);
  const [socketState, setSocketState] = useState('idle');
  const [streaming, setStreaming] = useState(false);
  const [sources, setSources] = useState({});
  const [devices, setDevices] = useState([]);
  const [displayAllDevices, setDisplayAllDevices] = useState(() => readDisplayAllDevices());
  const [selectedDiscoveryServices, setSelectedDiscoveryServices] = useState(() => readDiscoveryServiceSelection(discoveryServices));
  const [remoteControlPermissions, setRemoteControlPermissions] = useState(() => readRemoteControlPermissions(commandDefinitions));
  const [selectedMetricSources, setSelectedMetricSources] = useState(() => readMetricSelections());
  const [disabledMetricSources, setDisabledMetricSources] = useState(() => readDisabledMetricSources());
  const [warnings, setWarnings] = useState([]);
  const [recentCommands, setRecentCommands] = useState([]);
  const [error, setError] = useState('');

  const wsRef = useRef(null);
  const sourceRef = useRef({});
  const selectedMetricSourcesRef = useRef(selectedMetricSources);
  const disabledMetricSourcesRef = useRef(disabledMetricSources);
  const deviceHandlesRef = useRef(new Map());
  const nextDeviceNumberRef = useRef(1);
  const remoteControlPermissionsRef = useRef(remoteControlPermissions);
  const commandQueueRef = useRef(Promise.resolve());
  const manualCloseRef = useRef(false);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    sourceRef.current = sources;
  }, [sources]);

  useEffect(() => {
    selectedMetricSourcesRef.current = selectedMetricSources;
  }, [selectedMetricSources]);

  useEffect(() => {
    disabledMetricSourcesRef.current = disabledMetricSources;
  }, [disabledMetricSources]);

  useEffect(() => {
    remoteControlPermissionsRef.current = remoteControlPermissions;
  }, [remoteControlPermissions]);

  useEffect(() => {
    localStorage.setItem('ble-bridge-relay-url', trimTrailingSlash(relayUrl));
  }, [relayUrl]);

  useEffect(() => {
    localStorage.setItem(METRIC_SELECTION_STORAGE_KEY, JSON.stringify(selectedMetricSources));
  }, [selectedMetricSources]);

  useEffect(() => {
    localStorage.setItem(METRIC_SOURCE_DISABLED_STORAGE_KEY, JSON.stringify(disabledMetricSources));
  }, [disabledMetricSources]);

  useEffect(() => {
    localStorage.setItem(BLE_SCAN_DISPLAY_ALL_STORAGE_KEY, JSON.stringify(displayAllDevices));
  }, [displayAllDevices]);

  useEffect(() => {
    localStorage.setItem(BLE_SCAN_SERVICES_STORAGE_KEY, JSON.stringify(selectedDiscoveryServiceKeys(selectedDiscoveryServices, discoveryServices)));
  }, [selectedDiscoveryServices, discoveryServices]);

  useEffect(() => {
    localStorage.setItem(REMOTE_CONTROL_STORAGE_KEY, JSON.stringify(remoteControlPermissions));
  }, [remoteControlPermissions]);

  useEffect(() => {
    if (!streaming || socketState !== 'connected') {
      return undefined;
    }

    const interval = setInterval(() => {
      sendTelemetry(createBridgeTelemetry(
        sourceRef.current,
        selectedMetricSourcesRef.current,
        disabledMetricSourcesRef.current,
        metricProtocolPriorities
      ));
    }, SEND_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [socketState, streaming, metricProtocolPriorities]);

  useEffect(() => () => {
    manualCloseRef.current = true;
    clearTimeout(reconnectTimerRef.current);
    wsRef.current?.close(1000, 'client stopped');
    for (const device of deviceHandlesRef.current.values()) {
      device.disconnect();
    }
  }, []);

  useEffect(() => {
    if (streaming || socketState !== 'connected') {
      return undefined;
    }

    const interval = setInterval(() => {
      sendTelemetry({
        schemaVersion: 2,
        timestampMs: Date.now(),
        sources: {}
      });
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [socketState, streaming]);

  const sourceList = useMemo(() => sortSources(sources), [sources]);
  const visibleMetrics = useMemo(() => (
    createVisibleMetrics(sourceList, selectedMetricSources, disabledMetricSources, metricProtocolPriorities)
  ), [sourceList, selectedMetricSources, disabledMetricSources, metricProtocolPriorities]);
  const metricSelectionRows = useMemo(() => (
    createMetricSelectionRows(sourceList, selectedMetricSources, disabledMetricSources, metricProtocolPriorities)
  ), [sourceList, selectedMetricSources, disabledMetricSources, metricProtocolPriorities]);
  const metricSourceRows = useMemo(() => (
    createMetricSourceRows(sourceList, disabledMetricSources)
  ), [sourceList, disabledMetricSources]);
  const remoteControlCapabilities = useMemo(() => (
    createRemoteControlCapabilityState(devices, deviceHandlesRef.current, remoteControlOptions)
  ), [devices, sources, remoteControlOptions]);

  const statusLabel = useMemo(() => {
    if (!session) {
      return 'No session';
    }

    if (socketState === 'connected' && streaming) {
      return 'Streaming';
    }

    return socketState;
  }, [session, socketState, streaming]);

  async function handleCreateSession() {
    setError('');
    setStreaming(false);
    stopBridge();

    try {
      const nextSession = await createSession(trimTrailingSlash(relayUrl));
      setSession(nextSession);
      connectBridge(nextSession);
    } catch (sessionError) {
      setError(sessionError.message);
    }
  }

  function connectBridge(nextSession) {
    manualCloseRef.current = false;
    clearTimeout(reconnectTimerRef.current);
    setSocketState('connecting');

    const socket = new WebSocket(nextSession.bridgeWsUrl);
    wsRef.current = socket;

    socket.addEventListener('open', () => {
      setSocketState('connected');
      setError('');
    });

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'command' && message.command) {
          const entryId = addReceivedCommand(message.command);
          enqueueCommand(message.command, entryId);
          return;
        }

        if (message.type === 'error') {
          setError(message.error);
        }
      } catch {
        setError('invalid_server_message');
      }
    });

    socket.addEventListener('close', () => {
      if (wsRef.current === socket) {
        wsRef.current = null;
      }

      setSocketState('disconnected');

      if (!manualCloseRef.current && nextSession) {
        setSocketState('reconnecting');
        reconnectTimerRef.current = setTimeout(() => connectBridge(nextSession), 1500);
      }
    });

    socket.addEventListener('error', () => {
      setError('websocket_error');
    });
  }

  async function handleAddDevice(discoveryOptions = {}) {
    setError('');
    const deviceId = `dev_${nextDeviceNumberRef.current}`;
    nextDeviceNumberRef.current += 1;

    setDevices((current) => [...current, {
      id: deviceId,
      name: 'Selecting device',
      status: 'selecting',
      protocols: [],
      capabilities: {}
    }]);

    try {
      const device = await connectBleDevice(
        deviceId,
        upsertSource,
        (status) => updateDeviceStatus(deviceId, status),
        { ...discoveryOptions, plugins }
      );
      deviceHandlesRef.current.set(deviceId, device);
      setDevices((current) => current.map((entry) => (
        entry.id === deviceId
          ? {
              id: deviceId,
              name: device.name,
              status: 'connected',
              protocols: device.protocols || [],
              capabilities: device.capabilities || {}
            }
          : entry
      )));
    } catch (deviceError) {
      deviceHandlesRef.current.delete(deviceId);
      setDevices((current) => current.filter((entry) => entry.id !== deviceId));
      setError(deviceError.message);
    }
  }

  function handleScanDevice() {
    handleAddDevice({
      acceptAllDevices: displayAllDevices,
      services: selectedDiscoveryServiceIds(selectedDiscoveryServices, discoveryServices)
    });
  }

  function updateDeviceStatus(deviceId, status) {
    setDevices((current) => current.map((entry) => (
      entry.id === deviceId ? { ...entry, status } : entry
    )));
  }

  function handleDiscoveryServiceToggle(serviceKey, enabled) {
    setSelectedDiscoveryServices((current) => ({
      ...current,
      [serviceKey]: enabled
    }));
  }

  function handleMetricSourceChange(metricKey, preferenceKey) {
    setSelectedMetricSources((current) => {
      return {
        ...current,
        [metricKey]: preferenceKey
      };
    });
  }

  function handleMetricSourceToggle(preferenceKey, enabled) {
    setDisabledMetricSources((current) => {
      const next = { ...current };
      if (enabled) {
        delete next[preferenceKey];
      } else {
        next[preferenceKey] = true;
      }
      return next;
    });
  }

  function handleRemoteControlPermissionChange(key, value) {
    setRemoteControlPermissions((current) => ({
      ...normalizeRemoteControlPermissions(current, false, commandDefinitions),
      [key]: value
    }));
  }

  function disconnectDevice(deviceId) {
    const device = deviceHandlesRef.current.get(deviceId);
    device?.disconnect();
    deviceHandlesRef.current.delete(deviceId);
    markDeviceSourcesDisconnected(deviceId);
    setDevices((current) => current.map((entry) => (
      entry.id === deviceId ? { ...entry, status: 'disconnected' } : entry
    )));
  }

  function upsertSource(source) {
    setSources((current) => {
      const previous = current[source.sourceId] || {};
      return {
        ...current,
        [source.sourceId]: {
          ...previous,
          ...source,
          values: {
            ...(previous.values || {}),
            ...(source.values || {})
          },
          info: {
            ...(previous.info || {}),
            ...(source.info || {})
          },
          raw: Object.keys(source.raw || {}).length > 0 ? source.raw : (previous.raw || {})
        }
      };
    });
  }

  function markDeviceSourcesDisconnected(deviceId) {
    setSources((current) => {
      const next = {};
      const now = Date.now();
      for (const [sourceId, source] of Object.entries(current)) {
        next[sourceId] = source.deviceId === deviceId
          ? { ...source, connected: false, timestampMs: now }
          : source;
      }
      return next;
    });
  }

  function addReceivedCommand(command) {
    const entry = createCommandEntry(command);
    setRecentCommands((current) => [entry, ...current].slice(0, MAX_COMMAND_HISTORY));
    return entry.id;
  }

  function updateCommandEntry(id, patch) {
    setRecentCommands((current) => current.map((entry) => (
      entry.id === id ? { ...entry, ...patch } : entry
    )));
  }

  function enqueueCommand(command, entryId) {
    commandQueueRef.current = commandQueueRef.current
      .catch(() => undefined)
      .then(() => processCommand(command, entryId));
  }

  async function processCommand(command, entryId) {
    let result;

    try {
      const permissions = remoteControlPermissionsRef.current;
      const permissionKey = commandPermissionKey(command, commandDefinitions);
      if (command?.type === 'treadmill.speed' || command?.type === 'treadmill.incline') {
        result = createBlockedCommandResult(command, 'treadmill_control_disabled');
      } else if (!permissionKey) {
        result = createBlockedCommandResult(command, 'unsupported_command_type');
      } else if (!permissions.enabled || !permissions[permissionKey]) {
        result = createBlockedCommandResult(command, 'permission_disabled');
      } else {
        const commandDefinition = commandDefinitions.find((definition) => definition.type === command.type);
        const bikeDevices = [...deviceHandlesRef.current.values()].filter((device) => {
          const capabilities = getCurrentDeviceCapabilities(device);
          return commandDefinition?.capability
            ? Boolean(capabilities?.[commandDefinition.capability])
            : Boolean(capabilities?.canWriteBike);
        });

        if (bikeDevices.length === 0) {
          result = createBlockedCommandResult(
            command,
            deviceHandlesRef.current.size === 0 ? 'no_device_connected' : 'capability_not_supported'
          );
        } else if (bikeDevices.length > 1) {
          result = createBlockedCommandResult(command, 'multiple_bike_control_targets');
        } else {
          result = await bikeDevices[0].applyCommand(command, {
            remoteControlPermissions: permissions
          });
        }
      }
    } catch (commandError) {
      result = createBlockedCommandResult(command, commandError.message || 'command_failed');
      result.status = 'failed';
    }

    updateCommandEntry(entryId, {
      status: result.status || 'unknown',
      reason: result.reason || '',
      applied: result.applied || null,
      handledAt: Date.now()
    });

    if (result.status !== 'applied') {
      addWarning(command, result.reason || result.status);
    }
  }

  function addWarning(command, reason) {
    setWarnings((current) => [{
      id: `${Date.now()}-${Math.random()}`,
      type: command?.type || 'command',
      reason,
      text: warningText(command?.type, reason, plugins)
    }, ...current].slice(0, 3));
  }

  function stopBridge() {
    manualCloseRef.current = true;
    clearTimeout(reconnectTimerRef.current);
    wsRef.current?.close(1000, 'client stopped');
    wsRef.current = null;
    setSocketState('idle');
  }

  function sendTelemetry(telemetry) {
    const socket = wsRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(telemetry));
    }
  }

  function copySessionCode() {
    if (session?.code) {
      navigator.clipboard?.writeText(session.code);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>BLE Bridge</h1>
          <p>{statusLabel}</p>
        </div>
        <div className={`status-dot ${socketState === 'connected' ? 'online' : ''}`} aria-label={statusLabel} />
      </header>

      <section className="workspace">
        <div className="panel session-panel">
          <div className="panel-title">
            <Link size={18} />
            <span>Session</span>
          </div>

          <label className="field">
            <span>Relay URL</span>
            <input value={relayUrl} onChange={(event) => setRelayUrl(event.target.value)} />
          </label>

          <div className="session-code">
            <span>{session?.code || '---- ----'}</span>
            <button className="icon-button" onClick={copySessionCode} disabled={!session?.code} title="Copy code" aria-label="Copy code">
              <Copy size={18} />
            </button>
          </div>

          <div className="button-row">
            <button className="primary-button" onClick={handleCreateSession}>
              {socketState === 'reconnecting' ? <RefreshCw size={18} /> : <Radio size={18} />}
              <span>{session ? 'New session' : 'Start session'}</span>
            </button>
            <button className="ghost-button" onClick={() => setStreaming((value) => !value)} disabled={!session || socketState !== 'connected'}>
              {streaming ? <Pause size={18} /> : <Play size={18} />}
              <span>{streaming ? 'Pause' : 'Stream'}</span>
            </button>
          </div>

          {error ? <div className="error-line">{error}</div> : null}
        </div>

        <div className="panel device-panel">
          <div className="panel-title">
            <Bluetooth size={18} />
            <span>Devices</span>
          </div>

          <div className="scan-options">
            <div className="scan-option-group">
              <div className="scan-group-title">Services to connect</div>
              <div className="scan-service-list">
                {discoveryServices.map((service) => (
                  <label className="scan-service-toggle" key={service.key}>
                    <input
                      type="checkbox"
                      checked={selectedDiscoveryServices[service.key] !== false}
                      onChange={(event) => handleDiscoveryServiceToggle(service.key, event.target.checked)}
                    />
                    <span>{service.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="scan-action-row">
              <label className="scan-toggle">
                <input
                  type="checkbox"
                  checked={displayAllDevices}
                  onChange={(event) => setDisplayAllDevices(event.target.checked)}
                />
                <span>Scan all devices</span>
              </label>

              <button
                className="primary-button scan-button"
                disabled={selectedDiscoveryServiceIds(selectedDiscoveryServices, discoveryServices).length === 0}
                onClick={handleScanDevice}
              >
                <Bluetooth size={18} />
                <span>Scan</span>
              </button>
            </div>
          </div>

          {devices.length > 0 ? (
            <div className="device-list">
              {devices.map((device) => (
                <div className="device-row" key={device.id}>
                  <div className="device-main">
                    <div className="device-status">
                      <Check size={18} />
                      <span>{device.name}: {device.status}</span>
                    </div>
                    {device.protocols.length > 0 ? (
                      <div className="protocol-list" aria-label={`${device.name} protocols`}>
                        {device.protocols.map((protocol) => (
                          <span className="protocol-chip" key={protocol}>{protocol}</span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <button
                    className="icon-button"
                    onClick={() => disconnectDevice(device.id)}
                    disabled={!deviceHandlesRef.current.has(device.id)}
                    title="Disconnect"
                    aria-label={`Disconnect ${device.name}`}
                  >
                    <Unplug size={18} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-line">No BLE devices connected</div>
          )}

          <RemoteControlPanel
            capabilities={remoteControlCapabilities}
            onChange={handleRemoteControlPermissionChange}
            options={remoteControlOptions}
            permissions={remoteControlPermissions}
          />

          {warnings.length > 0 ? (
            <div className="warning-list" aria-live="polite">
              {warnings.map((warning) => (
                <div className="warning-line" key={warning.id}>
                  <AlertTriangle size={18} />
                  <span>{warning.text}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="metrics">
          {visibleMetrics.length > 0 ? (
            visibleMetrics.map((metric) => (
              <MetricCard
                icon={metricIcon(metric.icon)}
                key={metric.key}
                label={metric.label}
                tone={metric.tone}
                value={metric.value}
              />
            ))
          ) : (
            <div className="metrics-empty empty-line">No live values yet</div>
          )}
        </div>

        {metricSelectionRows.length > 0 || metricSourceRows.length > 0 ? (
          <MetricSelectionPanel
            rows={metricSelectionRows}
            sourceRows={metricSourceRows}
            onChange={handleMetricSourceChange}
            onToggleSource={handleMetricSourceToggle}
          />
        ) : null}

        <div className="activity-panels">
          <SourceValuesPanel sources={sourceList} />
          <CommandHistoryPanel commands={recentCommands} plugins={plugins} />
        </div>
      </section>
    </main>
  );
}

function MetricCard({ icon, label, tone, value }) {
  return (
    <div className={`metric-card ${tone || 'neutral'}`}>
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MetricSelectionPanel({ rows, sourceRows, onChange, onToggleSource }) {
  return (
    <div className="panel selection-panel">
      <div className="panel-title">
        <SlidersHorizontal size={18} />
        <span>Primary metrics</span>
      </div>

      {sourceRows.length > 0 ? (
        <>
          <div className="selection-group-title">Sources</div>
          <div className="metric-source-list">
            {sourceRows.map((source) => (
              <label className="metric-source-toggle" key={source.preferenceKey}>
                <input
                  type="checkbox"
                  checked={!source.disabled}
                  onChange={(event) => onToggleSource(source.preferenceKey, event.target.checked)}
                />
                <span>{source.label}</span>
              </label>
            ))}
          </div>
        </>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="selection-group-title">Values</div>
          <div className="selection-list">
            {rows.map((row) => (
              <label className="selection-row" key={row.key}>
                <span>{row.label}</span>
                <select value={row.value} onChange={(event) => onChange(row.key, event.target.value)}>
                  {row.choices.map((choice) => (
                    <option value={choice.preferenceKey} key={choice.preferenceKey}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function RemoteControlPanel({ permissions, capabilities, options, onChange }) {
  const normalizedPermissions = normalizeRemoteControlPermissions(permissions, false, options.map((option) => ({
    permissionKey: option.key,
    defaultEnabled: option.tier === 'standard'
  })));
  const standardOptions = options.filter((option) => (
    option.tier === 'standard' && capabilities?.[option.key]
  ));
  const advancedOptions = options.filter((option) => (
    option.tier === 'advanced' && capabilities?.[option.key]
  ));

  if (!capabilities?.hasControllableBike) {
    return null;
  }

  return (
    <div className="remote-control-panel">
      <label className="control-toggle master-toggle">
        <input
          type="checkbox"
          checked={normalizedPermissions.enabled}
          onChange={(event) => onChange('enabled', event.target.checked)}
        />
        <span>Allow remote control</span>
      </label>

      {standardOptions.length > 0 ? (
        <div className="control-grid">
          {standardOptions.map((option) => (
            <RemoteControlToggle
              key={option.key}
              option={option}
              permissions={normalizedPermissions}
              onChange={onChange}
            />
          ))}
        </div>
      ) : null}

      {advancedOptions.length > 0 ? (
        <>
          <div className="control-group-title">Advanced controls</div>
          <div className="control-grid advanced-grid">
            {advancedOptions.map((option) => (
              <RemoteControlToggle
                key={option.key}
                option={option}
                permissions={normalizedPermissions}
                onChange={onChange}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function RemoteControlToggle({ option, permissions, onChange }) {
  return (
    <label className="control-toggle sub-toggle">
      <input
        type="checkbox"
        checked={permissions[option.key]}
        onChange={(event) => onChange(option.key, event.target.checked)}
      />
      <span>{option.label}</span>
    </label>
  );
}

function SourceValuesPanel({ sources }) {
  return (
    <div className="panel values-panel">
      <div className="panel-title">
        <Activity size={18} />
        <span>Sources</span>
      </div>

      {sources.length > 0 ? (
        <div className="source-list">
          {sources.map((source) => (
            <div className={`source-row ${source.connected ? 'connected' : 'disconnected'}`} key={source.sourceId}>
              <div className="source-head">
                <div>
                  <strong>{formatProtocol(source.protocol)}</strong>
                  <span>{source.deviceName || source.deviceId}</span>
                </div>
                <time>{formatClock(source.timestampMs)}</time>
              </div>
              <div className="value-grid">
                {createSourceValueRows(source).map((row) => (
                  <div className="value-row" key={`${source.sourceId}-${row.label}`}>
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-line">No source values yet</div>
      )}
    </div>
  );
}

function CommandHistoryPanel({ commands, plugins }) {
  return (
    <div className="panel commands-panel">
      <div className="panel-title">
        <Radio size={18} />
        <span>Commands</span>
      </div>

      {commands.length > 0 ? (
        <div className="command-list">
          {commands.map((entry) => (
            <div className={`command-row ${entry.status}`} key={entry.id}>
              <div className="command-main">
                <strong>{entry.type}</strong>
                <span>{formatCommandValue(entry.command, plugins)}</span>
              </div>
              <div className="command-meta">
                <span>{formatCommandStatus(entry)}</span>
                <time>{formatClock(entry.handledAt || entry.receivedAt)}</time>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-line">No commands yet</div>
      )}
    </div>
  );
}

function createBridgeTelemetry(sources, selectedMetricSources = {}, disabledMetricSources = {}, metricProtocolPriorities = METRIC_PROTOCOL_PRIORITIES) {
  const sourceList = sortSources(sources);

  return {
    schemaVersion: 2,
    timestampMs: Date.now(),
    selected: createSelectedTelemetry(sourceList, selectedMetricSources, disabledMetricSources, metricProtocolPriorities),
    sources: Object.fromEntries(Object.entries(sources).map(([sourceId, source]) => [
      sourceId,
      {
        sourceId,
        deviceId: source.deviceId,
        deviceName: source.deviceName,
        protocol: source.protocol,
        connected: source.connected !== false,
        timestampMs: source.timestampMs,
        values: source.values || {},
        info: source.info || {},
        raw: source.raw || {}
      }
    ]))
  };
}

function createCommandEntry(command) {
  const receivedAt = Date.now();
  return {
    id: `${command?.commandId || 'command'}-${receivedAt}-${Math.random()}`,
    command,
    type: command?.type || 'unknown',
    commandId: command?.commandId || '',
    status: 'received',
    reason: '',
    applied: null,
    receivedAt,
    handledAt: null
  };
}

function createBlockedCommandResult(command, reason) {
  return {
    commandId: command?.commandId,
    type: command?.type,
    status: 'blocked',
    reason
  };
}

function createDefaultDiscoveryServiceSelection(discoveryServices = BLE_DISCOVERY_SERVICES) {
  return Object.fromEntries(discoveryServices.map((service) => [service.key, true]));
}

function selectedDiscoveryServiceKeys(selection, discoveryServices = BLE_DISCOVERY_SERVICES) {
  return discoveryServices
    .filter((service) => selection[service.key] !== false)
    .map((service) => service.key);
}

function selectedDiscoveryServiceIds(selection, discoveryServices = BLE_DISCOVERY_SERVICES) {
  return discoveryServices
    .filter((service) => selection[service.key] !== false)
    .map((service) => service.service);
}

function createRemoteControlCapabilityState(devices, deviceHandles, options) {
  const connectedCapabilities = devices
    .filter((device) => device.status !== 'disconnected' && deviceHandles.has(device.id))
    .map((device) => getCurrentDeviceCapabilities(deviceHandles.get(device.id), device))
    .filter(Boolean);
  const supportedOptions = Object.fromEntries(options.map((option) => [
    option.key,
    connectedCapabilities.some((capabilities) => Boolean(capabilities?.[option.capability]))
  ]));

  return {
    ...supportedOptions,
    hasConnectedDevice: connectedCapabilities.length > 0,
    hasControllableBike: connectedCapabilities.some((capabilities) => (
      Boolean(capabilities?.canWriteBike) || options.some((option) => Boolean(capabilities?.[option.capability]))
    ))
  };
}

function getCurrentDeviceCapabilities(device, fallbackDevice = null) {
  return device?.getCapabilities?.() || device?.capabilities || fallbackDevice?.capabilities || {};
}

function sortSources(sources) {
  return Object.values(sources).sort((left, right) => {
    const leftConnected = left.connected !== false;
    const rightConnected = right.connected !== false;

    if (leftConnected !== rightConnected) {
      return leftConnected ? -1 : 1;
    }

    return compareSourceIdentity(left, right);
  });
}

function compareSourceIdentity(left, right) {
  return sourceSortKey(left).localeCompare(sourceSortKey(right), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function sourceSortKey(source) {
  return [
    source.deviceName || '',
    source.deviceId || '',
    source.protocol || '',
    source.sourceId || ''
  ].join('\u0000');
}

function createSourceValueRows(source) {
  const rows = Object.entries(source.values || {}).map(([key, value]) => ({
    label: valueLabel(key),
    value: formatValue(key, value)
  }));

  if (Number.isFinite(source.info?.batteryPct)) {
    rows.push({ label: 'Battery', value: formatMetric(source.info.batteryPct, '%', 0) });
  }

  if (source.info?.modelNumber) {
    rows.push({ label: 'Model', value: source.info.modelNumber });
  }

  return rows.length > 0 ? rows : [{ label: 'Status', value: source.connected ? 'connected' : 'disconnected' }];
}

const SUMMARY_METRIC_KEYS = [
  'powerW',
  'averagePowerW',
  'speedMps',
  'averageSpeedMps',
  'cadenceRpm',
  'cadenceSpm',
  'heartBpm',
  'inclinePct',
  'rampAngleDeg',
  'resistanceLevel',
  'distanceM',
  'paceSecondsPer500m',
  'averagePaceSecondsPer500m',
  'strokeRateSpm',
  'averageStrokeRateSpm',
  'strokeCount',
  'strideLengthM',
  'strideCount',
  'stepsPerMinute',
  'averageStepRateSpm',
  'stepCount',
  'floors',
  'elevationGainM',
  'totalEnergyKcal',
  'energyPerHourKcal',
  'energyPerMinuteKcal',
  'metabolicEquivalent',
  'elapsedTimeS',
  'remainingTimeS'
];

const METRIC_PROTOCOL_PRIORITIES = {
  powerW: ['ftms.indoor_bike', 'cycling_power', 'ftms.rower', 'ftms.cross_trainer', 'ftms.treadmill'],
  averagePowerW: ['ftms.indoor_bike', 'cycling_power', 'ftms.rower', 'ftms.cross_trainer', 'ftms.treadmill'],
  cadenceRpm: ['ftms.indoor_bike', 'cycling_power', 'cycling_speed_cadence'],
  cadenceSpm: ['running_speed_cadence'],
  speedMps: ['ftms.indoor_bike', 'ftms.treadmill', 'ftms.cross_trainer', 'running_speed_cadence'],
  averageSpeedMps: ['ftms.indoor_bike', 'ftms.treadmill', 'ftms.cross_trainer', 'running_speed_cadence'],
  heartBpm: ['heart_rate', 'ftms.indoor_bike', 'ftms.treadmill', 'ftms.rower', 'ftms.cross_trainer']
};

function mergeMetricProtocolPriorities(pluginPriorities = {}) {
  const merged = {};
  const metrics = new Set([...Object.keys(METRIC_PROTOCOL_PRIORITIES), ...Object.keys(pluginPriorities)]);
  for (const metric of metrics) {
    const publicProtocols = METRIC_PROTOCOL_PRIORITIES[metric] || [];
    const weights = Object.fromEntries(publicProtocols.map((protocol, index) => [
      protocol,
      (publicProtocols.length - index) * 20
    ]));
    Object.assign(weights, pluginPriorities[metric] || {});
    merged[metric] = Object.entries(weights)
      .sort((left, right) => right[1] - left[1])
      .map(([protocol]) => protocol);
  }
  return merged;
}

function createVisibleMetrics(sources, selectedMetricSources = {}, disabledMetricSources = {}, metricProtocolPriorities = METRIC_PROTOCOL_PRIORITIES) {
  const metrics = [];

  for (const key of SUMMARY_METRIC_KEYS) {
    const source = selectSourceForMetric(sources, key, selectedMetricSources, disabledMetricSources, metricProtocolPriorities);

    if (!source) {
      continue;
    }

    metrics.push({
      key,
      icon: metricIconName(key),
      label: valueLabel(key),
      tone: metricTone(key),
      value: formatValue(key, source.values[key])
    });
  }

  return metrics;
}

function createMetricSourceRows(sources, disabledMetricSources = {}) {
  const rows = [];
  const seen = new Set();

  for (const source of sources) {
    if (source.connected === false || !hasSummaryMetric(source)) {
      continue;
    }

    const preferenceKey = sourcePreferenceKey(source);
    if (seen.has(preferenceKey)) {
      continue;
    }

    seen.add(preferenceKey);
    rows.push({
      preferenceKey,
      label: sourceName(source),
      disabled: Boolean(disabledMetricSources[preferenceKey])
    });
  }

  return rows;
}

function createMetricSelectionRows(sources, selectedMetricSources = {}, disabledMetricSources = {}, metricProtocolPriorities = METRIC_PROTOCOL_PRIORITIES) {
  const rows = [];

  for (const key of SUMMARY_METRIC_KEYS) {
    const choices = metricSourceChoices(sources, key, disabledMetricSources);

    if (choices.length < 2) {
      continue;
    }

    const selectedSource = selectSourceForMetric(sources, key, selectedMetricSources, disabledMetricSources, metricProtocolPriorities);

    rows.push({
      key,
      label: valueLabel(key),
      value: selectedSource ? sourcePreferenceKey(selectedSource) : sourcePreferenceKey(choices[0]),
      choices: choices.map((source) => ({
        preferenceKey: sourcePreferenceKey(source),
        label: `${sourceName(source)} · ${formatValue(key, source.values[key])}`
      }))
    });
  }

  return rows;
}

function createSelectedTelemetry(sources, selectedMetricSources = {}, disabledMetricSources = {}, metricProtocolPriorities = METRIC_PROTOCOL_PRIORITIES) {
  const selected = {};

  for (const key of SUMMARY_METRIC_KEYS) {
    const source = selectSourceForMetric(sources, key, selectedMetricSources, disabledMetricSources, metricProtocolPriorities);

    if (!source) {
      continue;
    }

    selected[key] = {
      sourceId: source.sourceId,
      deviceId: source.deviceId,
      deviceName: source.deviceName,
      protocol: source.protocol,
      value: source.values[key],
      timestampMs: source.timestampMs
    };
  }

  return selected;
}

function selectSourceForMetric(sources, key, selectedMetricSources = {}, disabledMetricSources = {}, metricProtocolPriorities = METRIC_PROTOCOL_PRIORITIES) {
  const choices = metricSourceChoices(sources, key, disabledMetricSources);
  if (choices.length === 0) {
    return null;
  }

  const selectedPreferenceKey = selectedMetricSources[key];
  const selected = selectedPreferenceKey
    ? choices.find((source) => sourcePreferenceKey(source) === selectedPreferenceKey)
    : null;

  if (selected) {
    return selected;
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

function metricSourceChoices(sources, key, disabledMetricSources = {}) {
  return sources.filter((source) => (
    source.connected !== false &&
    Number.isFinite(source.values?.[key]) &&
    !disabledMetricSources[sourcePreferenceKey(source)]
  ));
}

function hasSummaryMetric(source) {
  return SUMMARY_METRIC_KEYS.some((key) => Number.isFinite(source.values?.[key]));
}

function sourcePreferenceKey(source) {
  return [
    source.deviceKey || source.deviceName || source.deviceId || 'device',
    source.protocol || 'unknown'
  ].join('::');
}

function sourceName(source) {
  const protocol = formatProtocol(source.protocol);
  const device = source.deviceName || source.deviceId || 'Device';
  return `${device} · ${protocol}`;
}

function metricIcon(icon) {
  if (icon === 'power') {
    return <Zap size={22} />;
  }

  if (icon === 'heart') {
    return <HeartPulse size={22} />;
  }

  if (icon === 'motion') {
    return <Gauge size={22} />;
  }

  return <Activity size={22} />;
}

function metricIconName(key) {
  if (key === 'powerW' || key === 'averagePowerW' || key.endsWith('Kcal')) {
    return 'power';
  }

  if (key === 'heartBpm') {
    return 'heart';
  }

  if (key === 'speedMps' || key === 'averageSpeedMps' || key === 'distanceM' || key === 'inclinePct' || key === 'rampAngleDeg' || key === 'resistanceLevel' || key.includes('pace') || key === 'elevationGainM') {
    return 'motion';
  }

  return 'activity';
}

function metricTone(key) {
  if (key === 'powerW' || key === 'averagePowerW' || key.endsWith('Kcal')) {
    return 'power';
  }

  if (key === 'heartBpm') {
    return 'heart';
  }

  if (key === 'speedMps' || key === 'averageSpeedMps' || key === 'distanceM' || key === 'inclinePct' || key === 'rampAngleDeg' || key === 'resistanceLevel' || key.includes('pace') || key === 'elevationGainM') {
    return 'motion';
  }

  return 'activity';
}

function valueLabel(key) {
  const labels = {
    speedMps: 'Speed',
    averageSpeedMps: 'Avg Speed',
    cadenceRpm: 'Cadence',
    cadenceSpm: 'Run Cadence',
    powerW: 'Power',
    averagePowerW: 'Avg Power',
    distanceM: 'Distance',
    inclinePct: 'Incline',
    rampAngleDeg: 'Ramp',
    heartBpm: 'Heart',
    strideLengthM: 'Stride',
    strideCount: 'Strides',
    strokeRateSpm: 'Stroke Rate',
    averageStrokeRateSpm: 'Avg Stroke',
    strokeCount: 'Strokes',
    paceSecondsPer500m: 'Pace',
    averagePaceSecondsPer500m: 'Avg Pace',
    resistanceLevel: 'Resistance',
    totalEnergyKcal: 'Energy',
    energyPerHourKcal: 'kcal/h',
    energyPerMinuteKcal: 'kcal/min',
    metabolicEquivalent: 'MET',
    elapsedTimeS: 'Elapsed',
    remainingTimeS: 'Remaining',
    stepsPerMinute: 'Step Rate',
    averageStepRateSpm: 'Avg Step',
    stepCount: 'Steps',
    floors: 'Floors',
    elevationGainM: 'Elevation'
  };

  return labels[key] || key;
}

function formatValue(key, value) {
  if (key === 'speedMps' || key === 'averageSpeedMps') {
    return formatMetric(value * 3.6, 'km/h', 1);
  }

  if (key === 'powerW' || key === 'averagePowerW') {
    return formatMetric(value, 'W', 0);
  }

  if (key === 'cadenceRpm') {
    return formatMetric(value, 'rpm', 0);
  }

  if (key === 'cadenceSpm' || key === 'strokeRateSpm' || key === 'averageStrokeRateSpm' || key === 'stepsPerMinute' || key === 'averageStepRateSpm') {
    return formatMetric(value, 'spm', 0);
  }

  if (key === 'distanceM' || key === 'strideLengthM' || key === 'elevationGainM') {
    return formatMetric(value, 'm', key === 'strideLengthM' ? 2 : 0);
  }

  if (key === 'inclinePct') {
    return formatMetric(value, '%', 1);
  }

  if (key === 'rampAngleDeg') {
    return formatMetric(value, 'deg', 1);
  }

  if (key === 'heartBpm') {
    return formatMetric(value, 'bpm', 0);
  }

  if (key === 'paceSecondsPer500m' || key === 'averagePaceSecondsPer500m' || key === 'elapsedTimeS' || key === 'remainingTimeS') {
    return formatDuration(value);
  }

  if (key.endsWith('Kcal')) {
    return formatMetric(value, 'kcal', 0);
  }

  return Number.isFinite(value) ? value.toFixed(Number.isInteger(value) ? 0 : 1) : '--';
}

function formatCommandValue(command, plugins = []) {
  if (!command || typeof command !== 'object') {
    return '--';
  }

  if (command.type === 'bike.grade') {
    return formatMetric(command.gradePct, '%', 1);
  }

  if (command.type === 'bike.resistance') {
    return formatMetric(command.resistanceLevel, '', 0).trim();
  }

  if (command.type === 'bike.targetPower') {
    return formatMetric(command.targetPowerW, 'W', 0);
  }

  const pluginValue = formatPluginCommand(command, plugins);
  if (pluginValue) {
    return pluginValue;
  }

  if (command.type === 'treadmill.speed') {
    return formatMetric(command.speedMps, 'm/s', 1);
  }

  if (command.type === 'treadmill.incline') {
    return formatMetric(command.inclinePct, '%', 1);
  }

  return command.commandId ? shortId(command.commandId) : '--';
}

function formatCommandStatus(entry) {
  if (entry.status === 'received') {
    return 'received';
  }

  if (entry.status === 'applied') {
    return 'applied';
  }

  if (entry.reason) {
    return `${entry.status}: ${entry.reason}`;
  }

  return entry.status || 'unknown';
}

function warningText(type, reason, plugins = []) {
  const family = commandFamilyLabel(type, plugins);

  if (reason === 'treadmill_control_disabled') {
    return `${family} blocked`;
  }

  if (reason === 'permission_disabled' || reason === 'bike_control_not_enabled') {
    return `${family} blocked: permission disabled`;
  }

  if (reason === 'capability_not_supported' || reason === 'bike_control_not_supported') {
    return `${family} blocked: capability not supported`;
  }

  if (reason === 'multiple_bike_control_targets') {
    return `${family} blocked: multiple controllable bikes`;
  }

  if (reason === 'no_device_connected') {
    return `${family} blocked: no device connected`;
  }

  if (reason === 'command_expired') {
    return `${family} blocked: expired`;
  }

  return `${family} blocked: ${reason || 'unknown'}`;
}

function commandFamilyLabel(type, plugins = []) {
  const labels = {
    'bike.grade': 'Grade command',
    'bike.resistance': 'Resistance command',
    'bike.targetPower': 'Target power command',
    'treadmill.speed': 'Treadmill command',
    'treadmill.incline': 'Treadmill command'
  };

  return labels[type] || pluginCommandLabel(type, plugins) || 'Command';
}

function formatProtocol(protocol) {
  return String(protocol || 'unknown').replaceAll('_', ' ').replaceAll('.', ' ');
}

function formatMetric(value, unit, digits) {
  if (!Number.isFinite(value)) {
    return '--';
  }

  return `${value.toFixed(digits)} ${unit}`.trim();
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) {
    return '--';
  }

  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = String(total % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

function formatClock(timestampMs) {
  if (!Number.isFinite(timestampMs)) {
    return '--';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(timestampMs));
}

function readMetricSelections() {
  try {
    const parsed = JSON.parse(localStorage.getItem(METRIC_SELECTION_STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => (
      SUMMARY_METRIC_KEYS.includes(key) && typeof value === 'string' && value.length > 0
    )));
  } catch {
    return {};
  }
}

function readDisabledMetricSources() {
  try {
    const parsed = JSON.parse(localStorage.getItem(METRIC_SOURCE_DISABLED_STORAGE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => (
      typeof key === 'string' && key.length > 0 && value === true
    )));
  } catch {
    return {};
  }
}

function readDiscoveryServiceSelection(discoveryServices = BLE_DISCOVERY_SERVICES) {
  try {
    const parsed = JSON.parse(localStorage.getItem(BLE_SCAN_SERVICES_STORAGE_KEY) || 'null');
    if (!Array.isArray(parsed)) {
      return createDefaultDiscoveryServiceSelection(discoveryServices);
    }

    const selectedKeys = new Set(parsed.filter((key) => (
      typeof key === 'string' && discoveryServices.some((service) => service.key === key)
    )));

    return Object.fromEntries(discoveryServices.map((service) => [
      service.key,
      selectedKeys.has(service.key)
    ]));
  } catch {
    return createDefaultDiscoveryServiceSelection(discoveryServices);
  }
}

function readDisplayAllDevices() {
  try {
    return JSON.parse(localStorage.getItem(BLE_SCAN_DISPLAY_ALL_STORAGE_KEY) || 'false') === true;
  } catch {
    return false;
  }
}

function readRemoteControlPermissions(commandDefinitions = STANDARD_COMMAND_DEFINITIONS) {
  try {
    return normalizeRemoteControlPermissions(JSON.parse(localStorage.getItem(REMOTE_CONTROL_STORAGE_KEY) || '{}'), false, commandDefinitions);
  } catch {
    return normalizeRemoteControlPermissions(DEFAULT_REMOTE_CONTROL_PERMISSIONS, false, commandDefinitions);
  }
}

function shortId(value) {
  return String(value).slice(0, 12);
}
