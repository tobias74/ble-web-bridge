export const manifest = {
  apiVersion: 1,
  id: 'example.profile',
  label: 'Example profile',
  discoveryServices: [
    {
      key: 'exampleService',
      label: 'Example service',
      service: '12345678-1234-5678-1234-56789abcdef0'
    }
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

const plugin = {
  manifest,
  async attach() {
    return null;
  }
};

export default plugin;
