import {
  applyPluginCommand,
  attachProtocolPlugins,
  disconnectProtocolPlugins,
  getPluginCapabilities,
  getPluginDiscoveryServices,
  markPluginSourcesDisconnected,
  pluginConnectionForCommand
} from './plugin-host.js';

const FITNESS_MACHINE_SERVICE = '00001826-0000-1000-8000-00805f9b34fb';
const CROSS_TRAINER_DATA = '00002ace-0000-1000-8000-00805f9b34fb';
const STEP_CLIMBER_DATA = '00002acf-0000-1000-8000-00805f9b34fb';
const STAIR_CLIMBER_DATA = '00002ad0-0000-1000-8000-00805f9b34fb';
const ROWER_DATA = '00002ad1-0000-1000-8000-00805f9b34fb';
const INDOOR_BIKE_DATA = '00002ad2-0000-1000-8000-00805f9b34fb';
const TREADMILL_DATA = '00002acd-0000-1000-8000-00805f9b34fb';
const FITNESS_MACHINE_FEATURE = '00002acc-0000-1000-8000-00805f9b34fb';
const FITNESS_MACHINE_CONTROL_POINT = '00002ad9-0000-1000-8000-00805f9b34fb';
const SUPPORTED_SPEED_RANGE = '00002ad4-0000-1000-8000-00805f9b34fb';
const SUPPORTED_INCLINATION_RANGE = '00002ad5-0000-1000-8000-00805f9b34fb';
const SUPPORTED_RESISTANCE_LEVEL_RANGE = '00002ad6-0000-1000-8000-00805f9b34fb';
const SUPPORTED_HEART_RATE_RANGE = '00002ad7-0000-1000-8000-00805f9b34fb';
const SUPPORTED_POWER_RANGE = '00002ad8-0000-1000-8000-00805f9b34fb';
const FTMS_RESPONSE_CODE = 0x80;
const FTMS_RESULT_SUCCESS = 0x01;
const FTMS_CONTROL_RESPONSE_TIMEOUT_MS = 3000;
export const DEFAULT_REMOTE_CONTROL_PERMISSIONS = {
  enabled: false,
  targetSpeed: false,
  inclination: false,
  grade: true,
  resistance: true,
  targetPower: false,
  targetHeartRate: false,
  targetEnergy: false,
  targetSteps: false,
  targetStrides: false,
  targetDistance: false,
  targetTrainingTime: false,
  targetTimeTwoHeartRateZones: false,
  targetTimeThreeHeartRateZones: false,
  targetTimeFiveHeartRateZones: false,
  wheelCircumference: false,
  spinDown: false,
  targetCadence: false
};

export const STANDARD_COMMAND_DEFINITIONS = [
  {
    type: 'bike.targetSpeed',
    label: 'Target speed command',
    permissionKey: 'targetSpeed',
    permissionLabel: 'Target speed',
    capability: 'canWriteTargetSpeed',
    tier: 'advanced',
    defaultEnabled: false
  },
  {
    type: 'bike.inclination',
    label: 'Inclination command',
    permissionKey: 'inclination',
    permissionLabel: 'Inclination',
    capability: 'canWriteInclination',
    tier: 'advanced',
    defaultEnabled: false
  },
  {
    type: 'bike.grade',
    label: 'Indoor bike simulation command',
    permissionKey: 'grade',
    permissionLabel: 'Indoor bike simulation',
    capability: 'canWriteGrade',
    tier: 'standard',
    defaultEnabled: true
  },
  {
    type: 'bike.resistance',
    label: 'Resistance command',
    permissionKey: 'resistance',
    permissionLabel: 'Resistance',
    capability: 'canWriteResistance',
    tier: 'standard',
    defaultEnabled: true
  },
  {
    type: 'bike.targetPower',
    label: 'Target power command',
    permissionKey: 'targetPower',
    permissionLabel: 'Target power',
    capability: 'canWriteTargetPower',
    tier: 'standard',
    defaultEnabled: false
  },
  {
    type: 'bike.targetHeartRate',
    label: 'Target heart rate command',
    permissionKey: 'targetHeartRate',
    permissionLabel: 'Target heart rate',
    capability: 'canWriteTargetHeartRate',
    tier: 'advanced',
    defaultEnabled: false
  },
  {
    type: 'bike.targetEnergy',
    label: 'Targeted expended energy command',
    permissionKey: 'targetEnergy',
    permissionLabel: 'Targeted expended energy',
    capability: 'canWriteTargetEnergy',
    tier: 'advanced',
    defaultEnabled: false
  },
  {
    type: 'bike.targetSteps',
    label: 'Targeted number of steps command',
    permissionKey: 'targetSteps',
    permissionLabel: 'Targeted number of steps',
    capability: 'canWriteTargetSteps',
    tier: 'advanced',
    defaultEnabled: false
  },
  {
    type: 'bike.targetStrides',
    label: 'Targeted number of strides command',
    permissionKey: 'targetStrides',
    permissionLabel: 'Targeted number of strides',
    capability: 'canWriteTargetStrides',
    tier: 'advanced',
    defaultEnabled: false
  },
  {
    type: 'bike.targetDistance',
    label: 'Targeted distance command',
    permissionKey: 'targetDistance',
    permissionLabel: 'Targeted distance',
    capability: 'canWriteTargetDistance',
    tier: 'advanced',
    defaultEnabled: false
  },
  {
    type: 'bike.targetTrainingTime',
    label: 'Targeted training time command',
    permissionKey: 'targetTrainingTime',
    permissionLabel: 'Targeted training time',
    capability: 'canWriteTargetTrainingTime',
    tier: 'advanced',
    defaultEnabled: false
  },
  {
    type: 'bike.targetTimeTwoHeartRateZones',
    label: 'Targeted time in two heart rate zones command',
    permissionKey: 'targetTimeTwoHeartRateZones',
    permissionLabel: 'Time in two heart rate zones',
    capability: 'canWriteTargetTimeTwoHeartRateZones',
    tier: 'advanced',
    defaultEnabled: false
  },
  {
    type: 'bike.targetTimeThreeHeartRateZones',
    label: 'Targeted time in three heart rate zones command',
    permissionKey: 'targetTimeThreeHeartRateZones',
    permissionLabel: 'Time in three heart rate zones',
    capability: 'canWriteTargetTimeThreeHeartRateZones',
    tier: 'advanced',
    defaultEnabled: false
  },
  {
    type: 'bike.targetTimeFiveHeartRateZones',
    label: 'Targeted time in five heart rate zones command',
    permissionKey: 'targetTimeFiveHeartRateZones',
    permissionLabel: 'Time in five heart rate zones',
    capability: 'canWriteTargetTimeFiveHeartRateZones',
    tier: 'advanced',
    defaultEnabled: false
  },
  {
    type: 'bike.wheelCircumference',
    label: 'Wheel circumference command',
    permissionKey: 'wheelCircumference',
    permissionLabel: 'Wheel circumference',
    capability: 'canWriteWheelCircumference',
    tier: 'advanced',
    defaultEnabled: false
  },
  {
    type: 'bike.spinDown',
    label: 'Spin down control command',
    permissionKey: 'spinDown',
    permissionLabel: 'Spin down calibration',
    capability: 'canWriteSpinDown',
    tier: 'advanced',
    defaultEnabled: false
  },
  {
    type: 'bike.targetCadence',
    label: 'Targeted cadence command',
    permissionKey: 'targetCadence',
    permissionLabel: 'Targeted cadence',
    capability: 'canWriteTargetCadence',
    tier: 'standard',
    defaultEnabled: false
  }
];

const COMMAND_PERMISSION_KEYS = Object.fromEntries(STANDARD_COMMAND_DEFINITIONS.map((command) => [
  command.type,
  command.permissionKey
]));

const COMMAND_CAPABILITY_KEYS = Object.fromEntries(STANDARD_COMMAND_DEFINITIONS.map((command) => [
  command.permissionKey,
  command.capability
]));

