import { Server } from 'http';
import { config } from './config/env';
import { closePool, verifyDatabaseConnection } from './config/database';
import { createApp } from './app';

const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Readable one-line description of a startup error (some pg errors have an empty message). */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return [code, err.message].filter(Boolean).join(': ') || err.name;
  }
  return String(err);
}

function registerShutdownHandlers(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[server] ${signal} received, shutting down gracefully...`);

    // If something hangs (e.g. a long-running request), force exit after a timeout.
    setTimeout(() => {
      console.error('[server] Shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    // 1. Stop accepting new connections and let in-flight requests finish.
    server.close(async (closeErr) => {
      // 2. Then close the database pool.
      try {
        await closePool();
      } catch (poolErr) {
        console.error('[server] Error closing database pool:', describeError(poolErr));
        process.exit(1);
      }
      process.exit(closeErr ? 1 : 0);
    });
  };

  process.on('SIGINT', shutdown); // Ctrl+C
  process.on('SIGTERM', shutdown); // sent by process managers / containers
}

async function start(): Promise<void> {
  // Refuse to start if the database is unreachable, rather than failing on the first request.
  await verifyDatabaseConnection();

  const server = createApp().listen(config.port, () => {
    console.log(`[server] Listening on http://localhost:${config.port} (${config.nodeEnv})`);
  });

  registerShutdownHandlers(server);
}

start().catch(async (err: unknown) => {
  console.error('[server] Failed to start:', describeError(err));
  await closePool().catch(() => undefined);
  process.exit(1);
});
