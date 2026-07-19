# Build-time Profile Plugins

Profile plugins add BLE discovery services, telemetry sources, capabilities, and command handlers without placing device-specific code in the public host.

## Build Configuration

Set `BLE_BRIDGE_PLUGIN_CONFIG` to an absolute or working-directory-relative JSON path:

```json
{
  "apiVersion": 1,
  "plugins": [
    { "module": "./src/example-profile.js" }
  ]
}
```

Module paths resolve relative to the configuration file and are bundled in list order. Omitting the environment variable produces a standard-profile-only build.

### Build commands

On Linux or macOS:

```bash
BLE_BRIDGE_PLUGIN_CONFIG=/absolute/path/ble-bridge.plugins.json npm run build
```

In PowerShell:

```powershell
$env:BLE_BRIDGE_PLUGIN_CONFIG = 'E:\private-profiles\ble-bridge.plugins.json'
npm run build
Remove-Item Env:BLE_BRIDGE_PLUGIN_CONFIG
```

Set the variable before `npm run dev:web` instead when developing interactively. It is read when Vite starts, so restart Vite after changing the configuration. Once built, the profile code is part of the browser bundle; the source repository does not need to be available to the running server.

## Creating a Minimal Private Profile

The following read-only example is complete. It discovers a private BLE service, subscribes to one characteristic, reads a little-endian 16-bit power value, and emits normalized telemetry. Replace the two example UUIDs and the packet parsing with values for your device.

Keep the profile outside the public checkout:

```text
private-profiles/
  ble-bridge.plugins.json
  src/
    example-profile.js
```

`ble-bridge.plugins.json`:

```json
{
  "apiVersion": 1,
  "plugins": [
    { "module": "./src/example-profile.js" }
  ]
}
```

`src/example-profile.js`:

```js
const SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const TELEMETRY_UUID = '12345678-1234-5678-1234-56789abcdef1';

export const manifest = {
  apiVersion: 1,
  id: 'example.profile',
  label: 'Example private profile',
  discoveryServices: [
    {
      key: 'exampleService',
      label: 'Example private service',
      service: SERVICE_UUID
    }
  ],
  protocols: [
    {
      id: 'example.telemetry',
      label: 'Example telemetry',
      metricPriorities: { powerW: 50 }
    }
  ],
  handledCommandTypes: [],
  commands: []
};

const plugin = {
  manifest,

  async attach({ gattServer, emitTelemetry }) {
    const service = await gattServer.getPrimaryService(SERVICE_UUID);
    const characteristic = await service.getCharacteristic(TELEMETRY_UUID);

    function onValueChanged(event) {
      const value = event.target.value;
      if (!value || value.byteLength < 2) {
        return;
      }

      emitTelemetry({
        protocol: 'example.telemetry',
        values: {
          powerW: value.getUint16(0, true)
        },
        raw: {
          bytes: Array.from(new Uint8Array(
            value.buffer,
            value.byteOffset,
            value.byteLength
          ))
        }
      });
    }

    characteristic.addEventListener('characteristicvaluechanged', onValueChanged);
    await characteristic.startNotifications();

    return {
      capabilities: {},

      disconnect() {
        characteristic.removeEventListener('characteristicvaluechanged', onValueChanged);
        const stopped = characteristic.stopNotifications?.();
        stopped?.catch?.(() => undefined);
      }
    };
  }
};

export default plugin;
```

From the public checkout, build it in PowerShell with:

```powershell
$env:BLE_BRIDGE_PLUGIN_CONFIG = 'E:\private-profiles\ble-bridge.plugins.json'
npm run build
Remove-Item Env:BLE_BRIDGE_PLUGIN_CONFIG
```

The generated application automatically adds the declared service to Web Bluetooth discovery. When a matching device connects, the host calls `attach()`, supplies the GATT server, and adds device identity, source identity, and timestamps to emitted telemetry.

## Module Contract

The module must have no browser-only top-level side effects because the build imports it for validation. It must export its serializable manifest as a named export and default-export an adapter whose `manifest` property references that same object. The adapter must implement `attach(context)` and may implement `formatCommand(command)` for commands it declares.

Extension command types must not reuse the host's built-in command types. A plugin may list built-in types under `handledCommandTypes` when its device can execute those standard commands.

## Attach Context

`attach()` receives:

- `gattServer`: the connected `BluetoothRemoteGATTServer`.
- `device`: the selected `BluetoothDevice`.
- `deviceInfo`: public metadata read by the host.
- `emitTelemetry(payload)`: emits a declared protocol with normalized `values`, optional `info` and `raw`, and optional `connected` state.

The host assigns device identity, source ID, and timestamp. Emitting a protocol not declared in the manifest is rejected.

Return `null` when the device does not expose the profile. Otherwise return a connection with:

- `getCapabilities()` or a `capabilities` object.
- `handlesCommand(command)` and `applyCommand(command, options)` when the profile supports writes.
- `disconnect()` to remove listeners and stop plugin-owned notifications.

Connection failures are isolated to the plugin. Standard profiles remain available.

## Commands and Relay Manifest

Supported field types are `number`, `integer`, `boolean`, and `string`. Numeric fields may specify `min` and `max`; fields may be required or define a default. Plugin permissions default off unless explicitly enabled in the manifest.

For example, a writable profile can add this descriptor to its manifest and return matching `getCapabilities()`, `handlesCommand()`, and `applyCommand()` functions from `attach()`:

```js
handledCommandTypes: ['example.calibrate'],
commands: [
  {
    type: 'example.calibrate',
    label: 'Calibration command',
    permissionKey: 'exampleCalibration',
    permissionLabel: 'Calibration',
    capability: 'canCalibrateExample',
    tier: 'advanced',
    defaultEnabled: false,
    fields: {
      level: { type: 'integer', required: true, min: 0, max: 10 }
    }
  }
]
```

The build emits `ble-plugin-manifest.json`. The Node relay reads that file, accepts only declared extension types, copies only declared fields, clamps numeric limits, applies TTL, and retains the existing payload and rate limits. The browser connection must recheck permission, capability, expiry, and semantic validity immediately before a BLE write.

Configured plugins are part of the browser bundle and execute with its privileges. Server administrators must only configure trusted modules.
