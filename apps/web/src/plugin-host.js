export function getPluginDiscoveryServices(plugins = []) {
  return plugins.flatMap((plugin) => plugin?.manifest?.discoveryServices || []);
}

export function getPluginCommandDefinitions(plugins = []) {
  return plugins.flatMap((plugin) => plugin?.manifest?.commands || []);
}

export function getPluginMetricPriorities(plugins = []) {
  const priorities = {};

  for (const plugin of plugins) {
    for (const protocol of plugin?.manifest?.protocols || []) {
      for (const [metric, priority] of Object.entries(protocol.metricPriorities || {})) {
        priorities[metric] ||= {};
        priorities[metric][protocol.id] = priority;
      }
    }
  }

  return priorities;
}

export async function attachProtocolPlugins({
  plugins = [],
  gattServer,
  selectedServices,
  device,
  deviceId,
  deviceKey,
  deviceName,
  deviceInfo,
  onTelemetry,
  onPluginError
}) {
  const connections = [];
  const selected = new Set(selectedServices || []);

  for (const plugin of plugins) {
    const services = plugin?.manifest?.discoveryServices || [];
    if (!services.some((service) => selected.has(service.service))) {
      continue;
    }

    const sourceIds = new Set();

    try {
      const connection = await plugin.attach({
        gattServer,
        device,
        deviceInfo: { ...deviceInfo },
        emitTelemetry(payload = {}) {
          const protocol = String(payload.protocol || '');
          const declared = (plugin.manifest.protocols || []).some((entry) => entry.id === protocol);
          if (!declared) {
            throw new Error(`plugin_undeclared_protocol:${protocol}`);
          }

          const sourceId = `${deviceId}:${protocol}`;
          sourceIds.add(sourceId);
          onTelemetry?.({
            sourceId,
            deviceId,
            deviceKey,
            deviceName,
            protocol,
            connected: payload.connected !== false,
            timestampMs: Date.now(),
            values: payload.values || {},
            info: { ...deviceInfo, ...(payload.info || {}) },
            raw: payload.raw || {}
          });
        }
      });

      if (connection) {
        connections.push({ plugin, connection, sourceIds });
      }
    } catch (error) {
      onPluginError?.(plugin?.manifest?.id || 'unknown', error);
    }
  }

  return connections;
}

export function getPluginCapabilities(connections = []) {
  const capabilities = {};
  for (const entry of connections) {
    Object.assign(capabilities, entry.connection?.getCapabilities?.() || entry.connection?.capabilities || {});
  }
  return capabilities;
}

export function pluginConnectionForCommand(connections, command) {
  return connections.find(({ plugin, connection }) => (
    connection?.handlesCommand?.(command) || plugin?.manifest?.handledCommandTypes?.includes(command?.type)
  ));
}

export async function applyPluginCommand(entry, command, options = {}) {
  if (!entry?.connection?.applyCommand) {
    return createCommandAck(command, 'blocked', 'unsupported_command_type');
  }

  if (command?.expiresAt && Date.now() > command.expiresAt) {
    return createCommandAck(command, 'blocked', 'command_expired');
  }

  const descriptor = (entry.plugin.manifest.commands || []).find((candidate) => candidate.type === command?.type);
  const permissions = options.remoteControlPermissions || {};
  const capabilities = entry.connection.getCapabilities?.() || entry.connection.capabilities || {};

  if (descriptor) {
    if (!permissions.enabled || !permissions[descriptor.permissionKey]) {
      return createCommandAck(command, 'blocked', 'permission_disabled');
    }
    if (!capabilities[descriptor.capability]) {
      return createCommandAck(command, 'blocked', 'capability_not_supported');
    }
  }

  try {
    return await entry.connection.applyCommand(command, options);
  } catch (error) {
    return createCommandAck(command, 'failed', error.message || 'ble_write_failed');
  }
}

export function disconnectProtocolPlugins(connections = []) {
  for (const entry of connections) {
    try {
      entry.connection?.disconnect?.();
    } catch {
      // One plugin must not prevent cleanup of the remaining device connections.
    }
  }
}

export function markPluginSourcesDisconnected(connections = [], onTelemetry, deviceContext = {}) {
  for (const entry of connections) {
    for (const sourceId of entry.sourceIds) {
      const protocol = sourceId.slice(sourceId.indexOf(':') + 1);
      onTelemetry?.({
        sourceId,
        ...deviceContext,
        protocol,
        connected: false,
        timestampMs: Date.now(),
        values: {},
        info: deviceContext.info || {},
        raw: {}
      });
    }
  }
}

export function formatPluginCommand(command, plugins = []) {
  const plugin = plugins.find((candidate) => (
    candidate?.manifest?.commands?.some((descriptor) => descriptor.type === command?.type)
  ));
  return plugin?.formatCommand?.(command) || '';
}

export function pluginCommandLabel(type, plugins = []) {
  for (const plugin of plugins) {
    const descriptor = plugin?.manifest?.commands?.find((candidate) => candidate.type === type);
    if (descriptor) {
      return descriptor.label;
    }
  }
  return '';
}

function createCommandAck(command, status, reason, applied) {
  return {
    commandId: command?.commandId,
    type: command?.type,
    status,
    reason,
    applied
  };
}
