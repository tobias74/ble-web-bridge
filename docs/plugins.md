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

## Module Contract

The module must have no browser-only top-level side effects because the build imports it for validation. It exports the same manifest as a named export and through its default adapter:

```js
export const manifest = {
  apiVersion: 1,
  id: 'example.profile',
  label: 'Example profile',
  discoveryServices: [
    { key: 'exampleService', label: 'Example service', service: 'service-uuid' }
  ],
  protocols: [
    {
      id: 'example.telemetry',
      label: 'Example telemetry',
      metricPriorities: { powerW: 50 }
    }
  ],
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
};

export default {
  manifest,
  async attach(context) {
    return connection;
  },
  formatCommand(command) {
    return '';
  }
};
```

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

The build emits `ble-plugin-manifest.json`. The Node relay reads that file, accepts only declared extension types, copies only declared fields, clamps numeric limits, applies TTL, and retains the existing payload and rate limits. The browser connection must recheck permission, capability, expiry, and semantic validity immediately before a BLE write.

Configured plugins are part of the browser bundle and execute with its privileges. Server administrators must only configure trusted modules.
