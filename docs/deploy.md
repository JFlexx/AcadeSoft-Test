# Despliegue a producción

Cómo desplegar la API y la web con Docker. Para arrancar en local, ver
[getting-started.md](getting-started.md).

## Imagen de la API

El Dockerfile está en `apps/api/Dockerfile`. Se construye **desde la raíz**
del repo, porque necesita el workspace de pnpm:

```bash
docker build -f apps/api/Dockerfile -t acedesoft-api .
```

Al arrancar, el contenedor:

1. aplica las migraciones pendientes (`prisma migrate deploy`), que es
   idempotente: si no hay nada nuevo, no hace nada;
2. arranca la API.

La imagen viene preparada para producción:

- Corre como el usuario `node`, no como root.
- Usa `tini` como PID 1, así un `SIGTERM` cierra Prisma y los cron de forma
  limpia.
- Trae un `HEALTHCHECK` contra `/health`.

> **Varias réplicas:** con más de una instancia, no dejes que todas migren a
> la vez al arrancar. Lanza `prisma migrate deploy` como paso de *release* o
> *pre-deploy* y arranca las instancias con `node dist/main`.

Sin Docker (plataformas que construyen desde el código):

```bash
pnpm install --frozen-lockfile
pnpm --filter api exec prisma generate && pnpm --filter api build
pnpm --filter api start:prod   # migrate deploy + node dist/main
```

## Imagen de la web

El Dockerfile está en `apps/web/Dockerfile` y genera la salida *standalone*
de Next.js, que no necesita `node_modules`. La URL de la API se mete en el
código del navegador **al construir** la imagen, así que se pasa como
argumento de build:

```bash
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.midominio.com -t acedesoft-web .
```

- Si falta el argumento, el build falla a propósito. Así no se publica una
  web que apunta a `localhost`.
- Cambiar la URL de la API implica **reconstruir** la imagen.
- En runtime solo se usa `PORT`, por defecto 3000.
- Corre como `node`, con `tini` y un `HEALTHCHECK` contra `/login`.
- `WEB_ORIGIN` en la API debe ser exactamente la URL pública de esta web,
  por CORS.

Cada imagen tiene su propio `.dockerignore` (`apps/*/Dockerfile.dockerignore`).
Ninguna incluye ficheros `.env`.

## Variables de entorno de la API

La API **valida la configuración al arrancar**. Si falta algo o hay un valor
inseguro, se niega a arrancar y lista todos los problemas a la vez.

| Variable | Obligatoria | Notas |
|---|---|---|
| `NODE_ENV` | sí | `production`. Activa las comprobaciones estrictas y la cookie `secure`. |
| `DATABASE_URL` | sí | PostgreSQL 16. |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` / `COOKIE_SECRET` | sí | Aleatorios, de ≥32 caracteres y distintos entre sí. Se generan con `openssl rand -hex 32`. |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | sí | p. ej. `15m` / `7d`. |
| `WEB_ORIGIN` | sí | URL `https://` del frontend. Se usa para CORS y para los enlaces de los emails. |
| `PORT` | no | La inyecta la plataforma. Si no está, se usa `API_PORT` y, si tampoco, 3001. |
| `RESEND_API_KEY` / `EMAIL_FROM` | no | Sin clave, no se envían emails. `EMAIL_FROM` debe usar un dominio verificado en Resend. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | no | Pagos con tarjeta. Si pones la clave secreta, el webhook secret es obligatorio. |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | no | Límite de peticiones. `THROTTLE_DISABLED` no se admite en producción. |

## Health checks

- `GET /health` (*liveness*): el proceso está vivo.
- `GET /health/ready` (*readiness*): comprueba la base de datos. Si no
  responde, devuelve 503. Es el que conviene configurar en la plataforma.

## Dominio: web y API bajo el mismo dominio

La sesión se renueva con una cookie `httpOnly` con `sameSite: strict`. El
navegador **solo la envía si la web y la API comparten dominio registrable**:

- ✅ `app.midominio.com` (web) + `api.midominio.com` (API)
- ❌ `algo.vercel.app` (web) + `algo.onrender.com` (API). La sesión
  caduca a los 15 minutos y no se renueva.

Por eso, **antes de abrir a usuarios reales hace falta un dominio propio**, con
la web y la API como subdominios. Ese mismo dominio se verifica en Resend para
`EMAIL_FROM`.

## Datos y RGPD

La aplicación guarda datos personales de menores y familias. La base de datos
y la API deben alojarse en la **UE**, con copias de seguridad automáticas de
PostgreSQL activadas en el proveedor.

## Desplegar en Render (Frankfurt)

El repo trae un *Blueprint* (`render.yaml`) que crea las tres piezas en
Frankfurt: la base de datos PostgreSQL, la API y la web. Coste orientativo:
dos servicios de 0,5 CPU / 512 MB y la base de datos más pequeña de pago,
unos 20 $/mes más el almacenamiento (compruébalo en render.com/pricing).
La base de datos de pago incluye recuperación a cualquier momento de los
últimos 3 días (7 con el plan Pro) y copias lógicas diarias exportables.

Antes de empezar hace falta el **dominio** (p. ej. `midominio.es`).

1. **Render → New → Blueprint** y conecta el repositorio de GitHub. Render
   lee `render.yaml` y pide los valores marcados como `sync: false`:
   - `WEB_ORIGIN` = `https://app.midominio.es`
   - `NEXT_PUBLIC_API_URL` = `https://api.midominio.es`
   - `RESEND_API_KEY` y `EMAIL_FROM` (p. ej. `Nombre <hola@midominio.es>`).
     Se pueden dejar vacíos al principio: sin clave no se envían emails.

   Los secretos JWT y de cookie los genera Render (256 bits, distintos).
2. Espera al primer despliegue. La API aplica las migraciones al arrancar.
3. **Dominios propios:** en cada servicio, *Settings → Custom Domains*:
   `api.midominio.es` en la API y `app.midominio.es` en la web. Render
   indica el registro `CNAME` que hay que crear en el registrador del
   dominio. El certificado HTTPS lo pone Render.
4. **Email:** en Resend, *Domains → Add domain* con `midominio.es` y crea
   en el registrador los registros DNS que indique (SPF, DKIM). Cuando
   salga como verificado, pon `RESEND_API_KEY` y `EMAIL_FROM` en la API y
   redepliega.
5. Entra en `https://app.midominio.es/signup` y crea la academia.

Cada push a `main` vuelve a desplegar los dos servicios, solo cuando CI está
en verde (`autoDeployTrigger: checksPass`).
