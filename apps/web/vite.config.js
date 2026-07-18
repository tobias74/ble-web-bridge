import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, searchForWorkspaceRoot } from 'vite';

import { createBlePluginBuildPlugin, loadPluginBuild } from './plugin-build.js';

export default defineConfig(async () => {
  const pluginBuild = await loadPluginBuild();
  const pluginDirectories = pluginBuild.plugins.map((plugin) => path.dirname(plugin.modulePath));

  return {
    plugins: [react(), createBlePluginBuildPlugin(pluginBuild)],
    server: pluginDirectories.length > 0
      ? { fs: { allow: [searchForWorkspaceRoot(process.cwd()), ...pluginDirectories] } }
      : undefined
  };
});