const CYCLING_POWER_SERVICE = '00001818-0000-1000-8000-00805f9b34fb';
const CYCLING_POWER_MEASUREMENT = '00002a63-0000-1000-8000-00805f9b34fb';

const CYCLING_SPEED_CADENCE_SERVICE = '00001816-0000-1000-8000-00805f9b34fb';
const CSC_MEASUREMENT = '00002a5b-0000-1000-8000-00805f9b34fb';

const HEART_RATE_SERVICE = '0000180d-0000-1000-8000-00805f9b34fb';
const HEART_RATE_MEASUREMENT = '00002a37-0000-1000-8000-00805f9b34fb';

const RUNNING_SPEED_CADENCE_SERVICE = '00001814-0000-1000-8000-00805f9b34fb';
const RSC_MEASUREMENT = '00002a53-0000-1000-8000-00805f9b34fb';

const BATTERY_SERVICE = '0000180f-0000-1000-8000-00805f9b34fb';
const BATTERY_LEVEL = '00002a19-0000-1000-8000-00805f9b34fb';

const DEVICE_INFORMATION_SERVICE = '0000180a-0000-1000-8000-00805f9b34fb';
const MANUFACTURER_NAME_STRING = '00002a29-0000-1000-8000-00805f9b34fb';
const MODEL_NUMBER_STRING = '00002a24-0000-1000-8000-00805f9b34fb';
const FIRMWARE_REVISION_STRING = '00002a26-0000-1000-8000-00805f9b34fb';
const HARDWARE_REVISION_STRING = '00002a27-0000-1000-8000-00805f9b34fb';
const SOFTWARE_REVISION_STRING = '00002a28-0000-1000-8000-00805f9b34fb';

export const BLE_DISCOVERY_SERVICES = [
  { key: 'fitnessMachine', label: 'Fitness Machine Service (FTMS)', service: FITNESS_MACHINE_SERVICE },
  { key: 'cyclingPower', label: 'Cycling Power Service', service: CYCLING_POWER_SERVICE },
  { key: 'cyclingSpeedCadence', label: 'Cycling Speed and Cadence Service', service: CYCLING_SPEED_CADENCE_SERVICE },
  { key: 'heartRate', label: 'Heart Rate Service', service: HEART_RATE_SERVICE },
  { key: 'runningSpeedCadence', label: 'Running Speed and Cadence Service', service: RUNNING_SPEED_CADENCE_SERVICE }
];

const DISCOVERY_SERVICES = [
  FITNESS_MACHINE_SERVICE,
  CYCLING_POWER_SERVICE,
  CYCLING_SPEED_CADENCE_SERVICE,
  HEART_RATE_SERVICE,
  RUNNING_SPEED_CADENCE_SERVICE
];

export function buildBluetoothRequestOptions(options = {}) {
  const services = normalizeDiscoveryServices(options.services, options.plugins);
  const optionalServices = createOptionalServices(services, options.plugins);

  if (options.acceptAllDevices) {
    return {
      acceptAllDevices: true,
      optionalServices
    };
  }

  return {
    filters: services.map((service) => ({ services: [service] })),
    optionalServices
  };
}

export async function connectBleDevice(deviceId, onTelemetry, onStatus, discoveryOptions = {}) {
  if (!navigator.bluetooth) {
    throw new Error('Web Bluetooth is not available in this browser');
  }

  onStatus?.('selecting');
  const plugins = discoveryOptions.plugins || [];
  const selectedServices = normalizeDiscoveryServices(discoveryOptions.services, plugins);
  const device = await navigator.bluetooth.requestDevice(buildBluetoothRequestOptions(discoveryOptions));

  let subscriptions = [];
  let pluginConnections = [];
  let deviceInfo = {};
  const controlState = createControlState();
  const deviceName = device.name || 'BLE device';
  const deviceKey = device.id || deviceName || deviceId;
  const disconnectHandler = () => {
    cleanupFtmsControl(controlState, new Error('device_disconnected'));
    onStatus?.('disconnected');
    for (const subscription of subscriptions) {
      onTelemetry?.(createSourcePayload({
        deviceId,
        deviceKey,
        deviceName,
        protocol: subscription.protocol,
        sourceId: subscription.sourceId,
        connected: false,
        info: deviceInfo
      }));
    }
    markPluginSourcesDisconnected(pluginConnections, onTelemetry, {
      deviceId,
      deviceKey,
      deviceName,
      info: deviceInfo
    });
  };

  device.addEventListener('gattserverdisconnected', disconnectHandler);

  onStatus?.('connecting');
  const server = await device.gatt.connect();
  deviceInfo = await readDeviceInfo(server);
  subscriptions = await subscribeSupportedCharacteristics(server, controlState, {
    deviceId,
    deviceKey,
    deviceName,
    info: deviceInfo,
    onTelemetry: (telemetry) => onTelemetry?.(telemetry)
  }, selectedServices);

  pluginConnections = await attachProtocolPlugins({
    plugins,
    gattServer: server,
    selectedServices,
    device,
    deviceId,
    deviceKey,
    deviceName,
    deviceInfo,
    onTelemetry,
    onPluginError(pluginId, error) {
      console.warn(`BLE plugin ${pluginId} could not attach`, error);
    }
  });

  if (subscriptions.length === 0 && pluginConnections.length === 0) {
    device.removeEventListener('gattserverdisconnected', disconnectHandler);
    if (device.gatt.connected) {
      device.gatt.disconnect();
    }
    throw new Error('No supported BLE telemetry characteristic found');
  }

  onStatus?.('connected');

  return {
    id: deviceId,
    deviceKey,
    name: device.name || 'BLE device',
    protocols: [
      ...subscriptions.map((subscription) => subscription.label),
      ...pluginConnections.flatMap(({ plugin }) => plugin.manifest.protocols.map((protocol) => protocol.label))
    ],
    capabilities: getCombinedCapabilities(controlState, pluginConnections),
    getCapabilities() {
      return getCombinedCapabilities(controlState, pluginConnections);
    },
    getControlTargets() {
      return createDeviceControlTargets({
        deviceId,
        deviceKey,
        deviceName: device.name || 'BLE device'
      }, controlState, pluginConnections);
    },
    applyCommand(command, options = {}) {
      const pluginConnection = pluginConnectionForCommand(pluginConnections, command);
      if (pluginConnection) {
        return applyPluginCommand(pluginConnection, command, options);
      }
      return applyBleCommand(command, controlState, options);
    },
    disconnect() {
      for (const subscription of subscriptions) {
        subscription.characteristic.removeEventListener('characteristicvaluechanged', subscription.handler);
      }

      disconnectProtocolPlugins(pluginConnections);
      cleanupFtmsControl(controlState, new Error('device_disconnected'));
      device.removeEventListener('gattserverdisconnected', disconnectHandler);
      if (device.gatt.connected) {
        device.gatt.disconnect();
      }
    }
  };
}

export function createDeviceControlTargets(device, controlState, pluginConnections = []) {
  const targets = [];
  const ftmsCapabilities = getControlCapabilities(controlState);

  if (ftmsCapabilities.canWriteBike) {
    targets.push({
      id: `${device.deviceKey}::ftms`,
      deviceId: device.deviceId,
      deviceKey: device.deviceKey,
      deviceName: device.deviceName,
      protocol: 'ftms',
      protocolLabel: 'Fitness Machine Service (FTMS)',
      capabilities: ftmsCapabilities,
      applyCommand(command, options = {}) {
        return applyBleCommand(command, controlState, options);
      }
    });
  }

  for (const entry of pluginConnections) {
    const capabilities = entry.connection?.getCapabilities?.() || entry.connection?.capabilities || {};
    const commandTypes = new Set(entry.plugin?.manifest?.handledCommandTypes || []);
    const commandDefinitions = [
      ...STANDARD_COMMAND_DEFINITIONS,
      ...(entry.plugin?.manifest?.commands || [])
    ];
    const canReceiveControls = Boolean(
      entry.connection?.applyCommand
      && commandDefinitions.some((definition) => (
        commandTypes.has(definition.type) && capabilities[definition.capability]
      ))
    );

    if (!canReceiveControls) {
      continue;
    }

    const protocols = entry.plugin?.manifest?.protocols || [];
    const protocol = protocols.length === 1 ? protocols[0] : null;
    const protocolId = protocol?.id || entry.plugin.manifest.id;
    targets.push({
      id: `${device.deviceKey}::${protocolId}`,
      deviceId: device.deviceId,
      deviceKey: device.deviceKey,
      deviceName: device.deviceName,
      protocol: protocolId,
      protocolLabel: protocol?.label || entry.plugin.manifest.label || protocolId,
      capabilities,
      applyCommand(command, options = {}) {
        return applyPluginCommand(entry, command, options);
      }
    });
  }

  return targets;
}

