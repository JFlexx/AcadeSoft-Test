# Arquitectura

> Para una visión **no técnica** de qué hace el producto, ver
> [funcionalidades.md](funcionalidades.md).

## Vista general

Monorepo con dos aplicaciones desplegables y dos paquetes compartidos.

```
apps/
  web/     → Next.js 14 (App Router) — interfaz de usuario
  api/     → NestJS — API REST + lógica de negocio
packages/
  config/  → tsconfig, eslint, prettier base
  types/   → tipos TypeScript compartidos
docker/    → docker-compose con PostgreSQL para desarrollo local
scripts/   → smoke test y seed de datos de demo
```

## Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS, sonner (toasts).
- **Backend:** NestJS, TypeScript, Prisma ORM, PostgreSQL.
- **Auth:** JWT de acceso + refresh token en cookie httpOnly; contraseñas con
  argon2; rate limiting con @nestjs/throttler.
- **Monorepo:** pnpm workspaces.
- **PDF/QR:** pdfkit + qrcode (generación de facturas en el servidor).
- **Tests:** Jest + Supertest (e2e contra una base `acedesoft_test`).

## Multi-tenancy

Aislamiento por fila (**row-level**): cada registro pertenece a un `tenantId`.
Todas las consultas filtran por el tenant del usuario autenticado, extraído del
JWT. El alta de nuevas academias es autoservicio (`POST /auth/signup`).

## Módulos de la API (NestJS)

`auth`, `users`, `students`, `teachers`, `courses`, `groups`, `enrollments`,
`sessions`, `attendance`, `invoices`, `billing`, `settings`, más un
`HealthController`.

## Facturación y cumplimiento (Veri\*Factu)

- Numeración correlativa por tenant (`prefijo-año-NNNN`).
- **Cadena de hash SHA-256** entre facturas (anti-manipulación) calculada dentro
  de una transacción con bloqueo de fila sobre el contador del tenant — ver
  `apps/api/src/invoices/invoice-hash.ts`.
- Inmutabilidad: las facturas con hash no se pueden borrar ni cambiar de fecha.
- QR de verificación AEAT embebido en el PDF; facturas rectificativas por
  sustitución.

## Cobros y SEPA

- Pagos parciales/totales que recalculan el estado de la factura.
- Generación de remesa de domiciliación SEPA `pain.008.001.02` a partir de las
  facturas pendientes del mes — ver `apps/api/src/billing/sepa.ts`.

## Principios

- Código pequeño y revisable por feature (PRs pequeños directos a `main`).
- Sin magia: configuración explícita.
- El repositorio debe quedar ejecutable (`pnpm dev`) y con la suite e2e en verde
  tras cada merge.

## Pendiente / hoja de ruta

- Mensajería por email (proveedor por decidir, p. ej. Resend).
- Portal de familias (login de tutor/alumno).
- Envío en tiempo real a la AEAT de los registros Veri\*Factu (requiere
  certificado de una academia real en producción).
- Bump de CI a Node 24 (hoy en Node 20).
