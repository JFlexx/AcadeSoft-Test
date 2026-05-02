# AcadeSoft

SaaS moderno de gestión para academias. Multi-tenant desde el diseño.

## Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend:** NestJS, TypeScript, Prisma, PostgreSQL
- **Monorepo:** pnpm workspaces

## Estructura

```
acedesoft/
├── apps/
│   ├── api/        # NestJS
│   └── web/        # Next.js
├── packages/
│   ├── config/     # tsconfig / eslint / prettier base
│   └── types/      # tipos TS compartidos
├── docs/           # documentación técnica
└── docker/         # docker-compose local
```

## Quickstart

Ver [docs/getting-started.md](docs/getting-started.md). Resumen:

```bash
pnpm install
docker compose -f docker/docker-compose.yml up -d
cp .env.example apps/api/.env
echo 'NEXT_PUBLIC_API_URL="http://localhost:3001"' > apps/web/.env.local
pnpm --filter api prisma:migrate
pnpm --filter api prisma:seed
pnpm dev
```

Credenciales por defecto tras el seed (overrideables con `SEED_*` en `.env`):
`tenantSlug: acme` · `email: admin@acme.local` · `password: ChangeMe123!`

Login desde UI: http://localhost:3000/login

## Tests

E2E con Jest + Supertest contra una base separada `acedesoft_test`.

```bash
# Una sola vez: crear la BD de tests
docker exec acedesoft_postgres createdb -U acedesoft acedesoft_test

# Aplicar migraciones a la BD de tests (idempotente, reaplicar tras cada cambio de schema)
pnpm --filter api test:db:migrate

# Correr suite e2e
pnpm --filter api test:e2e
```

Cada `it()` arranca con la BD truncada y un seed mínimo (1 tenant + 1 admin role + 1 admin user).

- Web → http://localhost:3000
- API → http://localhost:3001/health

## Documentación

- [Arquitectura](docs/architecture.md)
- [Convenciones de código y naming](docs/conventions.md)
- [Cómo arrancar](docs/getting-started.md)

## Git flow

Usamos **Git Flow** clásico:

| Rama | Propósito |
|---|---|
| `main` | Producción, siempre estable. Solo recibe merges desde `develop` o `hotfix/*`. |
| `develop` | Rama de integración. Todas las features se mergean aquí. |
| `feature/*` | Nuevas funcionalidades. Parten de `develop`, vuelven a `develop`. |
| `fix/*` | Correcciones no urgentes. Parten de `develop`. |
| `hotfix/*` | Correcciones urgentes en producción. Parten de `main` y se mergean a `main` y `develop`. |

### Convenciones de commit

Formato: `tipo(scope): mensaje corto en imperativo`

Tipos: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`.

Ejemplos:
- `feat(api): add students module`
- `chore(repo): init monorepo scaffold`
- `docs(readme): add gitflow section`

### Reglas de PR

- PRs pequeños y revisables. Si una tarea no cabe en un PR, dividir.
- El repo debe quedar ejecutable (`pnpm dev`) tras cada merge.
- No mezclar refactors con features en el mismo PR.
- Deuda técnica: abrir issue aparte, no colar en el PR actual.

## Estado actual — Sprint 1

- [x] Scaffold monorepo (pnpm + apps + packages + docs + docker)
- [x] Skeleton NestJS con `/health`
- [x] Skeleton Next.js con home mínima
- [x] `packages/config` (tsconfig/eslint/prettier base)
- [x] `packages/types` (vacío, listo para llenar)
- [x] **Modelo de datos Prisma (MVP)** — `apps/api/prisma/schema.prisma`
- [x] **Módulo Auth (JWT + refresh)** — `apps/api/src/auth` + `GET /users/me`
- [x] **Seed inicial de datos** — `apps/api/prisma/seed.ts` (tenant demo + 3 roles + admin)
- [x] **Login UI conectado** — `/login` y `/me` en `apps/web` consumen la API real (auth context + refresh silencioso)
- [x] **Layout autenticado + UI de `students`** — sidebar nav, auth guard centralizado, CRUD inline contra `/students`
- [x] **UI de `groups` + detalle con inscripciones** — `/groups` (lista + form, filtro por curso) y `/groups/[id]` (info + alta/baja/cambio de estado de alumnos)
- [x] **Gestión de sesiones en detalle de grupo** — `/groups/[id]` ahora incluye sección "Sesiones" con CRUD inline (datetime-local, profesor pre-poblado del grupo)
- [x] **UI de detalle de sesión + asistencia** — `/sessions/[id]` con tabla de asistencia (PRESENT por defecto), bulk save atómico, cambio de estado de la sesión
- [x] **Testing infra (e2e)** — Jest + Supertest + BD `acedesoft_test`, primer suite cubre auth completo
- [x] **Módulo `students`** — CRUD con tenant scoping + suite e2e (incl. test de aislamiento entre tenants)
- [x] **Módulo `teachers`** — mismo patrón, CRUD + e2e
- [x] **Módulo `courses`** — CRUD + e2e (incl. 409 al borrar con groups dependientes)
- [x] **Módulo `groups`** — CRUD + cross-tenant FK validation (course/teacher) + cascade a enrollments/sessions
- [x] **Módulo `enrollments`** — student↔group con filtros, 409 en duplicados, cross-tenant FK
- [x] **Módulo `sessions`** — clases planificadas, filtros (groupId, status, rango de fechas), cross-tenant FK
- [x] **Módulo `attendance`** — anidado bajo `/sessions/:id/attendance`, bulk upsert atómico, validación cross-tenant
- [ ] Módulo de negocio restante (payments)

## Modelo de datos (resumen)

Entidades del MVP, con `tenantId` para aislamiento multi-tenant:

```
Tenant → User → Role
       → Teacher
       → Course → Group → Session → Attendance
       → Student ← Guardian
                ← Enrollment → Group
       → Invoice → Payment
                 ← Student
       → AuditLog