export const connectFtmsDevice = connectBleDevice;

function normalizeDiscoveryServices(services, plugins = []) {
  const configuredServices = [
    ...DISCOVERY_SERVICES,
    ...getPluginDiscoveryServices(plugins).map((service) => service.service)
  ];

  if (!Array.isArray(services) || services.length === 0) {
    return configuredServices;
  }

  const supported = new Set(configuredServices);
  const normalized = services.filter((service) => supported.has(service));
  return normalized.length > 0 ? [...new Set(normalized)] : configuredServices;
}

function createOptionalServices(services, plugins = []) {
  return [...new Set([
    ...services,
    ...getPluginDiscoveryServices(plugins).map((service) => service.service),
    BATTERY_SERVICE,
    DEVICE_INFORMATION_SERVICE
  ])];
}

async function subscribeSupportedCharacteristics(server, controlState, context, selectedServices = DISCOVERY_SERVICES) {
  const subscriptions = [];
  const info = { ...context.info };
  const serviceSet = new Set(selectedServices);
  const batteryPct = await readBatteryLevel(server);
  if (Number.isFinite(batteryPct)) {
    info.batteryPct = batteryPct;
  }

  if (serviceSet.has(FITNESS_MACHINE_SERVICE)) {
    await subscribeFtms(server, controlState, context, info, subscriptions);
  }

  if (serviceSet.has(CYCLING_POWER_SERVICE)) {
    await subscribeCharacteristic(server, {
      serviceUuid: CYCLING_POWER_SERVICE,
      characteristicUuid: CYCLING_POWER_MEASUREMENT,
      label: 'Cycling Power',
      protocol: 'cycling_power',
      parser: parseCyclingPowerMeasurement,
      context,
      info,
      subscriptions
    });
  }

  if (serviceSet.has(CYCLING_SPEED_CADENCE_SERVICE)) {
    await subscribeCharacteristic(server, {
      serviceUuid: CYCLING_SPEED_CADENCE_SERVICE,
      characteristicUuid: CSC_MEASUREMENT,
      label: 'Cycling Speed/Cadence',
      protocol: 'cycling_speed_cadence',
      parser: parseCyclingSpeedCadenceMeasurement,
      context,
      info,
      subscriptions
    });
  }

  if (serviceSet.has(HEART_RATE_SERVICE)) {
    await subscribeCharacteristic(server, {
      serviceUuid: HEART_RATE_SERVICE,
      characteristicUuid: HEART_RATE_MEASUREMENT,
      label: 'Heart Rate',
      protocol: 'heart_rate',
      parser: parseHeartRateMeasurement,
      context,
      info,
      subscriptions
    });
  }

  if (serviceSet.has(RUNNING_SPEED_CADENCE_SERVICE)) {
    await subscribeCharacteristic(server, {
      serviceUuid: RUNNING_SPEED_CADENCE_SERVICE,
      characteristicUuid: RSC_MEASUREMENT,
      label: 'Running Speed/Cadence',
      protocol: 'running_speed_cadence',
      parser: parseRunningSpeedCadenceMeasurement,
      context,
      info,
      subscriptions
    });
  }

  return subscriptions;
}

async function subscribeFtms(server, controlState, context, info, subscriptions) {
  let service;
  try {
    service = await server.getPrimaryService(FITNESS_MACHINE_SERVICE);
  } catch {
    return;
  }

  await subscribeServiceCharacteristic(service, {
    characteristicUuid: CROSS_TRAINER_DATA,
    label: 'FTMS Cross Trainer',
    protocol: 'ftms.cross_trainer',
    parser: parseCrossTrainerData,
    context,
    info,
    subscriptions
  });
  await subscribeServiceCharacteristic(service, {
    characteristicUuid: STEP_CLIMBER_DATA,
    label: 'FTMS Step Climber',
    protocol: 'ftms.step_climber',
    parser: parseStepClimberData,
    context,
    info,
    subscriptions
  });
  await subscribeServiceCharacteristic(service, {
    characteristicUuid: STAIR_CLIMBER_DATA,
    label: 'FTMS Stair Climber',
    protocol: 'ftms.stair_climber',
    parser: parseStairClimberData,
    context,
    info,
    subscriptions
  });
  await subscribeServiceCharacteristic(service, {
    characteristicUuid: ROWER_DATA,
    label: 'FTMS Rower',
    protocol: 'ftms.rower',
    parser: parseRowerData,
    context,
    info,
    subscriptions
  });
  await subscribeServiceCharacteristic(service, {
    characteristicUuid: INDOOR_BIKE_DATA,
    label: 'FTMS Indoor Bike',
    protocol: 'ftms.indoor_bike',
    parser: parseIndoorBikeData,
    context,
    info,
    subscriptions,
    onSubscribed: () => {
      controlState.isIndoorBike = true;
    }
  });
  await subscribeServiceCharacteristic(service, {
    characteristicUuid: TREADMILL_DATA,
    label: 'FTMS Treadmill',
    protocol: 'ftms.treadmill',
    parser: parseTreadmillData,
    context,
    info,
    subscriptions,
    onSubscribed: () => {
      controlState.isTreadmill = true;
    }
  });
  await attachFtmsControlPoint(service, controlState);
  await attachFtmsControlMetadata(service, controlState);
}

async function subscribeCharacteristic(server, options) {
  try {
    const service = await server.getPrimaryService(options.serviceUuid);
    await subscribeServiceCharacteristic(service, options);
  } catch {
    // Devices commonly expose only one of the supported services.
  }
}

async function subscribeServiceCharacteristic(service, { characteristicUuid, label, protocol, parser, context, info, subscriptions, onSubscribed }) {
  try {
    const characteristic = await service.getCharacteristic(characteristicUuid);
    const state = {};
    const sourceId = `${context.deviceId}:${protocol}`;
    const handler = (event) => {
      const parsed = parser(event.target.value, state);
      const telemetry = createSourcePayload({
        deviceId: context.deviceId,
        deviceKey: context.deviceKey,
        deviceName: context.deviceName,
        protocol,
        sourceId,
        connected: true,
        info,
        ...parsed
      });
      if (telemetry) {
        context.onTelemetry(telemetry);
      }
    };

    characteristic.addEventListener('characteristicvaluechanged', handler);
    await characteristic.startNotifications();
    subscriptions.push({ characteristic, handler, label, protocol, sourceId });
    context.onTelemetry(createSourcePayload({
      deviceId: context.deviceId,
      deviceKey: context.deviceKey,
      deviceName: context.deviceName,
      protocol,
      sourceId,
      connected: true,
      info
    }));
    onSubscribed?.();
  } catch {
    // A supported service may still omit optional characteristics.
  }
}

async function attachFtmsControlPoint(service, controlState) {
  try {
    controlState.controlPoint = await service.getCharacteristic(FITNESS_MACHINE_CONTROL_POINT);
    await startFtmsControlNotifications(controlState);
  } catch {
    cleanupFtmsControl(controlState);
    controlState.controlPoint = null;
  }
}

