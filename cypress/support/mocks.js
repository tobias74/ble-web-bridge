const UUIDS = {
  batteryService: '0000180f-0000-1000-8000-00805f9b34fb',
  batteryLevel: '00002a19-0000-1000-8000-00805f9b34fb',
  cyclingPowerService: '00001818-0000-1000-8000-00805f9b34fb',
  cyclingPowerMeasurement: '00002a63-0000-1000-8000-00805f9b34fb',
  deviceInformationService: '0000180a-0000-1000-8000-00805f9b34fb',
  fitnessMachineService: '00001826-0000-1000-8000-00805f9b34fb',
  fitnessMachineFeature: '00002acc-0000-1000-8000-00805f9b34fb',
  fitnessMachineControlPoint: '00002ad9-0000-1000-8000-00805f9b34fb',
  heartRateService: '0000180d-0000-1000-8000-00805f9b34fb',
  heartRateMeasurement: '00002a37-0000-1000-8000-00805f9b34fb',
  indoorBikeData: '00002ad2-0000-1000-8000-00805f9b34fb',
  supportedResistanceRange: '00002ad6-0000-1000-8000-00805f9b34fb'
};

export function installWebSocketMock(win) {
  const sockets = [];

  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.readyState = MockWebSocket.CONNECTING;
      this.sent = [];
      this.listeners = new Map();
      sockets.push(this);

      win.setTimeout(() => {
        this.readyState = MockWebSocket.OPEN;
        this.dispatch('open', {});
      }, 0);
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
      this.listeners.get(type)?.delete(listener);
    }

    send(payload) {
      this.sent.push(payload);
    }

    close(code = 1000, reason = '') {
      this.readyState = MockWebSocket.CLOSED;
      this.dispatch('close', { code, reason });
    }

    emitMessage(payload) {
      this.dispatch('message', {
        data: typeof payload === 'string' ? payload : JSON.stringify(payload)
      });
    }

    dispatch(type, event) {
      for (const listener of this.listeners.get(type) || []) {
        listener.call(this, event);
      }
    }
  }

  win.WebSocket = MockWebSocket;
  win.__webSocketMock = {
    latest() {
      return sockets.at(-1);
    },
    sockets
  };
}

export function installBluetoothMock(win, configuration = {}) {
  const characteristics = {
    battery: new MockCharacteristic(win, { readBytes: [88] }),
    controlPoint: new MockCharacteristic(win, { acknowledgeWrites: true }),
    cyclingPower: new MockCharacteristic(win),
    heartRate: new MockCharacteristic(win),
    indoorBike: new MockCharacteristic(win),
    fitnessMachineFeature: new MockCharacteristic(win, {
      readBytes: [0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0x01, 0x00]
    }),
    resistanceRange: new MockCharacteristic(win, {
      readBytes: [0x00, 0x00, 0xe8, 0x03, 0x0a, 0x00]
    })
  };
  const services = createServices(characteristics);
  const deviceListeners = new Map();
  const requests = [];

  const server = {
    async getPrimaryService(uuid) {
      if (uuid === UUIDS.deviceInformationService || !services[uuid]) {
        throw new Error(`Service ${uuid} is unavailable`);
      }
      return services[uuid];
    }
  };

  const device = {
    id: configuration.id || 'trainer-001',
    name: configuration.name || 'Test Trainer',
    addEventListener(type, listener) {
      const listeners = deviceListeners.get(type) || new Set();
      listeners.add(listener);
      deviceListeners.set(type, listeners);
    },
    removeEventListener(type, listener) {
      deviceListeners.get(type)?.delete(listener);
    },
    gatt: {
      connected: false,
      async connect() {
        this.connected = true;
        return server;
      },
      disconnect() {
        this.connected = false;
        for (const listener of deviceListeners.get('gattserverdisconnected') || []) {
          listener({ target: device });
        }
      }
    }
  };

  const bluetooth = {
    async requestDevice(options) {
      requests.push(options);
      return device;
    }
  };

  Object.defineProperty(win.navigator, 'bluetooth', {
    configurable: true,
    value: bluetooth
  });

  win.__bleMock = {
    characteristics,
    device,
    emit(protocol, bytes) {
      const characteristic = {
        'cycling_power': characteristics.cyclingPower,
        'ftms.indoor_bike': characteristics.indoorBike,
        'heart_rate': characteristics.heartRate
      }[protocol];
      if (!characteristic) {
        throw new Error(`Unknown mock protocol: ${protocol}`);
      }
      characteristic.emit(bytes);
    },
    requests
  };
}

function createServices(characteristics) {
  return {
    [UUIDS.batteryService]: new MockService({
      [UUIDS.batteryLevel]: characteristics.battery
    }),
    [UUIDS.cyclingPowerService]: new MockService({
      [UUIDS.cyclingPowerMeasurement]: characteristics.cyclingPower
    }),
    [UUIDS.fitnessMachineService]: new MockService({
      [UUIDS.fitnessMachineControlPoint]: characteristics.controlPoint,
      [UUIDS.fitnessMachineFeature]: characteristics.fitnessMachineFeature,
      [UUIDS.indoorBikeData]: characteristics.indoorBike,
      [UUIDS.supportedResistanceRange]: characteristics.resistanceRange
    }),
    [UUIDS.heartRateService]: new MockService({
      [UUIDS.heartRateMeasurement]: characteristics.heartRate
    })
  };
}

class MockService {
  constructor(characteristics) {
    this.characteristics = characteristics;
  }

  async getCharacteristic(uuid) {
    const characteristic = this.characteristics[uuid];
    if (!characteristic) {
      throw new Error(`Characteristic ${uuid} is unavailable`);
    }
    return characteristic;
  }
}

class MockCharacteristic {
  constructor(win, { acknowledgeWrites = false, readBytes = null } = {}) {
    this.win = win;
    this.acknowledgeWrites = acknowledgeWrites;
    this.readBytes = readBytes;
    this.listeners = new Map();
    this.writes = [];
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  async startNotifications() {
    return this;
  }

  async readValue() {
    if (!this.readBytes) {
      throw new Error('Characteristic is not readable');
    }
    return dataView(this.win, this.readBytes);
  }

  async writeValueWithResponse(value) {
    const bytes = [...value];
    this.writes.push(bytes);
    if (this.acknowledgeWrites) {
      this.win.queueMicrotask(() => this.emit([0x80, bytes[0], 0x01]));
    }
  }

  emit(bytes) {
    const event = { target: { value: dataView(this.win, bytes) } };
    for (const listener of this.listeners.get('characteristicvaluechanged') || []) {
      listener(event);
    }
  }
}

function dataView(win, bytes) {
  const array = win.Uint8Array.from(bytes);
  return new win.DataView(array.buffer);
}
