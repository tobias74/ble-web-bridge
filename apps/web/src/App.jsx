import {
  Activity,
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Gauge,
  HeartPulse,
  Languages,
  Link,
  Pause,
  Play,
  RefreshCw,
  Unplug,
  X,
  Zap
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { createConnectionSession } from './connection-session.js';
import {
  collectControlTargets,
  controlTargetSupportsCommand,
  selectControlTarget
} from './control-target-selection.js';
import { useI18n } from './i18n.js';
import {
  DEFAULT_METRIC_SOURCE_VALUE,
  DISABLED_METRIC_SOURCE_VALUE,
  metricSourceChoices,
  selectDefaultSourceForMetric,
  selectSourceForMetric,
  sourcePreferenceKey,
  updateMetricSourceSelection
} from './metric-source-selection.js';
import { APP_PAGES, pageFromHash, pageHref } from './navigation.js';
import { InformationPage } from './Pages.jsx';
import { PrivacyConsentDialog } from './PrivacyConsentDialog.jsx';
import { readPrivacyConsent, writePrivacyConsent } from './privacy-consent.js';
import {
  DEFAULT_RUNTIME_FEATURES,
  applyRuntimeFeaturesToTelemetry,
  loadRuntimeFeatures,
  metricEnabledByRuntimeFeatures
} from './runtime-features.js';
import {
  clearStoredConnectionSession,
  readStoredConnectionSession,
  writeStoredConnectionSession
} from './session-storage.js';
import {
  BLE_SCAN_DISPLAY_ALL_STORAGE_KEY,
  BLE_SCAN_SERVICES_STORAGE_KEY,
  METRIC_SELECTION_STORAGE_KEY,
  REMOTE_CONTROL_STORAGE_KEY,
  REMOTE_CONTROL_TARGET_STORAGE_KEY,
  clearRememberedSettings,
  createDefaultDiscoveryServiceSelection,
  readDiscoveryServiceSelection,
  readDisplayAllDevices,
  readMetricSelections,
  readRemoteControlPermissions,
  readRemoteControlTarget,
  selectedDiscoveryServiceIds,
  selectedDiscoveryServiceKeys,
  writeRememberedSetting
} from './remembered-settings.js';
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
export default function App({ plugins = [] }) {
  const { language, setLanguage, t } = useI18n();
  const [page, setPage] = useState(() => pageFromHash(globalThis.location?.hash));
  const commandDefinitions = useMemo(() => [
    ...STANDARD_COMMAND_DEFINITIONS,
    ...getPluginCommandDefinitions(plugins)
  ], [plugins]);
  const remoteControlOptions = useMemo(() => commandDefinitions.map((command) => ({
    type: command.type,
    key: command.permissionKey,
    label: permissionLabel(command, t),
    capability: command.capability,
    tier: command.tier
  })), [commandDefinitions, t]);
  const discoveryServices = useMemo(() => [
    ...BLE_DISCOVERY_SERVICES,
    ...getPluginDiscoveryServices(plugins)
  ], [plugins]);
  const metricProtocolPriorities = useMemo(() => mergeMetricProtocolPriorities(
    getPluginMetricPriorities(plugins)
  ), [plugins]);
  const [session, setSession] = useState(() => readStoredConnectionSession());
  const [sessionLoading, setSessionLoading] = useState(false);
  const [socketState, setSocketState] = useState('idle');
  const [streaming, setStreaming] = useState(false);
  const [sources, setSources] = useState({});
  const [devices, setDevices] = useState([]);
  const [privacyConsent, setPrivacyConsent] = useState(() => readPrivacyConsent());
  const [isPrivacyConsentVisible, setPrivacyConsentVisible] = useState(() => !readPrivacyConsent().decided);
  const [displayAllDevices, setDisplayAllDevices] = useState(() => (
    privacyConsent.rememberSettings ? readDisplayAllDevices() : false
  ));
  const [selectedDiscoveryServices, setSelectedDiscoveryServices] = useState(() => (
    privacyConsent.rememberSettings
      ? readDiscoveryServiceSelection(discoveryServices)
      : createDefaultDiscoveryServiceSelection(discoveryServices)
  ));
  const [remoteControlPermissions, setRemoteControlPermissions] = useState(() => (
    privacyConsent.rememberSettings
      ? readRemoteControlPermissions(commandDefinitions)
      : normalizeRemoteControlPermissions(DEFAULT_REMOTE_CONTROL_PERMISSIONS, false, commandDefinitions)
  ));
  const [selectedMetricSources, setSelectedMetricSources] = useState(() => (
    privacyConsent.rememberSettings ? readMetricSelections(SUMMARY_METRIC_KEYS) : {}
  ));
  const [selectedControlTargetId, setSelectedControlTargetId] = useState(() => (
    privacyConsent.rememberSettings ? readRemoteControlTarget() : ''
  ));
  const [warnings, setWarnings] = useState([]);
  const [recentCommands, setRecentCommands] = useState([]);
  const [sessionError, setSessionError] = useState('');
  const [deviceError, setDeviceError] = useState('');
  const [runtimeFeatures, setRuntimeFeatures] = useState(DEFAULT_RUNTIME_FEATURES);
  const [isDeviceConnectionDialogVisible, setDeviceConnectionDialogVisible] = useState(false);

  const wsRef = useRef(null);
  const sessionRequestInFlightRef = useRef(false);
  const sourceRef = useRef({});
  const selectedMetricSourcesRef = useRef(selectedMetricSources);
  const deviceHandlesRef = useRef(new Map());
  const connectedDeviceIdsRef = useRef(new Set());
  const nextDeviceNumberRef = useRef(1);
  const remoteControlPermissionsRef = useRef(remoteControlPermissions);
  const activeControlTargetRef = useRef(null);
  const commandQueueRef = useRef(Promise.resolve());
  const manualCloseRef = useRef(false);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    sourceRef.current = sources;
  }, [sources]);

  useEffect(() => {
    let active = true;

    loadRuntimeFeatures().then((features) => {
      if (active) {
        setRuntimeFeatures(features);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (sessionError !== 'rate_limited') {
      return undefined;
    }

    const timeout = setTimeout(() => setSessionError(''), 5000);
    return () => clearTimeout(timeout);
  }, [sessionError]);

  useEffect(() => {
    function handleHashChange() {
      setPage(pageFromHash(globalThis.location?.hash));
    }

    globalThis.addEventListener?.('hashchange', handleHashChange);
    return () => globalThis.removeEventListener?.('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const pageTitle = page === 'bridge' ? 'BLE Bridge' : `${t(`nav.${page}`)} · BLE Bridge`;
    if (globalThis.document) {
      globalThis.document.title = pageTitle;
    }
  }, [page, t]);

  useEffect(() => {
    selectedMetricSourcesRef.current = selectedMetricSources;
  }, [selectedMetricSources]);

  useEffect(() => {
    remoteControlPermissionsRef.current = remoteControlPermissions;
  }, [remoteControlPermissions]);

  useEffect(() => {
    if (privacyConsent.rememberSettings) {
      writeRememberedSetting(METRIC_SELECTION_STORAGE_KEY, selectedMetricSources);
    }
  }, [selectedMetricSources, privacyConsent.rememberSettings]);

  useEffect(() => {
    if (privacyConsent.rememberSettings) {
      writeRememberedSetting(BLE_SCAN_DISPLAY_ALL_STORAGE_KEY, displayAllDevices);
    }
  }, [displayAllDevices, privacyConsent.rememberSettings]);

  useEffect(() => {
    if (privacyConsent.rememberSettings) {
      writeRememberedSetting(BLE_SCAN_SERVICES_STORAGE_KEY, selectedDiscoveryServiceKeys(selectedDiscoveryServices, discoveryServices));
    }
  }, [selectedDiscoveryServices, discoveryServices, privacyConsent.rememberSettings]);

  useEffect(() => {
    if (privacyConsent.rememberSettings) {
      writeRememberedSetting(REMOTE_CONTROL_STORAGE_KEY, remoteControlPermissions);
    }
  }, [remoteControlPermissions, privacyConsent.rememberSettings]);

  useEffect(() => {
    if (privacyConsent.rememberSettings && selectedControlTargetId) {
      writeRememberedSetting(REMOTE_CONTROL_TARGET_STORAGE_KEY, selectedControlTargetId);
    }
  }, [selectedControlTargetId, privacyConsent.rememberSettings]);

  useEffect(() => {
    if (!streaming || socketState !== 'connected') {
      return undefined;
    }

    const interval = setInterval(() => {
      sendTelemetry(createBridgeTelemetry(
        sourceRef.current,
        selectedMetricSourcesRef.current,
        {},
        metricProtocolPriorities,
        runtimeFeatures
      ));
    }, SEND_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [socketState, streaming, metricProtocolPriorities, runtimeFeatures]);

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
  const metricSelectionRows = useMemo(() => (
    createMetricSelectionRows(sourceList, selectedMetricSources, {}, metricProtocolPriorities, runtimeFeatures, t)
  ), [sourceList, selectedMetricSources, metricProtocolPriorities, runtimeFeatures, t]);
  const controlTargets = useMemo(() => (
    collectControlTargets(devices, deviceHandlesRef.current)
  ), [devices]);
  const activeControlTarget = useMemo(() => (
    selectControlTarget(controlTargets, selectedControlTargetId)
  ), [controlTargets, selectedControlTargetId]);
  const remoteControlCapabilities = activeControlTarget?.capabilities || {};
  const connectedDevices = devices.filter((device) => device.status === 'connected');
  const hasConnectedDevice = connectedDevices.length > 0;
  const deviceConnectionInProgress = devices.some((device) => (
    device.status === 'selecting' || device.status === 'connecting'
  ));

  useEffect(() => {
    activeControlTargetRef.current = activeControlTarget;
  }, [activeControlTarget]);

  useEffect(() => {
    if (controlTargets.length > 0 && !controlTargets.some((target) => target.id === selectedControlTargetId)) {
      setSelectedControlTargetId(controlTargets[0].id);
    }
  }, [controlTargets, selectedControlTargetId]);

  const statusLabel = useMemo(() => {
    if (sessionLoading) {
      return t('status.creatingSession');
    }

    if (!session) {
      return t('status.noSession');
    }

    if (socketState === 'connected') {
      return t(streaming ? 'status.streaming' : 'status.paused');
    }

    return t(`status.${socketState}`, {}, socketState);
  }, [session, sessionLoading, socketState, streaming, t]);

  function handleCreateSession() {
    if (sessionRequestInFlightRef.current) {
      return;
    }

    sessionRequestInFlightRef.current = true;
    setSessionLoading(true);
    setSessionError('');
    setStreaming(false);
    stopBridge();
    setSession(null);

    try {
      const nextSession = createConnectionSession();
      writeStoredConnectionSession(nextSession);
      setSession(nextSession);
      if (connectedDeviceIdsRef.current.size > 0) {
        setStreaming(true);
        connectBridge(nextSession);
      }
    } catch (creationError) {
      setSessionError(creationError.message);
    } finally {
      sessionRequestInFlightRef.current = false;
      setSessionLoading(false);
    }
  }

  function handleRegenerateSession() {
    if (session?.code && !window.confirm(t('session.regenerateConfirm'))) {
      return;
    }

    clearStoredConnectionSession();
    handleCreateSession();
  }

  function startBridgeForConnectedDevice() {
    if (
      connectedDeviceIdsRef.current.size === 0
      || sessionRequestInFlightRef.current
      || wsRef.current
    ) {
      return;
    }

    const availableSession = session || readStoredConnectionSession();
    if (availableSession) {
      setSession(availableSession);
      setStreaming(true);
      connectBridge(availableSession);
      return;
    }

    handleCreateSession();
  }

  function stopBridgeForDisconnectedDevices() {
    setStreaming(false);
    setSessionError('');
    stopBridge();
  }

  function connectBridge(nextSession) {
    manualCloseRef.current = false;
    clearTimeout(reconnectTimerRef.current);
    setSocketState('connecting');

    const socket = new WebSocket(nextSession.bridgeWsUrl);
    wsRef.current = socket;

    socket.addEventListener('open', () => {
      if (wsRef.current !== socket) {
        return;
      }

      setSocketState('connected');
      setSessionError('');
    });

    socket.addEventListener('message', (event) => {
      if (wsRef.current !== socket) {
        return;
      }

      try {
        const message = JSON.parse(event.data);
        if (message.type === 'command' && message.command) {
          const entryId = addReceivedCommand(message.command);
          enqueueCommand(message.command, entryId);
          return;
        }

        if (message.type === 'error') {
          setSessionError(message.error);
        }
      } catch {
        setSessionError('invalid_server_message');
      }
    });

    socket.addEventListener('close', (event) => {
      if (wsRef.current !== socket) {
        return;
      }

      wsRef.current = null;
      setSocketState('disconnected');

      if (!manualCloseRef.current && nextSession && connectedDeviceIdsRef.current.size > 0) {
        setSocketState('reconnecting');
        reconnectTimerRef.current = setTimeout(() => connectBridge(nextSession), 1500);
      }
    });

    socket.addEventListener('error', () => {
      if (wsRef.current !== socket) {
        return;
      }

      setSessionError('websocket_error');
    });
  }

  async function handleAddDevice(discoveryOptions = {}) {
    setDeviceError('');
    const deviceId = `dev_${nextDeviceNumberRef.current}`;
    nextDeviceNumberRef.current += 1;

    setDevices((current) => [...current, {
      id: deviceId,
      name: '',
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
      connectedDeviceIdsRef.current.add(deviceId);
      setDevices((current) => current.map((entry) => (
        entry.id === deviceId
          ? {
              id: deviceId,
              name: device.name,
              status: 'connected',
              deviceKey: device.deviceKey,
              protocols: device.protocols || [],
              capabilities: device.capabilities || {}
            }
          : entry
      )));
      startBridgeForConnectedDevice();
    } catch (deviceError) {
      deviceHandlesRef.current.delete(deviceId);
      setDevices((current) => current.filter((entry) => entry.id !== deviceId));
      setDeviceError(deviceError.message);
    }
  }

  function handleScanDevice() {
    const connection = handleAddDevice({
      acceptAllDevices: displayAllDevices,
      services: selectedDiscoveryServiceIds(selectedDiscoveryServices, discoveryServices)
    });
    setDeviceConnectionDialogVisible(false);
    return connection;
  }

  function updateDeviceStatus(deviceId, status) {
    if (status === 'disconnected') {
      connectedDeviceIdsRef.current.delete(deviceId);
      deviceHandlesRef.current.delete(deviceId);
      if (connectedDeviceIdsRef.current.size === 0) {
        stopBridgeForDisconnectedDevices();
      }
    }

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
    setSelectedMetricSources((current) => (
      updateMetricSourceSelection(current, metricKey, preferenceKey)
    ));
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
    connectedDeviceIdsRef.current.delete(deviceId);
    markDeviceSourcesDisconnected(deviceId);
    setDevices((current) => current.map((entry) => (
      entry.id === deviceId ? { ...entry, status: 'disconnected' } : entry
    )));
    if (connectedDeviceIdsRef.current.size === 0) {
      stopBridgeForDisconnectedDevices();
    }
  }

  function disconnectConnectedDevices() {
    for (const device of connectedDevices) {
      disconnectDevice(device.id);
    }
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
        const controlTarget = activeControlTargetRef.current;

        if (!controlTarget) {
          result = createBlockedCommandResult(
            command,
            deviceHandlesRef.current.size === 0 ? 'no_device_connected' : 'capability_not_supported'
          );
        } else if (!controlTargetSupportsCommand(controlTarget, commandDefinition)) {
          result = createBlockedCommandResult(command, 'capability_not_supported');
        } else {
          result = await controlTarget.applyCommand(command, {
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
      reason
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

  function savePrivacyConsent({ rememberSettings, trackingAdvertising }) {
    const nextConsent = writePrivacyConsent({ decided: true, rememberSettings, trackingAdvertising });
    setPrivacyConsent(nextConsent);
    setPrivacyConsentVisible(false);

    if (!nextConsent.rememberSettings) {
      clearRememberedSettings();
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand-block">
          <a className="brand-link" href={pageHref('bridge')}>BLE Bridge</a>
        </div>

        <div className="topbar-actions">
          <div className="appbar">
            <nav className="app-nav" aria-label={t('nav.navigation')}>
              {APP_PAGES.map((item) => (
                <Fragment key={item}>
                  <a
                    aria-current={page === item ? 'page' : undefined}
                    className={page === item ? 'active' : ''}
                    href={pageHref(item)}
                  >
                    {t(`nav.${item}`)}
                  </a>
                  {item === 'privacy' ? (
                    <button aria-haspopup="dialog" onClick={() => setPrivacyConsentVisible(true)} type="button">
                      {t('nav.cookies')}
                    </button>
                  ) : null}
                </Fragment>
              ))}
            </nav>

            <label className="language-select" title={t('language.label')}>
              <Languages size={18} aria-hidden="true" />
              <span className="language-current" aria-hidden="true">{language.toUpperCase()}</span>
              <ChevronDown className="language-chevron" size={15} aria-hidden="true" />
              <span className="visually-hidden">{t('language.label')}</span>
              <select
                aria-label={t('language.label')}
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
              >
                <option value="en">{t('language.english')}</option>
                <option value="de">{t('language.german')}</option>
              </select>
            </label>

            <a
              aria-label={t('github.open')}
              className="github-ribbon"
              href="https://github.com/tobias74/ble-web-bridge"
              rel="noreferrer"
              target="_blank"
              title={t('github.open')}
            >
              <span className="github-ribbon-label">Fork me on GitHub</span>
              <span className="github-ribbon-compact-label">GitHub</span>
            </a>
          </div>
        </div>
      </header>

      <section className="system-bar" aria-label={t('status.appStatus')}>
        <a className="system-status ble-system-status" href={pageHref('bridge')}>
          <small className="system-status-heading">{t('devices.statusLabel')}</small>
          <span className="system-status-body">
            <strong>{t(hasConnectedDevice ? 'devices.connected' : 'devices.none')}</strong>
          </span>
        </a>

        <div className="system-status bridge-status">
          <small className="system-status-heading">{t('status.transmissionLabel')}</small>
          <div className="system-status-body">
            <span className={`status-dot ${socketState === 'connected' ? ' online' : ''}`} aria-hidden="true" />
            <strong>{statusLabel}</strong>
            <button
              className="system-transmission-button"
              onClick={() => setStreaming((value) => !value)}
              disabled={sessionLoading || !session || socketState !== 'connected'}
              type="button"
            >
              {streaming || !session ? <Pause size={16} /> : <Play size={16} />}
              <span>{streaming || !session ? t('session.pauseShort') : t('session.resumeShort')}</span>
            </button>
          </div>
        </div>

        <div className="session-code" aria-live="polite">
          <small className="system-status-heading">{t('session.codeLabel')}</small>
          <div className="session-code-body">
            <div className="session-code-value">
              <span>{session?.code || '---- ----'}</span>
            </div>
            <div className="session-code-tools">
              <button className="session-code-button" onClick={copySessionCode} disabled={!session?.code} title={t('session.copyCode')} aria-label={t('session.copyCode')}>
                <Copy size={17} aria-hidden="true" />
              </button>
              <button
                className="session-code-button session-regenerate-button"
                onClick={handleRegenerateSession}
                disabled={sessionLoading || !session?.code}
                title={t('session.regenerateHint')}
                aria-label={t('session.regenerate')}
              >
                <RefreshCw size={17} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

      </section>

      {sessionError || warnings.length > 0 ? <div className="system-notices">
          <button
            className="system-notice-dismiss"
            type="button"
            onClick={() => {
              setSessionError('');
              setWarnings([]);
            }}
            aria-label={t('status.dismissNotice')}
            title={t('status.dismissNotice')}
          >
            <X size={16} aria-hidden="true" />
          </button>
          {sessionError ? (
            <div
              className={`error-line${sessionError === 'rate_limited' ? ' is-transient' : ''}`}
              role={sessionError === 'rate_limited' ? 'status' : 'alert'}
            >
              <AlertTriangle size={17} aria-hidden="true" />
              <span>{localizedError(sessionError, t)}</span>
            </div>
          ) : null}

          {warnings.length > 0 ? (
            <div className="warning-list" aria-live="polite">
              {warnings.map((warning) => (
                <div className="warning-line" key={warning.id}>
                  <AlertTriangle size={17} aria-hidden="true" />
                  <span>{warningText(warning.type, warning.reason, plugins, t)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div> : null}

      {page === 'bridge' ? <section className="workspace">
        <div className="panel device-workflow-panel">
          <section
            className={`device-connection-state ${hasConnectedDevice ? 'is-connected' : 'is-disconnected'}`}
            aria-label={t('devices.connectTitle')}
          >
            {hasConnectedDevice ? <>
              <div className="device-connection-icon" aria-hidden="true">
                <Check size={22} />
              </div>

              <div className="device-connection-copy">
                <strong>{t('devices.connected')}</strong>
                <span>{t('devices.connectedHint')}</span>
              </div>

              <button
                className="secondary-button is-disconnect device-connect-button"
                onClick={disconnectConnectedDevices}
                type="button"
              >
                <Unplug size={18} aria-hidden="true" />
                <span>{t('devices.disconnectAction')}</span>
              </button>
            </> : (
              <button
                className="primary-button device-connect-button"
                disabled={deviceConnectionInProgress}
                onClick={() => setDeviceConnectionDialogVisible(true)}
                type="button"
              >
                <span>{t(deviceConnectionInProgress
                  ? 'devices.connectingAction'
                  : 'devices.connectAction')}</span>
              </button>
            )}

            {deviceError ? <div className="error-line">{localizedError(deviceError, t)}</div> : null}
          </section>

          {hasConnectedDevice ? <section className={`workflow-section metric-workflow${controlTargets.length > 0 ? ' has-trainer-control' : ''}`}>
            <div className="measurement-column" aria-labelledby="metric-routing-title">
              <div className="workflow-section-head">
                <h2 id="metric-routing-title">{t('metrics.routingTitle')}</h2>
              </div>

              <MetricRoutingPanel
                rows={metricSelectionRows}
                onChange={handleMetricSourceChange}
              />
            </div>

            <RemoteControlPanel
              capabilities={remoteControlCapabilities}
              commands={recentCommands}
              onChange={handleRemoteControlPermissionChange}
              onTargetChange={setSelectedControlTargetId}
              options={remoteControlOptions}
              permissions={remoteControlPermissions}
              plugins={plugins}
              selectedTarget={activeControlTarget}
              targets={controlTargets}
            />
          </section> : null}
        </div>

        {recentCommands.length > 0
          ? <CommandHistoryPanel commands={recentCommands} plugins={plugins} />
          : null}
      </section> : <InformationPage page={page} />}

      <DeviceConnectionDialog
        displayAllDevices={displayAllDevices}
        isVisible={page === 'bridge' && isDeviceConnectionDialogVisible}
        onCancel={() => setDeviceConnectionDialogVisible(false)}
        onDisplayAllDevicesChange={setDisplayAllDevices}
        onScan={handleScanDevice}
        onServiceChange={handleDiscoveryServiceToggle}
        selectedServices={selectedDiscoveryServices}
        services={discoveryServices}
      />

      <PrivacyConsentDialog
        isVisible={isPrivacyConsentVisible}
        onAcceptAll={() => savePrivacyConsent({ rememberSettings: true, trackingAdvertising: true })}
        onAcceptSelected={savePrivacyConsent}
        onCancel={() => setPrivacyConsentVisible(false)}
        onDeclineAll={() => savePrivacyConsent({ rememberSettings: false, trackingAdvertising: false })}
        selectedRememberSettings={privacyConsent.rememberSettings}
        selectedTrackingAdvertising={privacyConsent.trackingAdvertising}
      />
    </main>
  );
}

function DeviceConnectionDialog({
  displayAllDevices,
  isVisible,
  onCancel,
  onDisplayAllDevicesChange,
  onScan,
  onServiceChange,
  selectedServices,
  services
}) {
  const { t } = useI18n();
  const dialogRef = useRef(null);
  const hasSelectedServices = selectedDiscoveryServiceIds(selectedServices, services).length > 0;

  useEffect(() => {
    if (!isVisible) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    globalThis.document?.body?.classList?.add('has-open-dialog');
    globalThis.document?.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();

    return () => {
      globalThis.document?.removeEventListener('keydown', handleKeyDown);
      globalThis.document?.body?.classList?.remove('has-open-dialog');
    };
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <div
      className="device-connect-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
      role="presentation"
    >
      <section
        aria-describedby="device-connect-description"
        aria-labelledby="device-connect-dialog-title"
        aria-modal="true"
        className="device-connect-dialog"
        ref={dialogRef}
        role="dialog"
        tabIndex="-1"
      >
        <div className="device-connect-dialog-header">
          <div>
            <h2 id="device-connect-dialog-title">{t('devices.connectAction')}</h2>
            <p id="device-connect-description">{t('devices.connectHint')}</p>
          </div>
          <button
            aria-label={t('devices.closeDialog')}
            className="icon-button device-connect-close"
            onClick={onCancel}
            title={t('devices.closeDialog')}
            type="button"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <fieldset className="device-connect-services">
          <legend>{t('devices.services')}</legend>
          <div className="scan-service-list">
            {services.map((service) => (
              <label className="scan-service-toggle" data-service-key={service.key} key={service.key}>
                <input
                  type="checkbox"
                  checked={selectedServices[service.key] !== false}
                  onChange={(event) => onServiceChange(service.key, event.target.checked)}
                />
                <span>{discoveryServiceLabel(service, t)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="scan-toggle device-connect-scan-all">
          <input
            type="checkbox"
            checked={displayAllDevices}
            onChange={(event) => onDisplayAllDevicesChange(event.target.checked)}
          />
          <span>{t('devices.scanAll')}</span>
        </label>

        <div className="device-connect-dialog-actions">
          <button className="secondary-button" onClick={onCancel} type="button">
            {t('devices.cancel')}
          </button>
          <button
            className="primary-button"
            disabled={!hasSelectedServices}
            onClick={onScan}
            type="button"
          >
            <span>{t('devices.scan')}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function MetricRoutingPanel({ rows, onChange }) {
  const { t } = useI18n();

  if (rows.length === 0) {
    return <div className="metrics-empty empty-line">{t('metrics.none')}</div>;
  }

  return (
    <div className="metric-routing-grid">
      {rows.map((row) => (
        <article
          aria-disabled={row.disabledByAdministrator || undefined}
          className={`metric-routing-card ${row.tone}${row.isDisabled ? ' is-disabled' : ''}${row.disabledByAdministrator ? ' is-admin-disabled' : ''}`}
          data-metric-key={row.key}
          key={row.key}
        >
          <div className="metric-routing-main">
            <div className="metric-routing-label">
              <div className="metric-icon" aria-hidden="true">{metricIcon(row.icon)}</div>
              <span>{row.label}</span>
            </div>
            <strong className="metric-live-value">{row.currentValue}</strong>
          </div>

          <label className="metric-routing-source">
            <span>{t('metrics.gattSource')}</span>
            <select
              aria-label={t('metrics.sourceFor', { metric: row.label })}
              disabled={row.disabledByAdministrator}
              value={row.value}
              onChange={(event) => onChange(row.key, event.target.value)}
            >
              {row.choices.map((choice) => (
                <option value={choice.preferenceKey} key={choice.preferenceKey}>
                  {choice.label}
                </option>
              ))}
            </select>
            {row.disabledByAdministrator ? (
              <small className="metric-privacy-note">{t('metrics.heartRatePrivacyDisabled')}</small>
            ) : null}
          </label>
        </article>
      ))}
    </div>
  );
}

function RemoteControlPanel({
  permissions,
  capabilities,
  commands,
  options,
  onChange,
  onTargetChange,
  plugins,
  selectedTarget,
  targets
}) {
  const { t } = useI18n();
  const normalizedPermissions = normalizeRemoteControlPermissions(permissions, false, options.map((option) => ({
    permissionKey: option.key,
    defaultEnabled: option.tier === 'standard'
  })));
  const standardOptions = options.filter((option) => (
    option.tier === 'standard' && capabilities?.[option.capability]
  ));
  const advancedOptions = options.filter((option) => (
    option.tier === 'advanced' && capabilities?.[option.capability]
  ));

  if (!selectedTarget) {
    return null;
  }

  return (
    <section className="remote-control-panel" aria-labelledby="remote-control-title">
      <div className="remote-control-copy">
        <h3 id="remote-control-title">
          <label className="control-toggle master-toggle remote-control-heading">
            <input
              type="checkbox"
              checked={normalizedPermissions.enabled}
              onChange={(event) => onChange('enabled', event.target.checked)}
            />
            <span>{t('remote.enable')}</span>
          </label>
        </h3>
        <p>{t('remote.description')}</p>
      </div>

      <label className="control-target">
        <span>{t('remote.targetLabel')}</span>
        <select
          aria-label={t('remote.targetLabel')}
          onChange={(event) => onTargetChange(event.target.value)}
          value={selectedTarget.id}
        >
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {controlTargetName(target, t)}
            </option>
          ))}
        </select>
      </label>

      {standardOptions.length > 0 ? (
        <div className="control-grid">
          {standardOptions.map((option) => (
            <RemoteControlToggle
              command={commands.find((entry) => entry.type === option.type)}
              key={option.key}
              option={option}
              permissions={normalizedPermissions}
              plugins={plugins}
              onChange={onChange}
            />
          ))}
        </div>
      ) : null}

      {advancedOptions.length > 0 ? (
        <>
          <div className="control-group-title">{t('remote.advanced')}</div>
          <div className="control-grid advanced-grid">
            {advancedOptions.map((option) => (
              <RemoteControlToggle
                command={commands.find((entry) => entry.type === option.type)}
                key={option.key}
                option={option}
                permissions={normalizedPermissions}
                plugins={plugins}
                onChange={onChange}
              />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function RemoteControlToggle({ command, option, permissions, plugins, onChange }) {
  const { t } = useI18n();

  return (
    <label className="control-toggle sub-toggle">
      <input
        type="checkbox"
        checked={Boolean(permissions[option.key])}
        disabled={!permissions.enabled}
        onChange={(event) => onChange(option.key, event.target.checked)}
      />
      <span className="control-toggle-copy">
        <strong>{option.label}</strong>
        <small>
          {command
            ? `${t('remote.lastReceived')}: ${formatCommandValue(command.command, plugins)} · ${formatCommandStatus(command, t)}`
            : t('remote.notReceived')}
        </small>
      </span>
    </label>
  );
}

function CommandHistoryPanel({ commands, plugins }) {
  const { language, t } = useI18n();

  return (
    <div className="panel commands-panel">
      <div className="panel-title">
        <span>{t('commands.title')}</span>
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
                <span>{formatCommandStatus(entry, t)}</span>
                <time>{formatClock(entry.handledAt || entry.receivedAt, language)}</time>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-line">{t('commands.none')}</div>
      )}
    </div>
  );
}

function createBridgeTelemetry(
  sources,
  selectedMetricSources = {},
  disabledMetricSources = {},
  metricProtocolPriorities = METRIC_PROTOCOL_PRIORITIES,
  runtimeFeatures = DEFAULT_RUNTIME_FEATURES
) {
  const sourceList = sortSources(sources);

  return applyRuntimeFeaturesToTelemetry({
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
  }, runtimeFeatures);
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

function controlTargetName(target, t) {
  const deviceName = target.deviceName || t('devices.unnamed');
  const protocolName = target.protocol === 'ftms'
    ? t('services.fitnessMachine')
    : target.protocolLabel || formatProtocol(target.protocol, t);
  return `${deviceName} · ${protocolName}`;
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

function createMetricSelectionRows(
  sources,
  selectedMetricSources = {},
  disabledMetricSources = {},
  metricProtocolPriorities = METRIC_PROTOCOL_PRIORITIES,
  runtimeFeatures = DEFAULT_RUNTIME_FEATURES,
  t
) {
  const rows = [];

  for (const key of SUMMARY_METRIC_KEYS) {
    const choices = metricSourceChoices(sources, key, disabledMetricSources);

    if (choices.length === 0) {
      continue;
    }

    const defaultSource = selectDefaultSourceForMetric(
      sources,
      key,
      disabledMetricSources,
      metricProtocolPriorities
    );
    const selectedSource = selectSourceForMetric(sources, key, selectedMetricSources, disabledMetricSources, metricProtocolPriorities);
    const selectedPreferenceKey = selectedMetricSources[key];
    const selectedChoice = selectedPreferenceKey
      ? choices.find((source) => sourcePreferenceKey(source) === selectedPreferenceKey)
      : null;
    const defaultPreferenceKey = defaultSource ? sourcePreferenceKey(defaultSource) : '';
    const disabledByAdministrator = !metricEnabledByRuntimeFeatures(key, runtimeFeatures);

    rows.push({
      key,
      icon: metricIconName(key),
      label: valueLabel(key, t),
      tone: metricTone(key),
      value: disabledByAdministrator || selectedPreferenceKey === DISABLED_METRIC_SOURCE_VALUE
        ? DISABLED_METRIC_SOURCE_VALUE
        : selectedChoice && sourcePreferenceKey(selectedChoice) !== defaultPreferenceKey
          ? sourcePreferenceKey(selectedChoice)
          : DEFAULT_METRIC_SOURCE_VALUE,
      isDisabled: disabledByAdministrator || selectedPreferenceKey === DISABLED_METRIC_SOURCE_VALUE,
      disabledByAdministrator,
      currentValue: !disabledByAdministrator && selectedSource ? formatValue(key, selectedSource.values[key]) : '—',
      choices: disabledByAdministrator
        ? [{
            preferenceKey: DISABLED_METRIC_SOURCE_VALUE,
            label: t('metrics.disabledByAdministrator')
          }]
        : [
            ...choices.map((source) => ({
              preferenceKey: sourcePreferenceKey(source) === defaultPreferenceKey
                ? DEFAULT_METRIC_SOURCE_VALUE
                : sourcePreferenceKey(source),
              label: sourcePreferenceKey(source) === defaultPreferenceKey
                ? `${sourceName(source, t)} (${t('metrics.automatic')})`
                : sourceName(source, t)
            })),
            {
              preferenceKey: DISABLED_METRIC_SOURCE_VALUE,
              label: t('metrics.disabled')
            }
          ]
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

function sourceName(source, t) {
  const protocol = gattServiceNameForProtocol(source.protocol, t);
  const device = source.deviceName || source.deviceId || t('sources.device');
  return `${device} · ${protocol}`;
}

function gattServiceNameForProtocol(protocol, t) {
  const serviceKeys = {
    'ftms.cross_trainer': 'services.fitnessMachine',
    'ftms.step_climber': 'services.fitnessMachine',
    'ftms.stair_climber': 'services.fitnessMachine',
    'ftms.rower': 'services.fitnessMachine',
    'ftms.indoor_bike': 'services.fitnessMachine',
    'ftms.treadmill': 'services.fitnessMachine',
    cycling_power: 'services.cyclingPower',
    cycling_speed_cadence: 'services.cyclingSpeedCadence',
    heart_rate: 'services.heartRate',
    running_speed_cadence: 'services.runningSpeedCadence'
  };
  const serviceKey = serviceKeys[protocol];
  return serviceKey ? t(serviceKey) : formatProtocol(protocol, t);
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

function valueLabel(key, t) {
  return t(`values.${key}`, {}, key);
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

  if (command.type === 'bike.targetSpeed') {
    return formatMetric(command.targetSpeedMps * 3.6, 'km/h', 1);
  }

  if (command.type === 'bike.inclination') {
    return formatMetric(command.inclinePct, '%', 1);
  }

  if (command.type === 'bike.grade') {
    const values = [formatMetric(command.gradePct, '%', 1)];
    if (Number.isFinite(command.windSpeedMps)) {
      values.push(formatMetric(command.windSpeedMps, 'm/s', 1));
    }
    return values.join(' · ');
  }

  if (command.type === 'bike.resistance') {
    return formatMetric(command.resistanceLevel, '', 0).trim();
  }

  if (command.type === 'bike.targetPower') {
    return formatMetric(command.targetPowerW, 'W', 0);
  }

  if (command.type === 'bike.targetHeartRate') {
    return formatMetric(command.targetHeartBpm, 'bpm', 0);
  }

  if (command.type === 'bike.targetEnergy') {
    return formatMetric(command.targetEnergyKcal, 'kcal', 0);
  }

  if (command.type === 'bike.targetSteps') {
    return formatMetric(command.targetSteps, '', 0);
  }

  if (command.type === 'bike.targetStrides') {
    return formatMetric(command.targetStrides, '', 0);
  }

  if (command.type === 'bike.targetDistance') {
    return formatMetric(command.targetDistanceM, 'm', 0);
  }

  if (command.type === 'bike.targetTrainingTime') {
    return formatDuration(command.targetTrainingTimeS);
  }

  if (command.type === 'bike.targetTimeTwoHeartRateZones' || command.type === 'bike.targetTimeThreeHeartRateZones' || command.type === 'bike.targetTimeFiveHeartRateZones') {
    return Array.isArray(command.zoneTimesS) ? command.zoneTimesS.map(formatDuration).join(' · ') : '--';
  }

  if (command.type === 'bike.wheelCircumference') {
    return formatMetric(command.wheelCircumferenceMm, 'mm', 1);
  }

  if (command.type === 'bike.spinDown') {
    return command.spinDownAction || '--';
  }

  if (command.type === 'bike.targetCadence') {
    return formatMetric(command.targetCadenceRpm, 'rpm', 1);
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

function formatCommandStatus(entry, t) {
  if (entry.status === 'received') {
    return t('commands.received');
  }

  if (entry.status === 'applied') {
    return t('commands.applied');
  }

  if (entry.reason) {
    return `${t(`commands.${entry.status}`, {}, entry.status)}: ${entry.reason}`;
  }

  return entry.status ? t(`commands.${entry.status}`, {}, entry.status) : t('commands.unknown');
}

function warningText(type, reason, plugins = [], t) {
  const family = commandFamilyLabel(type, plugins, t);

  if (reason === 'treadmill_control_disabled') {
    return t('warnings.blocked', { family });
  }

  if (reason === 'permission_disabled' || reason === 'bike_control_not_enabled') {
    return t('warnings.permissionDisabled', { family });
  }

  if (reason === 'capability_not_supported' || reason === 'bike_control_not_supported') {
    return t('warnings.capabilityUnsupported', { family });
  }

  if (reason === 'multiple_bike_control_targets') {
    return t('warnings.multipleTargets', { family });
  }

  if (reason === 'no_device_connected') {
    return t('warnings.noDevice', { family });
  }

  if (reason === 'command_expired') {
    return t('warnings.expired', { family });
  }

  return t('warnings.reason', { family, reason: reason || t('commands.unknown') });
}

function commandFamilyLabel(type, plugins = [], t) {
  const labelKeys = {
    'bike.targetSpeed': 'commands.targetSpeed',
    'bike.inclination': 'commands.inclination',
    'bike.grade': 'commands.grade',
    'bike.resistance': 'commands.resistance',
    'bike.targetPower': 'commands.targetPower',
    'bike.targetHeartRate': 'commands.targetHeartRate',
    'bike.targetEnergy': 'commands.targetEnergy',
    'bike.targetSteps': 'commands.targetSteps',
    'bike.targetStrides': 'commands.targetStrides',
    'bike.targetDistance': 'commands.targetDistance',
    'bike.targetTrainingTime': 'commands.targetTrainingTime',
    'bike.targetTimeTwoHeartRateZones': 'commands.targetTimeTwoHeartRateZones',
    'bike.targetTimeThreeHeartRateZones': 'commands.targetTimeThreeHeartRateZones',
    'bike.targetTimeFiveHeartRateZones': 'commands.targetTimeFiveHeartRateZones',
    'bike.wheelCircumference': 'commands.wheelCircumference',
    'bike.spinDown': 'commands.spinDown',
    'bike.targetCadence': 'commands.targetCadence',
    'treadmill.speed': 'commands.treadmill',
    'treadmill.incline': 'commands.treadmill'
  };

  return labelKeys[type]
    ? t(labelKeys[type])
    : pluginCommandLabel(type, plugins) || t('commands.generic');
}

function formatProtocol(protocol, t) {
  const value = String(protocol || 'unknown');
  const labelKeys = {
    'FTMS Cross Trainer': 'protocol.ftms.cross_trainer',
    'FTMS Step Climber': 'protocol.ftms.step_climber',
    'FTMS Stair Climber': 'protocol.ftms.stair_climber',
    'FTMS Rower': 'protocol.ftms.rower',
    'FTMS Indoor Bike': 'protocol.ftms.indoor_bike',
    'FTMS Treadmill': 'protocol.ftms.treadmill',
    'Cycling Power': 'protocol.cycling_power',
    'Cycling Speed/Cadence': 'protocol.cycling_speed_cadence',
    'Heart Rate': 'protocol.heart_rate',
    'Running Speed/Cadence': 'protocol.running_speed_cadence'
  };
  const fallback = value.replaceAll('_', ' ').replaceAll('.', ' ');
  return t(labelKeys[value] || `protocol.${value}`, {}, fallback);
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

function formatClock(timestampMs, language = 'en') {
  if (!Number.isFinite(timestampMs)) {
    return '--';
  }

  return new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(timestampMs));
}

function permissionLabel(command, t) {
  const builtInKeys = {
    targetSpeed: 'permissions.targetSpeed',
    inclination: 'permissions.inclination',
    grade: 'permissions.grade',
    resistance: 'permissions.resistance',
    targetPower: 'permissions.targetPower',
    targetHeartRate: 'permissions.targetHeartRate',
    targetEnergy: 'permissions.targetEnergy',
    targetSteps: 'permissions.targetSteps',
    targetStrides: 'permissions.targetStrides',
    targetDistance: 'permissions.targetDistance',
    targetTrainingTime: 'permissions.targetTrainingTime',
    targetTimeTwoHeartRateZones: 'permissions.targetTimeTwoHeartRateZones',
    targetTimeThreeHeartRateZones: 'permissions.targetTimeThreeHeartRateZones',
    targetTimeFiveHeartRateZones: 'permissions.targetTimeFiveHeartRateZones',
    wheelCircumference: 'permissions.wheelCircumference',
    spinDown: 'permissions.spinDown',
    targetCadence: 'permissions.targetCadence'
  };
  const key = builtInKeys[command.permissionKey];
  return key ? t(key) : command.permissionLabel;
}

function discoveryServiceLabel(service, t) {
  return t(`services.${service.key}`, {}, service.label);
}

function localizedError(error, t) {
  const value = String(error || '');
  const exactKeys = {
    invalid_server_message: 'errors.invalid_server_message',
    rate_limited: 'errors.rateLimited',
    websocket_error: 'errors.websocket_error',
    'Web Bluetooth is not available in this browser': 'errors.webBluetoothUnavailable',
    'No supported BLE telemetry characteristic found': 'errors.noSupportedCharacteristic'
  };

  if (exactKeys[value]) {
    return t(exactKeys[value]);
  }

  const sessionFailure = value.match(/^Session creation failed \(([^)]+)\)$/);
  if (sessionFailure) {
    return t('errors.sessionCreationFailed', { status: sessionFailure[1] });
  }

  return value;
}

function shortId(value) {
  return String(value).slice(0, 12);
}
