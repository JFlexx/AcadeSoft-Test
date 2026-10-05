import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@acedesoft/types'],
  // Self-contained server bundle for the Docker image (apps/web/Dockerfile).
  output: 'standalone',
  poweredByHeader: false,
  experimental: {
    // Monorepo: trace dependencies from the workspace root.
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
};

export default nextConfig;
