# Puesta en marcha

Guía práctica para arrancar AcadeSoft en un ordenador. Para qué hace el
producto (sin tecnicismos), ver [funcionalidades.md](funcionalidades.md).

## Requisitos

- Node.js 20+
- pnpm 9+
- Docker Desktop (para la base de datos PostgreSQL)

## Pasos

```bash
# 1. Instalar dependencias
pnpm install

# 2. Levantar la base de datos (PostgreSQL en Docker)
docker compose -f docker/docker-compose.yml up -d

# 3. Variables de entorno
cp .env.example apps/api/.env
echo 'NEXT_PUBLIC_API_URL="http://localhost:3001"' > apps/web/.env.local

# 4. Crear las tablas (migraciones) y el usuario admin inicial
pnpm --filter api exec prisma migrate deploy
pnpm --filter api prisma:seed

# 5. Arrancar API + Web en paralelo
pnpm dev
```

## Acceso

- **Web:** http://localhost:3000
- **API:** http://localhost:3001
- **Health check:** http://localhost:3001/health

Credenciales por defecto tras el seed (cambiables con variables `SEED_*` en
`apps/api/.env`):

- Academia (slug): `acme`
- Usuario: `admin@acme.local`
- Contraseña: `ChangeMe123!`

Login: http://localhost:3000/login

## Datos de demostración (recomendado para enseñar el producto)

Con la API ya arrancada (paso 5), en otra terminal:

```bash
node scripts/seed-demo.mjs
```

Crea una "Academia Demo" poblada: 3 profesores, 3 cursos, 4 grupos, 7 alumnos
(con domiciliación SEPA y descuentos de hermanos), inscripciones, clases pasadas
y futuras, asistencia, las facturas del mes y algunos pagos. Así la app se ve
"con vida" en una demostración.

> El script no duplica datos: si ya existen, avisa y no hace nada. Para empezar
> de cero, vaciar la base de datos de desarrollo y repetir los pasos 4 y la
> demo.

### Portal de familias (demo)

Desde la ficha de un alumno (admin) → **"Invitar a la familia"** se crea un
acceso. El login del portal es el mismo (`/login`) y redirige a `/portal`.

### Inscripción online (demo)

En **Ajustes** hay un **enlace de inscripción** (`/enroll/<slug>`) que se puede
abrir sin login para que una familia se inscriba sola.

### Pagos con tarjeta (Stripe, opcional)

Para probar el cobro con tarjeta, en `apps/api/.env`:

```
STRIPE_SECRET_KEY="sk_test_..."      # Secret key (NO la pk_)
STRIPE_WEBHOOK_SECRET="whsec_..."    # de `stripe listen --forward-to localhost:3001/stripe/webhook`
```

Tarjeta de test: `4242 4242 4242 4242`. Sin claves, el resto de la app funciona
igual; solo el botón "Pagar con tarjeta" queda inactivo.

## Tests

Suite e2e con Jest + Supertest contra una base separada `acedesoft_test`.

```bash
# Una sola vez: crear la BD de tests
docker exec acedesoft_postgres createdb -U acedesoft acedesoft_test

# Aplicar migraciones a la BD de tests (reaplicar tras cada cambio de schema)
pnpm --filter api test:db:migrate

# Correr la suite
pnpm --filter api test:e2e
```

También hay un smoke test del flujo completo de cobro contra la API en marcha:

```bash
node scripts/smoke-e2e.mjs
```
