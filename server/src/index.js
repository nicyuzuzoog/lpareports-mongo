import app from './app.js';
import { config } from './config/env.js';
import { prisma } from './lib/prisma.js';

async function start() {
  try {
    await prisma.$connect();
    console.log('Database connection established.');
  } catch (error) {
    console.error('Unable to connect to the database:', error.message);
    process.exit(1);
  }

  const server = app.listen(config.port, () => {
    console.log(`LPACAMIS API listening on port ${config.port} (${config.env}).`);
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
