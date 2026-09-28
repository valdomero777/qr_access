# QR Access

Sistema de control de accesos a eventos mediante códigos QR.

- **`backend/`** — API REST en Node.js + Express 5 + Prisma 7 sobre PostgreSQL (Neon). Puerto 3000.
- **`frontend/`** — SPA en React 19 + Vite 8 + MUI 9. Puerto 5173.

Tres actores: el **administrador** crea eventos e invitados y les entrega su código, el **staff** de
puerta escanea con la cámara del móvil, y el **invitado** presenta un `qr_token` (UUID) que actúa
como entrada.

El acceso se entrega de dos formas: descargando la tarjeta en PNG desde el panel, o enviándola por
correo al invitado con el QR incrustado. El correo requiere configurar SMTP; sin él la descarga
sigue funcionando.

## Documentación

| Documento | Contenido |
|---|---|
| [docs/ANALISIS-SISTEMA.md](docs/ANALISIS-SISTEMA.md) | Análisis técnico completo: arquitectura, modelo de datos, referencia de la API, hallazgos de seguridad, defectos y plan de trabajo. |
| [docs/diagrama-flujo.md](docs/diagrama-flujo.md) | Diagramas Mermaid: flujo general, motor de validación, ciclo de vida del invitado, autenticación y mapa de rutas. |

## Arranque rápido

```bash
cd backend && npm install && npx prisma migrate deploy && npx prisma generate && node prisma/seed.js && npm run dev
```

```bash
cd frontend && npm install && npm run dev
```

> `backend/.env` necesita `DATABASE_URL` y `JWT_SECRET`; el servidor comprueba ambas al arrancar y
> se detiene indicando cuál falta. Las variables `SMTP_*` y `MAIL_FROM` son opcionales y sólo
> habilitan el envío por correo. Plantilla en [`backend/.env.example`](backend/.env.example).

## Despliegue

Base de datos en **Neon**, backend en **Vercel** y frontend en **GitHub Pages**; todo en capa gratuita.

1. **Repositorio.** Sube el proyecto a GitHub (los `.env` están ignorados).
2. **Migraciones.** Se aplican desde local contra Neon, no en el build:
   `cd backend && npx prisma migrate deploy`.
3. **Backend en Vercel.** *Add New → Project*, importa el repo y pon **Root Directory = `backend`**
   (Vercel detecta Express en `src/index.js`; `postinstall` genera el cliente de Prisma).
   Variables de entorno:
   - `DATABASE_URL`: la cadena **pooled** de Neon (host con `-pooler`), ya que cada instancia de la
     función abre su propio pool.
   - `JWT_SECRET`: el mismo que en local o uno nuevo (invalida las sesiones abiertas).
   - `CORS_ORIGIN`: `https://<usuario>.github.io` (sin ruta ni barra final).
   - `SMTP_*` y `MAIL_FROM`, si se usa el correo.
4. **Frontend en GitHub Pages.** *Settings → Pages → Source: GitHub Actions*, y en
   *Settings → Secrets and variables → Actions → Variables* crea `VITE_API_URL` con
   `https://<proyecto>.vercel.app/api`. Cada push a `main` lo publica
   ([deploy-pages.yml](.github/workflows/deploy-pages.yml)).