async function attachFtmsControlMetadata(service, controlState) {
  const [features, speed, inclination, resistance, power, heartRate] = await Promise.all([
    readFtmsCharacteristic(service, FITNESS_MACHINE_FEATURE, parseFitnessMachineFeatures),
    readFtmsCharacteristic(service, SUPPORTED_SPEED_RANGE, parseSupportedSpeedRange),
    readFtmsCharacteristic(service, SUPPORTED_INCLINATION_RANGE, parseSupportedInclinationRange),
    readFtmsCharacteristic(service, SUPPORTED_RESISTANCE_LEVEL_RANGE, parseSupportedResistanceRange),
    readFtmsCharacteristic(service, SUPPORTED_POWER_RANGE, parseSupportedPowerRange),
    readFtmsCharacteristic(service, SUPPORTED_HEART_RATE_RANGE, parseSupportedHeartRateRange)
  ]);

  controlState.machineFeatures = features?.machineFeatures ?? null;
  controlState.targetSettingFeatures = features?.targetSettingFeatures ?? null;
  controlState.supportedSpeedRange = speed;
  controlState.supportedInclinationRange = inclination;
  controlState.supportedResistanceRange = resistance;
  controlState.supportedPowerRange = power;
  controlState.supportedHeartRateRange = heartRate;
}

async function readFtmsCharacteristic(service, characteristicUuid, parser) {
  try {
    const characteristic = await service.getCharacteristic(characteristicUuid);
    return parser(await characteristic.readValue());
  } catch {
    return null;
  }
}

async function readBatteryLevel(server) {
  try {
    const service = await server.getPrimaryService(BATTERY_SERVICE);
    const characteristic = await service.getCharacteristic(BATTERY_LEVEL);
    const value = await characteristic.readValue();
    return parseBatteryLevel(value).batteryPct;
  } catch {
    // Battery Service is optional metadata.
  }

  return null;
}

async function readDeviceInfo(server) {
  try {
    const service = await server.getPrimaryService(DEVICE_INFORMATION_SERVICE);
    const entries = await Promise.all([
      readStringCharacteristic(service, MANUFACTURER_NAME_STRING, 'manufacturerName'),
      readStringCharacteristic(service, MODEL_NUMBER_STRING, 'modelNumber'),
      readStringCharacteristic(service, FIRMWARE_REVISION_STRING, 'firmwareRevision'),
      readStringCharacteristic(service, HARDWARE_REVISION_STRING, 'hardwareRevision'),
      readStringCharacteristic(service, SOFTWARE_REVISION_STRING, 'softwareRevision')
    ]);

    return entries.reduce((info, entry) => {
      if (entry) {
        info[entry.key] = entry.value;
      }
      return info;
    }, {});
  } catch {
    return {};
  }
}

async function readStringCharacteristic(service, characteristicUuid, key) {
  try {
    const characteristic = await service.getCharacteristic(characteristicUuid);
    const value = await characteristic.readValue();
    const text = parseDeviceInfoString(value);
    return text ? { key, value: text } : null;
  } catch {
    return null;
  }
}

export function parseBatteryLevel(view) {
  if (!view || view.byteLength < 1) {
    return {};
  }

  return {
    batteryPct: view.getUint8(0)
  };
}

export function parseDeviceInfoString(view) {
  if (!view) {
    return '';
  }

  return new TextDecoder().decode(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)).replace(/\0+$/, '').trim();
}

function createSourcePayload({ deviceId, deviceKey, deviceName, protocol, sourceId, connected, values, info, raw }) {
  return {
    sourceId,
    deviceId,
    deviceKey,
    deviceName,
    protocol,
    connected,
    timestampMs: Date.now(),
    values: values || {},
    info: info || {},
    raw: raw || {}
  };
}

function createControlState() {
  return {
    isIndoorBike: false,
    isTreadmill: false,
    controlPoint: null,
    controlPointHandler: null,
    controlNotificationsStarted: false,
    controlRequested: false,
    controlStarted: false,
    controlQueue: Promise.resolve(),
    pendingControlPointResponse: null,
    machineFeatures: null,
    targetSettingFeatures: null,
    supportedSpeedRange: null,
    supportedInclinationRange: null,
    supportedResistanceRange: null,
    supportedPowerRange: null,
    supportedHeartRateRange: null
  };
}

export function getControlCapabilities(controlState) {
  const hasFtmsControl = Boolean(controlState?.controlPoint);
  const isIndoorBike = Boolean(controlState?.isIndoorBike);
  const isTreadmill = Boolean(controlState?.isTreadmill);
  const canWriteBikeBase = Boolean(isIndoorBike && !isTreadmill);
  const targetFeatures = controlState?.targetSettingFeatures;
  const hasAdvertisedTargetFeatures = Number.isInteger(targetFeatures) && targetFeatures !== 0;
  const supports = (bit, legacyFallback = false) => (
    hasAdvertisedTargetFeatures
      ? Boolean(targetFeatures & (2 ** bit))
      : legacyFallback
  );
  const canWrite = (bit, legacyFallback = false) => (
    canWriteBikeBase && hasFtmsControl && supports(bit, legacyFallback)
  );

  const capabilities = {
    canWriteTargetSpeed: canWrite(0),
    canWriteInclination: canWrite(1),
    canWriteResistance: canWrite(2, true),
    canWriteTargetPower: canWrite(3),
    canWriteTargetHeartRate: canWrite(4),
    canWriteTargetEnergy: canWrite(5),
    canWriteTargetSteps: canWrite(6),
    canWriteTargetStrides: canWrite(7),
    canWriteTargetDistance: canWrite(8),
    canWriteTargetTrainingTime: canWrite(9),
    canWriteTargetTimeTwoHeartRateZones: canWrite(10),
    canWriteTargetTimeThreeHeartRateZones: canWrite(11),
    canWriteTargetTimeFiveHeartRateZones: canWrite(12),
    canWriteGrade: canWrite(13, true),
    canWriteWheelCircumference: canWrite(14),
    canWriteSpinDown: canWrite(15),
    canWriteTargetCadence: canWrite(16),
    isIndoorBike,
    isTreadmill,
    hasFtmsControl,
    targetSettingFeatures: Number.isInteger(targetFeatures) ? targetFeatures : null,
    supportedSpeedRange: controlState?.supportedSpeedRange || null,
    supportedInclinationRange: controlState?.supportedInclinationRange || null,
    supportedResistanceRange: controlState?.supportedResistanceRange || null,
    supportedPowerRange: controlState?.supportedPowerRange || null,
    supportedHeartRateRange: controlState?.supportedHeartRateRange || null
  };
  capabilities.canWriteBike = STANDARD_COMMAND_DEFINITIONS.some((definition) => (
    Boolean(capabilities[definition.capability])
  ));
  return capabilities;
}

function getCombinedCapabilities(controlState, pluginConnections) {
  const capabilities = {
    ...getControlCapabilities(controlState),
    ...getPluginCapabilities(pluginConnections)
  };
  capabilities.canWriteBike = Boolean(
    capabilities.canWriteBike ||
    STANDARD_COMMAND_DEFINITIONS.some((definition) => capabilities[definition.capability])
  );
  return capabilities;
}

export async function applyBleCommand(command, controlState, options = {}) {
  const permissions = normalizeRemoteControlPermissions(options.remoteControlPermissions, options.allowBikeControl);
  const safety = evaluateBleCommand(command, getControlCapabilities(controlState), permissions, Date.now());
  if (!safety.ok) {
    return createCommandAck(command, 'blocked', safety.reason);
  }

  try {
    const serialized = serializeFtmsCommand(command, controlState);
    await ensureFtmsControl(controlState, command.type !== 'bike.spinDown');
    await writeControlPointProcedure(controlState, serialized.bytes);
    return createCommandAck(command, 'applied', undefined, serialized.applied);
  } catch (error) {
    return createCommandAck(command, 'failed', error.message || 'ble_write_failed');
  }
}

