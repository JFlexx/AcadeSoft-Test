import * as dotenv from 'dotenv';
import * as path from 'path';
import { execSync } from 'child_process';

dotenv.config({
  path: path.resolve(__dirname, '..', '.env.test'),
  override: true,
});

execSync('prisma migrate deploy', {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..'),
  env: process.env,
});