```

Schema completo: [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma).

## Auth — endpoints

Implementado en [apps/api/src/auth](apps/api/src/auth). JWT access (15m, header `Authorization: Bearer`) + refresh token (7d, cookie `refresh_token` httpOnly + SameSite=strict, hash almacenado en `User.refreshToken` para permitir revocación).

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/auth/register` | — | Crea usuario en un tenant existente. Body: `tenantSlug`, `roleName`, `email`, `password`, `firstName`, `lastName`. |
| POST | `/auth/login` | — | Body: `tenantSlug`, `email`, `password`. Devuelve `accessToken` y setea cookie refresh. |
| POST | `/auth/refresh` | cookie refresh | Rota el refresh token y devuelve nuevo `accessToken`. |
| POST | `/auth/logout` | Bearer | Invalida el refresh token guardado y borra la cookie. |
| GET  | `/users/me` | Bearer | Perfil del usuario autenticado (incluye role + tenant). |

Password hashing con **argon2id**. Decoradores disponibles: `@CurrentUser()`, `@Roles(...)` + `RolesGuard`.

## Students — endpoints

Implementado en [apps/api/src/students](apps/api/src/students). Todas las rutas exigen Bearer y filtran por `tenantId` extraído del JWT — un tenant nunca ve datos de otro.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/students` | Crea un alumno. Body: `firstName`, `lastName` (req); `email`, `phone`, `birthDate` (ISO), `gender`, `address`, `photoUrl`, `notes` (opt). |
| GET  | `/students` | Lista todos los alumnos del tenant, ordenados por `lastName, firstName`. |
| GET  | `/students/:id` | Detalle. 404 si no existe o pertenece a otro tenant. |
| PATCH | `/students/:id` | Actualiza campos (incl. `isActive`). |
| DELETE | `/students/:id` | Borra (hard delete, cascada a guardians/enrollments/attendances/invoices). 204. |

## Teachers — endpoints

Implementado en [apps/api/src/teachers](apps/api/src/teachers). Mismo patrón que students: Bearer obligatorio + tenant scoping vía JWT.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/teachers` | Crea profesor. Body: `firstName`, `lastName` (req); `email`, `phone`, `bio`, `photoUrl` (opt). |
| GET  | `/teachers` | Lista del tenant, ordenado por `lastName, firstName`. |
| GET  | `/teachers/:id` | Detalle. 404 cross-tenant. |
| PATCH | `/teachers/:id` | Actualiza (incl. `isActive`). |
| DELETE | `/teachers/:id` | Hard delete (cascade a groups/sessions). 204. |

## Courses — endpoints