export function evaluateBleCommand(command, capabilities, allowBikeControl, now = Date.now()) {
  if (!command || typeof command !== 'object') {
    return { ok: false, reason: 'invalid_command' };
  }

  if (command.expiresAt && now > command.expiresAt) {
    return { ok: false, reason: 'command_expired' };
  }

  if (command.type === 'treadmill.speed' || command.type === 'treadmill.incline') {
    return { ok: false, reason: 'treadmill_control_disabled' };
  }

  if (capabilities?.isTreadmill) {
    return { ok: false, reason: 'treadmill_control_disabled' };
  }

  const permissionKey = commandPermissionKey(command);
  if (!permissionKey) {
    return { ok: false, reason: 'unsupported_command_type' };
  }

  const permissions = normalizeRemoteControlPermissions(allowBikeControl);
  if (!permissions.enabled || !permissions[permissionKey]) {
    return { ok: false, reason: 'permission_disabled' };
  }

  const capabilityKey = COMMAND_CAPABILITY_KEYS[permissionKey];
  if (!capabilities?.[capabilityKey]) {
    return { ok: false, reason: 'capability_not_supported' };
  }

  return { ok: true };
}

export function normalizeRemoteControlPermissions(permissions, enabledFallback = false, commandDefinitions = STANDARD_COMMAND_DEFINITIONS) {
  const defaults = {
    ...DEFAULT_REMOTE_CONTROL_PERMISSIONS,
    ...Object.fromEntries(commandDefinitions.map((command) => [
      command.permissionKey,
      Boolean(command.defaultEnabled)
    ]))
  };

  if (typeof permissions === 'boolean') {
    return {
      ...defaults,
      enabled: permissions
    };
  }

  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    return {
      ...defaults,
      enabled: Boolean(enabledFallback)
    };
  }

  return Object.fromEntries(Object.entries(defaults).map(([key, defaultValue]) => [
    key,
    typeof permissions[key] === 'boolean' ? permissions[key] : defaultValue
  ]));
}

export function commandPermissionKey(commandOrType, commandDefinitions = STANDARD_COMMAND_DEFINITIONS) {
  const type = typeof commandOrType === 'string' ? commandOrType : commandOrType?.type;
  return commandDefinitions.find((command) => command.type === type)?.permissionKey || COMMAND_PERMISSION_KEYS[type] || '';
}

export function serializeFtmsCommand(command, controlState = {}) {
  if (command.type === 'bike.targetSpeed') {
    const range = controlState.supportedSpeedRange;
    const targetSpeedKph = clampNumber(
      command.targetSpeedMps * 3.6,
      Number.isFinite(range?.min) ? range.min : 0,
      Number.isFinite(range?.max) ? range.max : 655.35
    );
    return {
      bytes: opcodeInt16(0x02, Math.round(targetSpeedKph * 100), false),
      applied: { targetSpeedMps: targetSpeedKph / 3.6 }
    };
  }

  if (command.type === 'bike.inclination') {
    const range = controlState.supportedInclinationRange;
    const inclinationPct = clampNumber(
      command.inclinePct,
      Number.isFinite(range?.min) ? range.min : -3276.8,
      Number.isFinite(range?.max) ? range.max : 3276.7
    );
    return {
      bytes: opcodeInt16(0x03, Math.round(inclinationPct * 10)),
      applied: { inclinePct: inclinationPct }
    };
  }

  if (command.type === 'bike.grade') {
    return {
      bytes: serializeBikeGradeCommand(command),
      applied: {
        gradePct: clampNumber(command.gradePct, -20, 20),
        windSpeedMps: clampNumber(command.windSpeedMps, -32.768, 32.767, 0),
        rollingResistanceCoefficient: clampNumber(command.rollingResistanceCoefficient, 0, 0.0255, 0.004),
        windResistanceCoefficientKgM: clampNumber(command.windResistanceCoefficientKgM, 0, 2.55, 0.51)
      }
    };
  }

  if (command.type === 'bike.resistance') {
    const { bytes, appliedResistanceLevel } = serializeBikeResistanceCommand(
      command,
      controlState.supportedResistanceRange
    );
    return {
      bytes,
      applied: { resistanceLevel: appliedResistanceLevel }
    };
  }

  if (command.type === 'bike.targetPower') {
    const range = controlState.supportedPowerRange;
    const targetPowerW = clampNumber(
      command.targetPowerW,
      Number.isFinite(range?.min) ? range.min : -32768,
      Number.isFinite(range?.max) ? range.max : 32767
    );
    return {
      bytes: opcodeInt16(0x05, Math.round(targetPowerW)),
      applied: { targetPowerW }
    };
  }

  if (command.type === 'bike.targetHeartRate') {
    const range = controlState.supportedHeartRateRange;
    const targetHeartBpm = Math.round(clampNumber(
      command.targetHeartBpm,
      Number.isFinite(range?.min) ? range.min : 0,
      Number.isFinite(range?.max) ? range.max : 255
    ));
    return {
      bytes: Uint8Array.from([0x06, targetHeartBpm]),
      applied: { targetHeartBpm }
    };
  }

  if (command.type === 'bike.targetEnergy') {
    return serializeUint16Target(0x09, 'targetEnergyKcal', command.targetEnergyKcal);
  }

  if (command.type === 'bike.targetSteps') {
    return serializeUint16Target(0x0a, 'targetSteps', command.targetSteps);
  }

  if (command.type === 'bike.targetStrides') {
    return serializeUint16Target(0x0b, 'targetStrides', command.targetStrides);
  }

  if (command.type === 'bike.targetDistance') {
    const targetDistanceM = clampInteger(command.targetDistanceM, 0, 0xffffff);
    return {
      bytes: Uint8Array.from([
        0x0c,
        targetDistanceM & 0xff,
        (targetDistanceM >> 8) & 0xff,
        (targetDistanceM >> 16) & 0xff
      ]),
      applied: { targetDistanceM }
    };
  }

  if (command.type === 'bike.targetTrainingTime') {
    return serializeUint16Target(0x0d, 'targetTrainingTimeS', command.targetTrainingTimeS);
  }

  if (command.type === 'bike.targetTimeTwoHeartRateZones') {
    return serializeHeartRateZoneTimes(0x0e, command.zoneTimesS, 2);
  }

  if (command.type === 'bike.targetTimeThreeHeartRateZones') {
    return serializeHeartRateZoneTimes(0x0f, command.zoneTimesS, 3);
  }

  if (command.type === 'bike.targetTimeFiveHeartRateZones') {
    return serializeHeartRateZoneTimes(0x10, command.zoneTimesS, 5);
  }

  if (command.type === 'bike.wheelCircumference') {
    const wheelCircumferenceMm = clampNumber(command.wheelCircumferenceMm, 0, 6553.5);
    return {
      bytes: opcodeInt16(0x12, Math.round(wheelCircumferenceMm * 10), false),
      applied: { wheelCircumferenceMm }
    };
  }

  if (command.type === 'bike.spinDown') {
    const spinDownAction = command.spinDownAction === 'ignore' ? 'ignore' : 'start';
    return {
      bytes: Uint8Array.from([0x13, spinDownAction === 'ignore' ? 0x02 : 0x01]),
      applied: { spinDownAction }
    };
  }

  if (command.type === 'bike.targetCadence') {
    const targetCadenceRpm = clampNumber(command.targetCadenceRpm, 0, 32767.5);
    return {
      bytes: opcodeInt16(0x14, Math.round(targetCadenceRpm * 2), false),
      applied: { targetCadenceRpm }
    };
  }

  throw new Error('unsupported_command_type');
}

export function serializeBikeGradeCommand(command) {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  const gradePct = clampNumber(command.gradePct, -20, 20);
  const windSpeedMps = clampNumber(command.windSpeedMps, -32.768, 32.767, 0);
  const rollingResistanceCoefficient = clampNumber(command.rollingResistanceCoefficient, 0, 0.0255, 0.004);
  const windResistanceCoefficientKgM = clampNumber(command.windResistanceCoefficientKgM, 0, 2.55, 0.51);

  view.setUint8(0, 0x11);
  view.setInt16(1, Math.round(windSpeedMps * 1000), true);
  view.setInt16(3, Math.round(gradePct * 100), true);
  view.setUint8(5, Math.round(rollingResistanceCoefficient / 0.0001));
  view.setUint8(6, Math.round(windResistanceCoefficientKgM / 0.01));
  view.setUint8(7, 0);

  return bytes.subarray(0, 7);
}

