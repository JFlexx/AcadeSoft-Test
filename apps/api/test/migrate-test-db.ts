import * as dotenv from 'dotenv';
import * as path from 'path';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

dotenv.config({
  path: path.resolve(__dirname, '..', '.env.test'),
  override: true,
});

/**
 * Migrates the test database. It is throwaway, so commits don't wait for
 * the disk flush (synchronous_commit = off): on Docker Desktop that alone
 * makes the e2e suite several times faster.
 */
async function main() {
  execSync('prisma migrate deploy', {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
    env: process.env,
  });
  const db = new PrismaClient();
  try {
    await db.$executeRawUnsafe(
      `DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET synchronous_commit = off', current_database()); END $$`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
