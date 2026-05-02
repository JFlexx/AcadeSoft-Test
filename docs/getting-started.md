# Getting Started

## Requisitos

- Node.js 20+
- pnpm 9+
- Docker (para PostgreSQL local)

## Pasos

```bash
# 1. Instalar dependencias
pnpm install

# 2. Levantar base de datos
docker compose -f docker/docker-compose.yml up -d

# 3. Copiar variables de entorno
cp .env.example apps/api/.env

# 4. Arrancar todo en paralelo
pnpm dev
```

## Endpoints

- Web: http://localhost:3000
- API: http://localhost:3001
- Health check: http://localhost:3001/health
