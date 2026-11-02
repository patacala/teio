# Cómo ejecutar el CRM

## Resumen rápido

1. **Un solo archivo `.env`** en la **raíz del proyecto** (junto a `docker-compose.yml`).
2. Copia la plantilla: `cp .env.example .env` y rellena al menos las variables **obligatorias**.
3. Arranca con **Docker** (recomendado) o en **local** con PostgreSQL, Redis y RabbitMQ corriendo.

---

## Opción A: Ejecutar con Docker (recomendado)

Todo (API, Web, Postgres, Redis, RabbitMQ) corre en contenedores. El `docker-compose` usa el `.env` de la **raíz**.

### 1. Crear `.env` en la raíz

```bash
cd /Users/peterbarranco/Desktop/sass/crm
cp .env.example .env
```

### 2. Rellenar mínimo en `.env`

Edita el `.env` y configura al menos:

| Variable | Ejemplo | Descripción |
|----------|---------|-------------|
| `DATABASE_USER` | `postgres` | Usuario PostgreSQL |
| `DATABASE_PASSWORD` | `postgres` | Contraseña PostgreSQL |
| `DATABASE_NAME` | `crm_dev` | Nombre de la base de datos |
| `JWT_SECRET` | Una clave larga y aleatoria (mín. 32 caracteres) | Firma de los tokens JWT |
| `NEXT_PUBLIC_API_URL` | `http://localhost:4001` | URL base de la API (frontend) |
| `WEB_HOST_PORT` / `API_HOST_PORT` | `4000` / `4001` | Puertos en el host (evitan conflicto con 3000/3001) |

Para desarrollo local con Docker, el resto puede quedarse como en `.env.example` (valores por defecto para Redis, RabbitMQ, etc.).

### 3. Levantar servicios

```bash
pnpm install
docker compose up -d
```

Esto levanta:

- **Redis** y **RabbitMQ** (solo red interna Docker; DB en Supabase vía `DATABASE_URL`)
- **API** en `http://localhost:4001/api` (puerto host `API_HOST_PORT`, default `4001`)
- **Web** en `http://localhost:4000` (puerto host `WEB_HOST_PORT`, default `4000`)

### 4. Migraciones de base de datos

Si tienes migraciones (por ejemplo con el paquete `database`):

```bash
pnpm db:migrate
```

(o el comando que uses para aplicar esquemas SQL).

---

## Opción B: Ejecutar en local (sin Docker)

Necesitas tener **PostgreSQL**, **Redis** y **RabbitMQ** instalados y corriendo en tu máquina.

### 1. `.env` en la raíz

Mismo archivo que en Docker: `cp .env.example .env` y rellena al menos:

- `DATABASE_*` apuntando a tu Postgres local (ej. `localhost:5432`, `crm_dev`, etc.)
- `REDIS_HOST=localhost`, `REDIS_PORT=6379`
- `RABBITMQ_HOST=localhost`, `RABBITMQ_PORT=5672`, `RABBITMQ_USER`, `RABBITMQ_PASSWORD`
- `JWT_SECRET` (mínimo 32 caracteres)
- `NEXT_PUBLIC_API_URL=http://localhost:4001`

### 2. Variables para la app Web (Next.js)

Next.js lee `.env` desde **su carpeta**. Tienes dos opciones:

- **Opción 2a:** Crear `apps/web/.env` con solo las variables que usa el frontend:
  - `NEXT_PUBLIC_API_URL=http://localhost:4001`
  - `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (si usas Supabase/auth)
  - `NEXT_PUBLIC_WS_URL=ws://localhost:4001` (si usas WebSockets)

- **Opción 2b:** Desde la raíz, enlazar o copiar el mismo `.env` y asegurarte de que Next cargue esas variables (por ejemplo con `dotenv` en el script de arranque o usando el mismo archivo).

### 3. Variables para la API (NestJS)

La API usa `ConfigModule` y lee `process.env`. Si ejecutas desde la raíz (`pnpm dev` con turbo), muchas herramientas cargan el `.env` de la raíz. Si ejecutas solo la API desde `apps/api`, pon un `apps/api/.env` con las mismas variables que la API necesita (las de `.env.example` para API, DB, Redis, RabbitMQ, JWT, etc.).

### 4. Arrancar

```bash
pnpm install
pnpm dev
```

Abre:

- **Web:** http://localhost:4000  
- **API:** http://localhost:4001/api  

---

## Qué va en cada `.env`

