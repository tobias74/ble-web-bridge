import { createApp } from './app.js';
import { DEFAULT_CONFIG } from './config.js';

const app = createApp();

try {
  await app.listen({
    host: DEFAULT_CONFIG.host,
    port: DEFAULT_CONFIG.port
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
