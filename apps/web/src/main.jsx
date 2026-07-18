import React from 'react';
import { createRoot } from 'react-dom/client';
import { BLE_PROFILE_PLUGINS } from 'virtual:ble-bridge-plugins';

import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App plugins={BLE_PROFILE_PLUGINS} />
  </React.StrictMode>
);
