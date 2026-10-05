/**
 * Fail-fast validation of the environment, run by ConfigModule at boot.
 * A misconfigured deploy refuses to start with a clear list of problems
 * instead of failing later (or worse, running with insecure defaults).
 */

const REQUIRED = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_ACCESS_EXPIRES_IN', // without it tokens would never expire
  'JWT_REFRESH_SECRET',
  'JWT_REFRESH_EXPIRES_IN',
  'COOKIE_SECRET',
  'WEB_ORIGIN',
] as const;

const SECRETS = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'COOKIE_SECRET'] as const;

/** Values copied from .env.example / docs — public, so never valid in prod. */
const PLACEHOLDER = /change_?me|dummy|example|placeholder|^dev_|^test_/i;

const MIN_SECRET_LENGTH = 32;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const get = (k: string) =>
    typeof config[k] === 'string' ? (config[k] as string).trim() : '';
  const errors: string[] = [];

  for (const k of REQUIRED) {
    if (!get(k)) errors.push(`${k} es obligatoria`);
  }

  // Always wrong, in any environment: the publishable key is for browsers.
  if (get('STRIPE_SECRET_KEY').startsWith('pk_')) {
    errors.push(
      'STRIPE_SECRET_KEY contiene la clave publicable (pk_…); debe ser la secreta (sk_…)',
    );
  }

  if (get('NODE_ENV') === 'production') {
    for (const k of SECRETS) {
      const v = get(k);
      if (!v) continue;
      if (v.length < MIN_SECRET_LENGTH) {
        errors.push(`${k} debe tener al menos ${MIN_SECRET_LENGTH} caracteres en producción`);
      }
      if (PLACEHOLDER.test(v)) {
        errors.push(`${k} es un valor de ejemplo; genera uno aleatorio`);
      }
    }
    if (get('JWT_ACCESS_SECRET') && get('JWT_ACCESS_SECRET') === get('JWT_REFRESH_SECRET')) {
      errors.push('JWT_ACCESS_SECRET y JWT_REFRESH_SECRET deben ser distintos');
    }
    const origin = get('WEB_ORIGIN');
    if (origin && !origin.startsWith('https://')) {
      errors.push('WEB_ORIGIN debe usar https:// en producción');
    }
    if (get('THROTTLE_DISABLED') === 'true') {
      errors.push('THROTTLE_DISABLED no puede estar activo en producción');
    }
    if (get('STRIPE_SECRET_KEY') && !get('STRIPE_WEBHOOK_SECRET')) {
      errors.push('STRIPE_WEBHOOK_SECRET es obligatoria si se configura STRIPE_SECRET_KEY');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuración inválida:\n - ${errors.join('\n - ')}`);
  }
  return config;
}