export function serializeBikeResistanceCommand(command, supportedRange = null) {
  const min = Number.isFinite(supportedRange?.min) ? supportedRange.min : 0;
  const max = Number.isFinite(supportedRange?.max) ? supportedRange.max : 100;
  const resistanceLevel = clampNumber(command.resistanceLevel, min, max);
  const bytes = new Uint8Array(3);
  const view = new DataView(bytes.buffer);

  view.setUint8(0, 0x04);
  view.setInt16(1, Math.round(resistanceLevel * 10), true);

  return {
    bytes,
    appliedResistanceLevel: resistanceLevel
  };
}

function serializeUint16Target(opcode, key, value) {
  const target = clampInteger(value, 0, 65535);
  return {
    bytes: opcodeInt16(opcode, target, false),
    applied: { [key]: target }
  };
}

function serializeHeartRateZoneTimes(opcode, values, expectedLength) {
  const zoneTimesS = Array.from({ length: expectedLength }, (_, index) => (
    clampInteger(values?.[index], 0, 65535)
  ));
  const bytes = new Uint8Array(1 + expectedLength * 2);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, opcode);
  zoneTimesS.forEach((value, index) => view.setUint16(1 + index * 2, value, true));
  return {
    bytes,
    applied: { zoneTimesS }
  };
}

function opcodeInt16(opcode, value, signed = true) {
  const bytes = new Uint8Array(3);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, opcode);
  if (signed) {
    view.setInt16(1, value, true);
  } else {
    view.setUint16(1, value, true);
  }
  return bytes;
}

function clampInteger(value, min, max) {
  return Math.round(clampNumber(value, min, max, min));
}

export function parseFitnessMachineFeatures(view) {
  if (!view || view.byteLength < 8) {
    return null;
  }

  return {
    machineFeatures: view.getUint32(0, true),
    targetSettingFeatures: view.getUint32(4, true)
  };
}

function parseSupportedSpeedRange(view) {
  return parseSupportedRange(view, {
    readMinimum: (value) => value.getUint16(0, true) / 100,
    readMaximum: (value) => value.getUint16(2, true) / 100,
    readIncrement: (value) => value.getUint16(4, true) / 100
  });
}

function parseSupportedInclinationRange(view) {
  return parseSupportedRange(view, {
    readMinimum: (value) => value.getInt16(0, true) / 10,
    readMaximum: (value) => value.getInt16(2, true) / 10,
    readIncrement: (value) => value.getUint16(4, true) / 10
  });
}

function parseSupportedResistanceRange(view) {
  return parseSupportedRange(view, {
    readMinimum: (value) => value.getInt16(0, true) / 10,
    readMaximum: (value) => value.getInt16(2, true) / 10,
    readIncrement: (value) => value.getUint16(4, true) / 10
  });
}

function parseSupportedPowerRange(view) {
  return parseSupportedRange(view, {
    readMinimum: (value) => value.getInt16(0, true),
    readMaximum: (value) => value.getInt16(2, true),
    readIncrement: (value) => value.getUint16(4, true)
  });
}

function parseSupportedHeartRateRange(view) {
  if (!view || view.byteLength < 3) {
    return null;
  }

  return {
    min: view.getUint8(0),
    max: view.getUint8(1),
    increment: view.getUint8(2)
  };
}

function parseSupportedRange(view, readers) {
  if (!view || view.byteLength < 6) {
    return null;
  }

  return {
    min: readers.readMinimum(view),
    max: readers.readMaximum(view),
    increment: readers.readIncrement(view)
  };
}

async function ensureFtmsControl(controlState, startMachine = true) {
  if (!controlState.controlRequested) {
    await writeControlPointProcedure(controlState, new Uint8Array([0x00]));
    controlState.controlRequested = true;
  }

  if (startMachine && !controlState.controlStarted) {
    await writeControlPointProcedure(controlState, new Uint8Array([0x07]));
    controlState.controlStarted = true;
  }
}

async function writeControlPointProcedure(controlState, bytes) {
  await startFtmsControlNotifications(controlState);

  controlState.controlQueue = controlState.controlQueue
    .catch(() => undefined)
    .then(() => runControlPointProcedure(controlState, bytes));

  return controlState.controlQueue;
}

async function runControlPointProcedure(controlState, bytes) {
  const requestCode = bytes[0];

  if (!controlState.controlNotificationsStarted) {
    await writeControlPoint(controlState.controlPoint, bytes);
    return {
      requestCode,
      resultCode: null
    };
  }

  return writeControlPointAndAwaitResponse(controlState, bytes, requestCode);
}

async function writeControlPointAndAwaitResponse(controlState, bytes, requestCode) {
  if (controlState.pendingControlPointResponse) {
    throw new Error('ftms_control_busy');
  }

  let rejectResponse = () => undefined;
  const responsePromise = new Promise((resolve, reject) => {
    rejectResponse = reject;
    const timeoutId = setTimeout(() => {
      if (controlState.pendingControlPointResponse?.requestCode === requestCode) {
        controlState.pendingControlPointResponse = null;
        reject(new Error('ftms_control_response_timeout'));
      }
    }, FTMS_CONTROL_RESPONSE_TIMEOUT_MS);

    controlState.pendingControlPointResponse = {
      requestCode,
      timeoutId,
      resolve,
      reject
    };
  });

  try {
    await writeControlPoint(controlState.controlPoint, bytes);
  } catch (error) {
    const pending = controlState.pendingControlPointResponse;
    if (pending?.requestCode === requestCode) {
      clearTimeout(pending.timeoutId);
      controlState.pendingControlPointResponse = null;
    }
    rejectResponse(error);
  }

  return responsePromise;
}

async function writeControlPoint(characteristic, bytes) {
  if (!characteristic) {
    throw new Error('bike_control_not_supported');
  }

  if (characteristic.writeValueWithResponse) {
    await characteristic.writeValueWithResponse(bytes);
    return;
  }

  await characteristic.writeValue(bytes);
}

async function startFtmsControlNotifications(controlState) {
  const characteristic = controlState.controlPoint;
  if (!characteristic || controlState.controlNotificationsStarted) {
    return;
  }

  if (typeof characteristic.startNotifications !== 'function') {
    return;
  }

  const handler = (event) => handleFtmsControlNotification(controlState, event.target.value);
  await characteristic.startNotifications();
  characteristic.addEventListener('characteristicvaluechanged', handler);
  controlState.controlPointHandler = handler;
  controlState.controlNotificationsStarted = true;
}

function handleFtmsControlNotification(controlState, value) {
  if (!value || value.byteLength < 3 || value.getUint8(0) !== FTMS_RESPONSE_CODE) {
    return;
  }

  const requestCode = value.getUint8(1);
  const resultCode = value.getUint8(2);
  const pending = controlState.pendingControlPointResponse;

  if (!pending || pending.requestCode !== requestCode) {
    return;
  }

  clearTimeout(pending.timeoutId);
  controlState.pendingControlPointResponse = null;

  if (resultCode === FTMS_RESULT_SUCCESS) {
    pending.resolve({
      requestCode,
      resultCode
    });
    return;
  }

  pending.reject(new Error(ftmsControlResultReason(resultCode)));
}

function cleanupFtmsControl(controlState, error = new Error('ftms_control_closed')) {
  if (controlState.controlPoint && controlState.controlPointHandler && typeof controlState.controlPoint.removeEventListener === 'function') {
    controlState.controlPoint.removeEventListener('characteristicvaluechanged', controlState.controlPointHandler);
  }

  if (controlState.pendingControlPointResponse) {
    clearTimeout(controlState.pendingControlPointResponse.timeoutId);
    controlState.pendingControlPointResponse.reject(error);
    controlState.pendingControlPointResponse = null;
  }

  controlState.controlPointHandler = null;
  controlState.controlNotificationsStarted = false;
  controlState.controlRequested = false;
  controlState.controlStarted = false;
  controlState.controlQueue = Promise.resolve();
}

