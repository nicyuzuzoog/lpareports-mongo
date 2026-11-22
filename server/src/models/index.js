/**
 * @deprecated The application now uses Prisma over MySQL. See
 * `src/lib/prisma.js` and `prisma/schema.prisma`. Nothing should import this
 * module; it exists only so stale imports fail with a clear message.
 */
throw new Error(
  'Deprecated Mongo/Mongoose model layer was imported. Use prisma from src/lib/prisma.js instead.'
);