### Un solo `.env` en la raíz (Docker)

El `docker-compose.yml` usa `env_file: .env` en la raíz. **Toda la configuración** puede estar ahí.

### Si corres sin Docker

- **Raíz:** mismo `.env` que para Docker (DB, Redis, RabbitMQ, JWT, API, Webhooks, etc.).
- **`apps/web/.env`:** al menos `NEXT_PUBLIC_*` para que el frontend vea la API y Supabase/WS si los usas.
- **`apps/api/.env`:** opcional si ya cargas el `.env` de la raíz al ejecutar la API; si no, copia aquí las variables que usa la API (las de la sección API en `.env.example`).

---

## Variables obligatorias vs opcionales

### Obligatorias para arrancar (API + Web + DB)

| Variable | Dónde | Descripción |
|----------|--------|-------------|
| `DATABASE_URL` o `DATABASE_HOST` + `PORT` + `NAME` + `USER` + `PASSWORD` | API / raíz | Conexión a PostgreSQL |
| `JWT_SECRET` | API | Clave para firmar tokens (mín. 32 caracteres) |
| `NEXT_PUBLIC_API_URL` | Web | URL base de la API (ej. `http://localhost:4001`) |

---

## Opción C: Deploy con Coolify (Docker Compose)

1. En Coolify crea un **Service Stack** con build pack **Docker Compose** apuntando a este repo.
2. **No** añadas secciones `networks:` en el compose; Coolify crea la red y conecta Traefik automáticamente.
3. En la UI asigna dominios:
   - **web** → p. ej. `https://crm.tudominio.com` (puerto interno **3000**; label Traefik ya definido)
   - **api** → p. ej. `https://api.crm.tudominio.com` o subpath según tu proxy (puerto interno **3001**)
4. Variables en Coolify (producción), alineadas con tus dominios:

| Variable | Ejemplo producción |
|----------|-------------------|
| `NEXT_PUBLIC_API_URL` | `https://api.crm.tudominio.com` o dominio público que proxy al API |
| `NEXT_PUBLIC_WEB_URL` | `https://crm.tudominio.com` |
| `BASE_URL` | URL pública de la API (webhooks) |
| `DATABASE_URL` | Supabase pooler / Postgres |
| `WEB_HOST_PORT` / `API_HOST_PORT` | Opcional; en Coolify Traefik enruta sin depender de estos puertos |

Los puertos **4000/4001** en el host son para desarrollo local cuando 3000/3001 ya están ocupados; los contenedores siguen escuchando en **3000** (web) y **3001** (api).

### Si usas autenticación con Supabase (login/signup)

| Variable | Dónde | Descripción |
|----------|--------|-------------|
| `SUPABASE_URL` | API | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` | API | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | API | Service role key (backend) |
| `SUPABASE_JWT_SECRET` | API | JWT secret del proyecto |
| `NEXT_PUBLIC_SUPABASE_URL` | Web | Misma URL del proyecto |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Web | Misma anon key |

### Opcionales (integraciones y AI)

- **Redis:** `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_URL`
- **RabbitMQ:** `RABBITMQ_*`
- **AI:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`
- **Canales:** WhatsApp, Twilio, SendGrid, Slack, Instagram/Facebook (ver `.env.example`)
- **Webhooks:** `WEBHOOK_SECRET`, `BASE_URL`
- **Storage:** `AWS_*`, `STORAGE_BUCKET`
- **Monitoring:** `SENTRY_DSN`, `LOG_LEVEL`

Puedes dejar estas con valores de ejemplo o vacíos si no usas esas funciones todavía.

---

## Resumen de pasos mínimos

1. En la raíz: `cp .env.example .env`
2. En `.env` pon al menos: `DATABASE_*`, `JWT_SECRET`, `NEXT_PUBLIC_API_URL`
3. Si usas Supabase: añade `SUPABASE_*` y `NEXT_PUBLIC_SUPABASE_*`
4. Ejecutar:
   - Con Docker: `docker compose up -d` y luego migraciones si aplica.
   - Sin Docker: tener Postgres, Redis y RabbitMQ corriendo y luego `pnpm dev`, asegurando que `apps/web` tenga las `NEXT_PUBLIC_*` en su `.env` si hace falta.

Cuando tengas eso, la aplicación debería poder ejecutarse. Si algo no arranca, el mensaje de error suele indicar qué variable o servicio falta (por ejemplo conexión a DB o Redis).
