// Pure unit tests of the boot-time env validation. Lives in the e2e suite
// because that is the jest config CI runs.
import { validateEnv } from '../src/config/env.validation';

const strong = (c: string) => c.repeat(40); // 40 chars, no placeholder words

const DEV = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'dev_access_secret_change_me',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_SECRET: 'dev_refresh_secret_change_me',
  JWT_REFRESH_EXPIRES_IN: '7d',
  COOKIE_SECRET: 'dev_cookie_secret_change_me',
  WEB_ORIGIN: 'http://localhost:3000',
};

const PROD = {
  ...DEV,
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: strong('a'),
  JWT_REFRESH_SECRET: strong('b'),
  COOKIE_SECRET: strong('c'),
  WEB_ORIGIN: 'https://app.example.org',
};

describe('validateEnv', () => {
  it('accepts a normal development config (example values are fine outside prod)', () => {
    expect(() => validateEnv(DEV)).not.toThrow();
  });

  it('accepts a correct production config', () => {
    expect(() => validateEnv(PROD)).not.toThrow();
  });

  it('requires the essentials, including token expiry', () => {
    const { JWT_ACCESS_EXPIRES_IN, DATABASE_URL, ...rest } = DEV;
    void JWT_ACCESS_EXPIRES_IN;
    void DATABASE_URL;
    expect(() => validateEnv(rest)).toThrow(/DATABASE_URL es obligatoria[\s\S]*JWT_ACCESS_EXPIRES_IN es obligatoria/);
  });

  it('rejects the public example secrets in production', () => {
    expect(() =>
      validateEnv({ ...PROD, JWT_ACCESS_SECRET: 'dev_access_secret_change_me_but_made_longer' }),
    ).toThrow(/JWT_ACCESS_SECRET es un valor de ejemplo/);
  });

  it('rejects short or shared JWT secrets in production', () => {
    expect(() => validateEnv({ ...PROD, COOKIE_SECRET: 'short' })).toThrow(/al menos 32/);
    expect(() =>
      validateEnv({ ...PROD, JWT_REFRESH_SECRET: PROD.JWT_ACCESS_SECRET }),
    ).toThrow(/deben ser distintos/);
  });

  it('requires https and rate limiting in production', () => {
    expect(() => validateEnv({ ...PROD, WEB_ORIGIN: 'http://app.example.org' })).toThrow(/https/);
    expect(() => validateEnv({ ...PROD, THROTTLE_DISABLED: 'true' })).toThrow(/THROTTLE_DISABLED/);
  });

  it('catches a Stripe publishable key used as the secret key (any env)', () => {
    expect(() => validateEnv({ ...DEV, STRIPE_SECRET_KEY: 'pk_test_123' })).toThrow(/clave publicable/);
    expect(() => validateEnv({ ...DEV, STRIPE_SECRET_KEY: 'sk_test_123' })).not.toThrow();
  });

  it('in production, a Stripe key needs its webhook secret', () => {
    expect(() => validateEnv({ ...PROD, STRIPE_SECRET_KEY: 'sk_live_123' })).toThrow(/STRIPE_WEBHOOK_SECRET/);
    expect(() =>
      validateEnv({ ...PROD, STRIPE_SECRET_KEY: 'sk_live_123', STRIPE_WEBHOOK_SECRET: 'whsec_1' }),
    ).not.toThrow();
  });

  it('reports every problem at once', () => {
    try {
      validateEnv({ NODE_ENV: 'production' });
      throw new Error('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg.match(/obligatoria/g)?.length).toBe(7);
    }
  });
});
