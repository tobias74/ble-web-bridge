export function collectControlTargets(devices, deviceHandles) {
  return devices
    .filter((device) => device.status === 'connected' && deviceHandles.has(device.id))
    .flatMap((device) => {
      const handle = deviceHandles.get(device.id);
      return (handle?.getControlTargets?.() || []).map((target) => ({
        ...target,
        deviceId: device.id,
        deviceKey: target.deviceKey || handle.deviceKey || device.deviceKey || device.id,
        deviceName: target.deviceName || handle.name || device.name
      }));
    })
    .sort(compareControlTargets);
}

export function selectControlTarget(targets, selectedTargetId = '') {
  return targets.find((target) => target.id === selectedTargetId) || targets[0] || null;
}

export function controlTargetSupportsCommand(target, commandDefinition) {
  return Boolean(
    target
    && commandDefinition?.capability
    && target.capabilities?.[commandDefinition.capability]
  );
}

function compareControlTargets(left, right) {
  return [left.deviceName || '', left.protocolLabel || '', left.id || '']
    .join('\u0000')
    .localeCompare(
      [right.deviceName || '', right.protocolLabel || '', right.id || ''].join('\u0000'),
      undefined,
      { numeric: true, sensitivity: 'base' }
    );
}
