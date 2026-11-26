import app from './app.js';
import { config } from './config/env.js';
import { prisma } from './lib/db.js';
import { ensureSeeded } from './lib/bootstrap.js';

async function start() {
  try {
    await prisma.$connect();
    await ensureSeeded();
  } catch (error) {
    console.error('Unable to connect to MongoDB:', error.message);
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`LPAREPORTS API listening on port ${config.port}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start();