function ftmsControlResultReason(resultCode) {
  if (resultCode === 0x02) {
    return 'ftms_op_code_not_supported';
  }

  if (resultCode === 0x03) {
    return 'ftms_invalid_parameter';
  }

  if (resultCode === 0x04) {
    return 'ftms_operation_failed';
  }

  if (resultCode === 0x05) {
    return 'ftms_control_not_permitted';
  }

  return `ftms_result_${resultCode}`;
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

export function parseIndoorBikeData(view) {
  const reader = createReader(view);
  const flags = reader.uint16();
  const telemetry = {
    values: {},
    raw: { flags }
  };

  if ((flags & 0x0001) === 0 && reader.has(2)) {
    telemetry.values.speedMps = kmhToMps(reader.uint16() / 100);
  }

  if (flags & 0x0002) {
    reader.skip(2);
  }

  if ((flags & 0x0004) && reader.has(2)) {
    telemetry.values.cadenceRpm = reader.uint16() / 2;
  }

  if (flags & 0x0008) {
    reader.skip(2);
  }

  if ((flags & 0x0010) && reader.has(3)) {
    telemetry.values.distanceM = reader.uint24();
  }

  if (flags & 0x0020) {
    reader.skip(2);
  }

  if ((flags & 0x0040) && reader.has(2)) {
    telemetry.values.powerW = reader.int16();
  }

  if (flags & 0x0080) {
    reader.skip(2);
  }

  if (flags & 0x0100) {
    reader.skip(5);
  }

  if ((flags & 0x0200) && reader.has(1)) {
    telemetry.values.heartBpm = reader.uint8();
  }

  return telemetry;
}

export function parseTreadmillData(view) {
  const reader = createReader(view);
  const flags = reader.uint16();
  const telemetry = {
    values: {},
    raw: { flags }
  };

  if ((flags & 0x0001) === 0 && reader.has(2)) {
    telemetry.values.speedMps = kmhToMps(reader.uint16() / 100);
  }

  if (flags & 0x0002) {
    reader.skip(2);
  }

  if ((flags & 0x0004) && reader.has(3)) {
    telemetry.values.distanceM = reader.uint24();
  }

  if ((flags & 0x0008) && reader.has(4)) {
    telemetry.values.inclinePct = reader.int16() / 10;
    reader.skip(2);
  }

  if (flags & 0x0010) {
    reader.skip(4);
  }

  if (flags & 0x0020) {
    reader.skip(2);
  }

  if (flags & 0x0040) {
    reader.skip(2);
  }

  if (flags & 0x0080) {
    reader.skip(5);
  }

  if ((flags & 0x0100) && reader.has(1)) {
    telemetry.values.heartBpm = reader.uint8();
  }

  if (flags & 0x0200) {
    reader.skip(1);
  }

  if (flags & 0x0400) {
    reader.skip(2);
  }

  if (flags & 0x0800) {
    reader.skip(2);
  }

  if ((flags & 0x1000) && reader.has(4)) {
    reader.skip(2);
    telemetry.values.powerW = reader.int16();
  }

  return telemetry;
}

export function parseCrossTrainerData(view) {
  const reader = createReader(view);
  const flags = reader.uint24();
  const telemetry = {
    values: {},
    raw: { flags }
  };

  if ((flags & 0x000001) === 0 && reader.has(2)) {
    telemetry.values.speedMps = kmhToMps(reader.uint16() / 100);
  }

  if ((flags & 0x000002) && reader.has(2)) {
    telemetry.values.averageSpeedMps = kmhToMps(reader.uint16() / 100);
  }

  if ((flags & 0x000004) && reader.has(3)) {
    telemetry.values.distanceM = reader.uint24();
  }

  if ((flags & 0x000008) && reader.has(4)) {
    telemetry.values.stepsPerMinute = reader.uint16();
    telemetry.values.averageStepRateSpm = reader.uint16();
  }

  if ((flags & 0x000010) && reader.has(2)) {
    telemetry.values.strideCount = reader.uint16();
  }

  if ((flags & 0x000020) && reader.has(4)) {
    telemetry.values.elevationGainM = reader.uint16();
    telemetry.raw.negativeElevationM = reader.uint16();
  }

  if ((flags & 0x000040) && reader.has(4)) {
    telemetry.values.inclinePct = reader.int16() / 10;
    telemetry.values.rampAngleDeg = reader.int16() / 10;
  }

  if ((flags & 0x000080) && reader.has(2)) {
    telemetry.values.resistanceLevel = reader.int16() / 10;
  }

  if ((flags & 0x000100) && reader.has(2)) {
    telemetry.values.powerW = reader.int16();
  }

  if ((flags & 0x000200) && reader.has(2)) {
    telemetry.values.averagePowerW = reader.int16();
  }

  if (flags & 0x000400) {
    readFtmsEnergy(reader, telemetry.values);
  }

  if ((flags & 0x000800) && reader.has(1)) {
    telemetry.values.heartBpm = reader.uint8();
  }

  if ((flags & 0x001000) && reader.has(1)) {
    telemetry.values.metabolicEquivalent = reader.uint8() / 10;
  }

  if ((flags & 0x002000) && reader.has(2)) {
    telemetry.values.elapsedTimeS = reader.uint16();
  }

  if ((flags & 0x004000) && reader.has(2)) {
    telemetry.values.remainingTimeS = reader.uint16();
  }

  if (flags & 0x008000) {
    telemetry.raw.movementDirection = 'backward';
  }

  return telemetry;
}

export function parseStepClimberData(view) {
  const reader = createReader(view);
  const flags = reader.uint16();
  const telemetry = {
    values: {},
    raw: { flags }
  };

  if ((flags & 0x0001) === 0 && reader.has(4)) {
    telemetry.values.floors = reader.uint16();
    telemetry.values.stepCount = reader.uint16();
  }

  if ((flags & 0x0002) && reader.has(2)) {
    telemetry.values.stepsPerMinute = reader.uint16();
  }

  if ((flags & 0x0004) && reader.has(2)) {
    telemetry.values.averageStepRateSpm = reader.uint16();
  }

  if ((flags & 0x0008) && reader.has(2)) {
    telemetry.values.elevationGainM = reader.uint16();
  }

  if (flags & 0x0010) {
    readFtmsEnergy(reader, telemetry.values);
  }

  if ((flags & 0x0020) && reader.has(1)) {
    telemetry.values.heartBpm = reader.uint8();
  }

  if ((flags & 0x0040) && reader.has(1)) {
    telemetry.values.metabolicEquivalent = reader.uint8() / 10;
  }

  if ((flags & 0x0080) && reader.has(2)) {
    telemetry.values.elapsedTimeS = reader.uint16();
  }

  if ((flags & 0x0100) && reader.has(2)) {
    telemetry.values.remainingTimeS = reader.uint16();
  }

  return telemetry;
}

export function parseStairClimberData(view) {
  const reader = createReader(view);
  const flags = reader.uint16();
  const telemetry = {
    values: {},
    raw: { flags }
  };

  if ((flags & 0x0001) === 0 && reader.has(2)) {
    telemetry.values.floors = reader.uint16();
  }

  if ((flags & 0x0002) && reader.has(2)) {
    telemetry.values.stepsPerMinute = reader.uint16();
  }

  if ((flags & 0x0004) && reader.has(2)) {
    telemetry.values.averageStepRateSpm = reader.uint16();
  }

  if ((flags & 0x0008) && reader.has(2)) {
    telemetry.values.elevationGainM = reader.uint16();
  }

  if ((flags & 0x0010) && reader.has(2)) {
    telemetry.values.strideCount = reader.uint16();
  }

  if (flags & 0x0020) {
    readFtmsEnergy(reader, telemetry.values);
  }

  if ((flags & 0x0040) && reader.has(1)) {
    telemetry.values.heartBpm = reader.uint8();
  }

  if ((flags & 0x0080) && reader.has(1)) {
    telemetry.values.metabolicEquivalent = reader.uint8() / 10;
  }

  if ((flags & 0x0100) && reader.has(2)) {
    telemetry.values.elapsedTimeS = reader.uint16();
  }

  if ((flags & 0x0200) && reader.has(2)) {
    telemetry.values.remainingTimeS = reader.uint16();
  }

  return telemetry;
}

export function parseRowerData(view) {
  const reader = createReader(view);
  const flags = reader.uint16();
  const telemetry = {
    values: {},
    raw: { flags }
  };

  if ((flags & 0x0001) === 0 && reader.has(3)) {
    telemetry.values.strokeRateSpm = reader.uint8() / 2;
    telemetry.values.strokeCount = reader.uint16();
  }

  if ((flags & 0x0002) && reader.has(1)) {
    telemetry.values.averageStrokeRateSpm = reader.uint8() / 2;
  }

  if ((flags & 0x0004) && reader.has(3)) {
    telemetry.values.distanceM = reader.uint24();
  }

  if ((flags & 0x0008) && reader.has(2)) {
    telemetry.values.paceSecondsPer500m = reader.uint16();
  }

  if ((flags & 0x0010) && reader.has(2)) {
    telemetry.values.averagePaceSecondsPer500m = reader.uint16();
  }

  if ((flags & 0x0020) && reader.has(2)) {
    telemetry.values.powerW = reader.int16();
  }

  if ((flags & 0x0040) && reader.has(2)) {
    telemetry.values.averagePowerW = reader.int16();
  }

  if ((flags & 0x0080) && reader.has(2)) {
    telemetry.values.resistanceLevel = reader.int16() / 10;
  }

  if (flags & 0x0100) {
    readFtmsEnergy(reader, telemetry.values);
  }

  if ((flags & 0x0200) && reader.has(1)) {
    telemetry.values.heartBpm = reader.uint8();
  }

  if ((flags & 0x0400) && reader.has(1)) {
    telemetry.values.metabolicEquivalent = reader.uint8() / 10;
  }

  if ((flags & 0x0800) && reader.has(2)) {
    telemetry.values.elapsedTimeS = reader.uint16();
  }

  if ((flags & 0x1000) && reader.has(2)) {
    telemetry.values.remainingTimeS = reader.uint16();
  }

  return telemetry;
}

export function parseRunningSpeedCadenceMeasurement(view) {
  const reader = createReader(view);
  const flags = reader.uint8();
  const telemetry = {
    values: {},
    raw: {
      flags,
      pace: (flags & 0x04) ? 'running' : 'walking'
    }
  };

  if (reader.has(3)) {
    telemetry.values.speedMps = reader.uint16() / 256;
    telemetry.values.cadenceSpm = reader.uint8();
  }

  if ((flags & 0x01) && reader.has(2)) {
    telemetry.values.strideLengthM = reader.uint16() / 100;
  }

  if ((flags & 0x02) && reader.has(4)) {
    telemetry.values.distanceM = reader.uint32() / 10;
  }

  return telemetry;
}

export function parseCyclingPowerMeasurement(view, state = {}) {
  const reader = createReader(view);
  const flags = reader.uint16();
  const telemetry = {
    values: {},
    raw: { flags }
  };

  if (reader.has(2)) {
    telemetry.values.powerW = reader.int16();
  }

  if (flags & 0x0001) {
    reader.skip(1);
  }

  if (flags & 0x0004) {
    reader.skip(2);
  }

  if ((flags & 0x0010) && reader.has(6)) {
    telemetry.raw.cumulativeWheelRevolutions = reader.uint32();
    telemetry.raw.lastWheelEventTime = reader.uint16();
  }

  if ((flags & 0x0020) && reader.has(4)) {
    const cumulativeCrankRevolutions = reader.uint16();
    const lastCrankEventTime = reader.uint16();
    const cadenceRpm = calculateCadence(state.cyclingPowerCrank, cumulativeCrankRevolutions, lastCrankEventTime);
    telemetry.raw.cumulativeCrankRevolutions = cumulativeCrankRevolutions;
    telemetry.raw.lastCrankEventTime = lastCrankEventTime;
    if (Number.isFinite(cadenceRpm)) {
      telemetry.values.cadenceRpm = cadenceRpm;
    }
    state.cyclingPowerCrank = {
      revolutions: cumulativeCrankRevolutions,
      eventTime: lastCrankEventTime
    };
  }

  if (flags & 0x0040) {
    reader.skip(4);
  }

  if (flags & 0x0080) {
    reader.skip(4);
  }

  if (flags & 0x0100) {
    reader.skip(3);
  }

  if (flags & 0x0200) {
    reader.skip(2);
  }

  if (flags & 0x0400) {
    reader.skip(2);
  }

  if (flags & 0x0800) {
    reader.skip(2);
  }

  return telemetry;
}

export function parseCyclingSpeedCadenceMeasurement(view, state = {}) {
  const reader = createReader(view);
  const flags = reader.uint8();
  const telemetry = {
    values: {},
    raw: { flags }
  };

  if ((flags & 0x01) && reader.has(6)) {
    telemetry.raw.cumulativeWheelRevolutions = reader.uint32();
    telemetry.raw.lastWheelEventTime = reader.uint16();
  }

  if ((flags & 0x02) && reader.has(4)) {
    const cumulativeCrankRevolutions = reader.uint16();
    const lastCrankEventTime = reader.uint16();
    const cadenceRpm = calculateCadence(state.cscCrank, cumulativeCrankRevolutions, lastCrankEventTime);
    telemetry.raw.cumulativeCrankRevolutions = cumulativeCrankRevolutions;
    telemetry.raw.lastCrankEventTime = lastCrankEventTime;
    if (Number.isFinite(cadenceRpm)) {
      telemetry.values.cadenceRpm = cadenceRpm;
    }
    state.cscCrank = {
      revolutions: cumulativeCrankRevolutions,
      eventTime: lastCrankEventTime
    };
  }

  return telemetry;
}

export function parseHeartRateMeasurement(view) {
  const reader = createReader(view);
  const flags = reader.uint8();
  const telemetry = {
    values: {},
    raw: { flags }
  };

  if (flags & 0x01) {
    telemetry.values.heartBpm = reader.uint16();
  } else {
    telemetry.values.heartBpm = reader.uint8();
  }

  return telemetry;
}

function readFtmsEnergy(reader, values) {
  if (!reader.has(5)) {
    return;
  }

  const totalEnergy = reader.uint16();
  const energyPerHour = reader.uint16();
  const energyPerMinute = reader.uint8();

  if (totalEnergy !== 0xffff) {
    values.totalEnergyKcal = totalEnergy;
  }

  if (energyPerHour !== 0xffff) {
    values.energyPerHourKcal = energyPerHour;
  }

  if (energyPerMinute !== 0xff) {
    values.energyPerMinuteKcal = energyPerMinute;
  }
}

function createReader(view) {
  let offset = 0;

  return {
    has(bytes) {
      return offset + bytes <= view.byteLength;
    },
    skip(bytes) {
      offset = Math.min(view.byteLength, offset + bytes);
    },
    uint8() {
      const value = view.getUint8(offset);
      offset += 1;
      return value;
    },
    uint16() {
      const value = view.getUint16(offset, true);
      offset += 2;
      return value;
    },
    int16() {
      const value = view.getInt16(offset, true);
      offset += 2;
      return value;
    },
    uint24() {
      const value = view.getUint8(offset) + (view.getUint8(offset + 1) << 8) + (view.getUint8(offset + 2) << 16);
      offset += 3;
      return value;
    },
    uint32() {
      const value = view.getUint32(offset, true);
      offset += 4;
      return value;
    }
  };
}

function calculateCadence(previous, revolutions, eventTime) {
  if (!previous || previous.eventTime === eventTime) {
    return undefined;
  }

  const revolutionDelta = rolloverDelta(previous.revolutions, revolutions, 65536);
  const timeDelta = rolloverDelta(previous.eventTime, eventTime, 65536);
  if (revolutionDelta <= 0 || timeDelta <= 0) {
    return undefined;
  }

  return (revolutionDelta / (timeDelta / 1024)) * 60;
}

function rolloverDelta(previous, current, rollover) {
  return current >= previous ? current - previous : current + rollover - previous;
}

function kmhToMps(value) {
  return value / 3.6;
}

function clampNumber(value, min, max, fallback = min) {
  const normalized = Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, normalized));
}