Implementado en [apps/api/src/courses](apps/api/src/courses). Bearer + tenant scoping.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/courses` | Crea curso. Body: `name` (req); `description`, `color` (hex) (opt). |
| GET  | `/courses` | Lista del tenant, ordenado por `name`. |
| GET  | `/courses/:id` | Detalle. 404 cross-tenant. |
| PATCH | `/courses/:id` | Actualiza (incl. `isActive`). |
| DELETE | `/courses/:id` | Borra. **409** si tiene groups dependientes — borrar groups primero. 204. |

## Groups — endpoints

Implementado en [apps/api/src/groups](apps/api/src/groups). Bearer + tenant scoping. **Valida que `courseId` y `teacherId` pertenezcan al mismo tenant antes de tocar la BD** — un usuario nunca puede crear un group apuntando a recursos de otro tenant.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/groups` | Crea grupo. Body: `courseId`, `name` (req); `teacherId`, `description`, `schedule` (Json libre), `startDate`, `endDate` (ISO), `maxCapacity` (≥1) (opt). 400 si `courseId`/`teacherId` no existen en el tenant. |
| GET  | `/groups` | Lista del tenant, ordenado por `name`. |
| GET  | `/groups/:id` | Detalle. 404 cross-tenant. |
| PATCH | `/groups/:id` | Actualiza (incl. `isActive`). Cross-tenant FK también validada. |
| DELETE | `/groups/:id` | Borra. Cascada en `enrollments` y `sessions` por schema. 204. |

## Enrollments — endpoints

Implementado en [apps/api/src/enrollments](apps/api/src/enrollments). El modelo no lleva `tenantId` propio — el filtro va vía `student.tenantId`. `studentId`/`groupId` no son actualizables (para mover, DELETE + POST).

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/enrollments` | Inscribe alumno. Body: `studentId`, `groupId` (req); `status` (`ACTIVE`/`PENDING`/`COMPLETED`/`DROPPED`, default `ACTIVE`), `notes` (opt). **409** si ya existe. **400** si los IDs no están en el tenant. |
| GET  | `/enrollments?studentId=&groupId=&status=` | Lista. Query params opcionales. Ordenado por `enrolledAt` desc. |
| GET  | `/enrollments/:id` | Detalle. 404 cross-tenant. |
| PATCH | `/enrollments/:id` | Actualiza `status`, `droppedAt`, `notes`. |
| DELETE | `/enrollments/:id` | Hard delete. 204. |

## Sessions — endpoints

Implementado en [apps/api/src/sessions](apps/api/src/sessions). Bearer + tenant scoping. Cross-tenant FK validada para `groupId` y `teacherId`. Cascada a `attendance` (cuando exista) por schema.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/sessions` | Crea sesión. Body: `groupId`, `scheduledAt` (ISO) (req); `teacherId`, `status` (default `SCHEDULED`), `notes` (opt). |
| GET  | `/sessions?groupId=&status=&from=&to=` | Lista del tenant. Filtros opcionales (rango de fechas inclusivo). Ordenado por `scheduledAt` asc. |
| GET  | `/sessions/:id` | Detalle. 404 cross-tenant. |
| PATCH | `/sessions/:id` | Actualiza `scheduledAt`, `startedAt`, `endedAt`, `teacherId`, `status`, `notes`. |
| DELETE | `/sessions/:id` | Hard delete (cascade a `attendance`). 204. |

## Attendance — endpoints

Implementado en [apps/api/src/attendance](apps/api/src/attendance). Anidado bajo `/sessions/:sessionId/attendance` — el contexto de sesión es obligatorio. URLs usan `studentId` (no el `attendanceId` interno) gracias al unique `[sessionId, studentId]`.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/sessions/:sessionId/attendance` | **Bulk upsert atómico**. Body: `{ items: [{ studentId, status, notes? }, ...] }`. Re-marcar reemplaza. Toda la operación en una transacción Prisma. **404** si sesión no es del tenant; **400** si algún `studentId` no es del tenant o se duplica en el array. |
| GET  | `/sessions/:sessionId/attendance` | Lista de la sesión, ordenada por `markedAt` asc. |
| PATCH | `/sessions/:sessionId/attendance/:studentId` | Actualiza una marca (`status`, `notes`). |
| DELETE | `/sessions/:sessionId/attendance/:studentId` | Borra una marca. 204. |

`AttendanceStatus`: `PRESENT`, `ABSENT`, `LATE`, `EXCUSED`.
