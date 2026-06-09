# Convenciones

## Git flow

PRs pequeños y directos a `main` (desde 2026-05-20; nada en producción aún).

- `main` → rama estable
- `feature/*` → nuevas funcionalidades (parten de `main`, vuelven a `main`)
- `fix/*` → correcciones
- `chore/*` → mantenimiento (deps, tooling, higiene)

Cada PR debe ser pequeño, revisable y dejar el repo ejecutable.

## Naming

- **Paquetes internos:** `@acedesoft/<nombre>` (p.ej. `@acedesoft/types`).
- **Apps:** nombre corto, sin scope (`web`, `api`).
- **Archivos:** `kebab-case` en filesystem, `PascalCase` para componentes React, `camelCase` para funciones y variables.
- **Rutas API:** sustantivo plural, kebab-case (`/students`, `/audit-logs`).

## TypeScript

- Todo nuevo código en TypeScript estricto.
- Evitar `any`. Si es inevitable, comentar por qué.
- Tipos compartidos van en `packages/types`.

## Commits

Formato: `tipo(scope): mensaje corto en imperativo`.

Tipos: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.

Ejemplos:
- `feat(api): add health endpoint`
- `chore(repo): init monorepo scaffold`
