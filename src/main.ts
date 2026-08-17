#!/usr/bin/env node
/**
 * Process entry point: load config, build the app, start the server and shut
 * down cleanly on SIGINT/SIGTERM.
 */

import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { startServer } from './server.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    const message = error instanceof ConfigError ? error.message : String(error);
    process.stderr.write(`Configuration error: ${message}\n`);
    process.exitCode = 78; // EX_CONFIG
    return;
  }

  const logger = createLogger({ level: config.logLevel });
  const app = createApp({ config, logger });
  const running = await startServer({ app, logger });

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info('server.shutdown', { signal });
    running
      .close()
      .then(() => {
        logger.info('server.closed');
        process.exit(0);
      })
      .catch((error: unknown) => {
        logger.error('server.shutdown_failed', { error: String(error) });
        process.exit(1);
      });

    // Do not hang forever on lingering keep-alive sockets.
    const forceExit = setTimeout(() => {
      logger.warn('server.force_exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled_rejection', { reason: String(reason) });
  });
  process.on('uncaughtException', (error: Error) => {
    logger.error('uncaught_exception', { message: error.message, stack: error.stack });
    process.exit(1);
  });
}

main().catch((error: unknown) => {
  process.stderr.write(`Fatal startup error: ${String(error)}\n`);
  process.exit(1);
});
