# Arquitectura

## Vista general

Monorepo con dos aplicaciones desplegables y dos paquetes compartidos.

```
apps/
  web/     → Next.js 14 (App Router)
  api/     → NestJS
packages/
  config/  → tsconfig, eslint, prettier base
  types/   → tipos TypeScript compartidos
```

## Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Backend:** NestJS, TypeScript (Prisma + PostgreSQL se añaden en próximo sprint)
- **Monorepo:** pnpm workspaces

## Principios

- Código pequeño y revisable por feature.
- Sin magia: configuración explícita.
- Multi-tenant previsto desde el diseño (se materializa en el sprint de modelo de datos).
- El repositorio debe quedar ejecutable (`pnpm dev`) tras cada merge.

## Pendiente de decidir (siguientes sprints)

- Modelo de datos Prisma.
- Estrategia de multi-tenancy (row-level isolation es la opción base).
- Auth: JWT + refresh token en cookie httpOnly.
- RBAC por roles dentro del tenant.
