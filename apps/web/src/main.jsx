import React from 'react';
import { createRoot } from 'react-dom/client';
import { BLE_PROFILE_PLUGINS } from 'virtual:ble-bridge-plugins';

import App from './App.jsx';
import { I18nProvider } from './i18n.js';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <App plugins={BLE_PROFILE_PLUGINS} />
    </I18nProvider>
  </React.StrictMode>
);
