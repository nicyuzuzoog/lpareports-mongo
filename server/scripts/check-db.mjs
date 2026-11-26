import 'dotenv/config';
import { prisma } from '../src/lib/db.js';

try {
  await prisma.$connect();
  const [users, classes, cards] = await Promise.all([
    prisma.user.count(),
    prisma.schoolClass.count(),
    prisma.reportCard.count()
  ]);
  console.log(
    `MONGO OK — users=${users}, classes=${classes}, reportCards=${cards}`
  );
} catch (error) {
  console.error('MONGO ERROR:', error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
