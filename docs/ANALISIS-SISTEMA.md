# QR Access — Análisis del Sistema

> Documento de análisis técnico generado a partir del código fuente en `A:/repo/qr_access`.
> Fecha de análisis: 2026-08-26.

---

## 1. Resumen ejecutivo

**QR Access** es un sistema de control de accesos a eventos mediante códigos QR. Se compone de dos
aplicaciones independientes:

| Componente | Tecnología | Ubicación | Puerto |
|---|---|---|---|
| API REST | Node.js + Express 5 + Prisma 7 (PostgreSQL/Neon) | `backend/` | 3000 |
| SPA web | React 19 + Vite 8 + MUI 9 + React Router 7 | `frontend/` | 5173 (Vite) |

El sistema modela tres roles y un destinatario:

| Rol | Cómo entra | Qué alcanza |
|---|---|---|
| **Super administrador** | Correo y contraseña | **Todos** los eventos y sus métricas. Único que crea eventos, da de alta administradores y los asigna. |
| **Administrador** | Correo y contraseña | Sólo los eventos que el super administrador le haya **asignado**: invitados, métricas e invitación. |
| **Staff (puerta)** | ID del evento + contraseña del evento | Sólo `POST /scan/validate`. No tiene cuenta ni entra al panel. |

El **invitado** no es un rol: posee un `qr_token` (UUID) que actúa como su entrada.

El rol viaja dentro del JWT. La visibilidad de eventos se aplica como **filtro en cada consulta**,
no como una comprobación posterior: un evento que no te corresponde sencillamente no existe para ti,
y las rutas responden `404` en vez de `403` para no revelar qué identificadores hay.

**Estado de madurez: prototipo funcional.** El ciclo completo está cerrado: el administrador crea
el evento y los invitados, el sistema **genera y entrega el QR**, y el staff lo valida en la puerta
dejando registro. El dashboard sigue mostrando datos simulados (F-3) y quedan pendientes los
hallazgos de seguridad de §6.

> Catorce hallazgos de este documento —**S-1** (falta `JWT_SECRET`), **F-2** (`GuestsManager`
> desconectado), **F-1** (sin entrega del QR), **S-2** (escalada de privilegios por rol), **S-4**
> (acceso a recursos de otro administrador), **S-5** (los revocados seguían entrando) y **S-6/S-7**
> (fechas y zona horaria del acceso), **S-11** (rutas sin guarda en el cliente), **B-1** (la guarda
> del escáner), **B-2**, **B-3**, **B-4** y **F-3** (métricas reales)— ya están resueltos; sus
> apartados describen el arreglo aplicado.

---

## 2. Arquitectura

```
Navegador (SPA React)
        |  fetch + JWT en Authorization: Bearer
        v
Express 5  -- cors() -- express.json()
        |
        +-- /api/admin  -> routes/admin.js   (login, eventos, invitados)   [verifyToken]
        +-- /api/staff  -> routes/staff.js   (login por evento)            [publico]
        +-- /api/scan   -> routes/scan.js    (validacion de QR)            [verifyToken]
        |
        v
PrismaClient (@prisma/adapter-pg sobre un Pool de `pg`)
        |
        v
PostgreSQL (Neon)
```

### Capas del backend

| Archivo | Responsabilidad |
|---|---|
| `backend/src/index.js` | Bootstrap de Express, CORS, JSON, montaje de routers, `listen`. |
| `backend/src/utils/prisma.js` | Singleton de `PrismaClient` con `PrismaPg` sobre un `Pool` de `pg`. |
| `backend/src/utils/schedule.js` | Resuelve la ventana de acceso en la zona horaria del evento. |
| `backend/src/middlewares/auth.js` | `verifyToken`: valida `Bearer <jwt>`, inyecta el payload en `req.user`. |
| `backend/src/routes/admin.js` | Login de admin + CRUD de eventos e invitados. |
| `backend/src/routes/staff.js` | Login de staff contra `Event.staff_password`. |
| `backend/src/routes/scan.js` | Validación del QR y escritura del `AccessLog`. |
| `backend/prisma/schema.prisma` | Modelo de datos. |
| `backend/src/utils/qr.js` | Renderiza el `qr_token` como PNG (`qrcode`) para adjuntarlo al correo. |
| `backend/src/utils/mailer.js` | Transporte SMTP (`nodemailer`) y plantilla del correo de acceso. |
| `backend/prisma/seed.js` | Alta del administrador inicial (`admin@evento.com`). |

### Capas del frontend

| Archivo | Responsabilidad |
|---|---|
| `frontend/src/App.jsx` | Tema MUI, `AdminLayout` (AppBar) y tabla de rutas. |
| `frontend/src/services/api.js` | Cliente HTTP (fetch) hacia `VITE_API_URL`. |
| `frontend/src/pages/admin/LoginAdmin.jsx` | Login de organizador → guarda `adminToken` en `localStorage`. |
| `frontend/src/pages/admin/Dashboard.jsx` | Lista de eventos, separados en activos y no activos. |
| `frontend/src/pages/admin/EventPanel.jsx` | Panel del evento: Invitados / Métricas / Invitación, y Equipo si eres super administrador. |
| `frontend/src/pages/admin/Admins.jsx` | Alta y baja de administradores (sólo super administrador). |
| `frontend/src/pages/admin/event/*.jsx` | Contenido de cada pestaña. |
| `frontend/src/components/TicketCard.jsx` | La tarjeta del invitado, compartida por el diálogo del QR y la vista previa del diseñador. |
| `frontend/src/utils/design.js` | Diseño por defecto y composición del PNG descargable. |
| `frontend/src/pages/admin/CreateEvent.jsx` | Formulario de alta de evento (conectado). |
| `frontend/src/pages/admin/GuestsManager.jsx` | Gestión de invitados, tarjeta de acceso QR y envío por correo. |
| `frontend/src/pages/staff/LoginStaff.jsx` | Login por `eventId` + contraseña → `staffToken`. |
| `frontend/src/pages/staff/ScannerView.jsx` | Cámara (`html5-qrcode`) + feedback visual del resultado. |
| `frontend/src/pages/admin/Profile.jsx` | Datos de la cuenta, estado de la sesión, logout y cambio de contraseña. |
| `frontend/src/utils/session.js` | Lee la caducidad del JWT y avisa cuando la sesión deja de servir. |

---

## 3. Modelo de datos

```
Admin 1---N Event 1---N Guest 1---N AccessLog
                   \___________________N AccessLog
```

### `Admin`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID (PK) | |
| `full_name` | VARCHAR(100) | |
| `email` | VARCHAR(150) | **único** |
| `password_hash` | TEXT | bcrypt, 10 salt rounds |
| `role` | VARCHAR(20) | `super_admin` \| `admin`. Por defecto `admin` |
| `created_at` | TIMESTAMPTZ | |

### `EventAdmin`
Qué administradores gestionan qué eventos. Un super administrador **no necesita filas aquí**: ve
todos los eventos por su rol.

| Campo | Tipo | Notas |
|---|---|---|
| `event_id` + `admin_id` | UUID | Clave primaria compuesta; ambas FK con `ON DELETE CASCADE` |
| `assigned_at` | TIMESTAMPTZ | |

> La migración que introdujo estas dos cosas incluye una **migración de datos**: asigna cada evento
> existente a quien lo creó y convierte al administrador más antiguo en `super_admin`. Sin eso, al
> desplegar nadie habría podido crear eventos ni ver los que ya había.

### `Event`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID (PK) | Se comparte con el staff como "ID del Evento" |
| `admin_id` | UUID (FK → Admin) | `ON DELETE CASCADE` |
| `name` / `description` | VARCHAR(200) / TEXT | |
| `start_date` / `end_date` | DATE | Rango de jornadas válidas, comprobado en el escaneo |
| `entry_start` / `entry_end` | VARCHAR(5) | Formato `"HH:MM"`. Si `entry_end < entry_start`, la ventana cruza la medianoche |
| `timezone` | VARCHAR(64) | Zona IANA en la que se evalúa la ventana. Por defecto `UTC` |
| `staff_password` | TEXT | **En texto plano** (ver §6) |
| `qr_config` | JSONB | Diseño de la invitación: `colorAcento`, `colorFondo`, `colorTexto`, `mensaje`, `logo` (data URI) |

### `Guest`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | UUID (PK) | |
| `event_id` | UUID (FK → Event) | `ON DELETE CASCADE` |
| `name` / `email` | VARCHAR(200) / VARCHAR(150) | |
| `qr_token` | UUID | **único**, autogenerado; es el contenido del QR |
| `status` | VARCHAR(20) | `pending` \| `checked_in` \| `revoked` |
| `qr_sent_at` | TIMESTAMPTZ? | Última vez que se le envió el QR; `NULL` = nunca |
| | | Único compuesto: `(event_id, email)` |

### `AccessLog`
| Campo | Tipo | Notas |
|---|---|---|
| `id` | BIGSERIAL (PK) | |
| `event_id` | UUID (FK → Event) | Indexado |
| `guest_id` | UUID? (FK → Guest) | `ON DELETE SET NULL`; nulo si el token no existe |
| `scanned_at` | TIMESTAMPTZ | |
| `result` | VARCHAR(50) | `success` \| `already_used` \| `revoked` \| `invalid_status` \| `outside_schedule` \| `outside_dates` \| `invalid_token` |
| `device_info` | TEXT? | Declarado, **nunca poblado** |

---

## 3.bis Estructura del panel de administración

La navegación gira alrededor del evento, no de listas globales:

```
/admin/dashboard            Lista de eventos: Activos / No activos
   └── /admin/events/:id    Panel del evento, en tres pestañas
         ├── Invitados      Alta, edición, revocación, borrado, QR y envíos
         ├── Métricas       Cifras reales y flujo de ingreso por hora
         └── Invitación     Diseño de la tarjeta, con vista previa en vivo
/admin/create-event         Alta de evento
/admin/profile              Cuenta, sesión y cambio de contraseña
```

Un evento se considera **activo** si hoy —resuelto en la zona horaria del propio evento, por la
misma razón que el escaneo— cae dentro de `[start_date, end_date]`. Los no activos se listan
igualmente, etiquetados como *Próximo* o *Finalizado*.

`/admin/guests` dejó de existir como pantalla global y redirige al dashboard: gestionar invitados
sin decir de qué evento no tenía sentido una vez que hay varios.

---

## 4. API REST

Base: `http://localhost:3000/api`

Todas las rutas de `/admin` salvo `/login` exigen un token de panel —`admin` o `super_admin`
(S-2)— y filtran por visibilidad, devolviendo `404` sobre lo que no te corresponde (S-4). Las de
gestión de administradores exigen además `super_admin`.

### Autenticación

| Método | Ruta | Auth | Cuerpo | Respuesta |
|---|---|---|---|---|
| `POST` | `/admin/login` | — | `{ email, password }` | `{ token, adminName, adminId }` — JWT `{adminId, role:'admin'}`, **7d** |
| `POST` | `/staff/login` | — | `{ eventId, staffPassword }` | `{ message, token, eventName }` — JWT `{role:'staff', eventId}`, **12h** |

### Administradores y asignaciones (sólo super administrador)

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| `GET` | `/admin/admins` | — | Lista con rol y número de eventos asignados. Nunca el hash |
| `POST` | `/admin/admins` | `{ full_name, email, password, role? }` | El administrador creado |
| `DELETE` | `/admin/admins/:id` | — | `400` si eres tú mismo o si dejarías el sistema sin super administrador |
| `GET` | `/admin/events/:eventId/admins` | — | Administradores asignados a ese evento |
| `POST` | `/admin/events/:eventId/admins` | `{ admin_id }` | Asigna. `400` si es un super administrador (ya lo ve todo) |
| `DELETE` | `/admin/events/:eventId/admins/:adminId` | — | Retira la asignación |

Estas rutas devuelven `403` con **`code: 'insufficient_role'`** a un administrador corriente. Ese
código está deliberadamente fuera de la lista que cierra sesión en el cliente: quien lo recibe sigue
autenticado, sólo le falta permiso.

### Panel del evento

| Método | Ruta | Auth | Cuerpo | Respuesta |
|---|---|---|---|---|
| `GET` | `/admin/events/:eventId` | Bearer admin | — | El `Event`, o `404` si no es tuyo |
| `GET` | `/admin/events/:eventId/stats` | Bearer admin | — | `{ total, ingresados, pendientes, revocados, enviados, escaneos, porResultado, porHora }` |
| `PATCH` | `/admin/events/:eventId/design` | Bearer admin | `{ qr_config }` | El `Event` actualizado. `400` si el logo supera ~300 kB |

### Perfil

| Método | Ruta | Auth | Cuerpo | Respuesta |
|---|---|---|---|---|
| `GET` | `/admin/me` | Bearer admin | — | `{ id, full_name, email, created_at }`. El `select` excluye el hash |
| `PATCH` | `/admin/me/password` | Bearer admin | `{ current_password, new_password }` | `{ message, token }` con un JWT nuevo. `400` si la nueva es inválida; `401` con `code: 'wrong_password'` si la actual no coincide |

### Eventos

| Método | Ruta | Auth | Cuerpo | Respuesta |
|---|---|---|---|---|
| `GET` | `/admin/events` | Bearer | — | Los eventos **visibles** para quien llama: todos si es super administrador, los asignados si no |
| `POST` | `/admin/events` | **Super admin** | `{ name, description, start_date, end_date, entry_start, entry_end, staff_password, timezone?, qr_config? }` | `Event`, auto-asignado a quien lo crea. `400` si la zona IANA no existe o si `end_date < start_date` |

### Invitados

| Método | Ruta | Auth | Cuerpo | Respuesta |
|---|---|---|---|---|
| `GET` | `/admin/events/:eventId/guests` | Bearer | — | `Guest[]` ordenados por nombre |
| `POST` | `/admin/guests` | Bearer | `{ name, email, event_id }` | `Guest` (con `qr_token`). `400` si `P2002` (email duplicado) |
| `PUT` | `/admin/guests/:id` | Bearer | `{ name, email }` | `Guest` |
| `PATCH` | `/admin/guests/:id/revoke` | Bearer | — | `Guest` con `status='revoked'` |
| `DELETE` | `/admin/guests/:id` | Bearer | — | `{ message }` |

### Entrega del QR

| Método | Ruta | Auth | Cuerpo | Respuesta |
|---|---|---|---|---|
| `POST` | `/admin/guests/:id/send-qr` | Bearer admin | — | `Guest` con `qr_sent_at`. `503` si no hay SMTP; `502` si el envío falla |
| `POST` | `/admin/events/:eventId/send-qr` | Bearer admin | `{ resend?: boolean }` | `{ total, enviados, fallidos[] }`. Sin `resend` sólo envía a quienes tienen `qr_sent_at = NULL` |

### Escaneo

| Método | Ruta | Auth | Cuerpo | Respuesta |
|---|---|---|---|---|
| `POST` | `/scan/validate` | **Bearer staff** | `{ qr_token }` | `200 {status:'success', message}` o `400 {status:'error', message}`. `403` con `code: 'forbidden_role'` a cualquier token que no sea de puerta |

---

## 5. Flujo de validación de un QR (`POST /api/scan/validate`)

El `eventId` **no** viene del cuerpo: se extrae del JWT del staff, lo que impide validar entradas
de otro evento aunque el operador lo intente.

0. `staffOnly` exige un token con `role === 'staff'` y un `eventId` dentro; cualquier otro recibe
   `403` sin llegar a consultar nada.
1. Se busca el `Guest` por `qr_token` (único), incluyendo su `Event`.
2. **Token inexistente o de otro evento** → log `invalid_token` → `400 "Código no válido para este evento"`.
3. **Estado distinto de `pending`** → se deniega. `checked_in` → log `already_used`; `revoked` → log
   `revoked`; cualquier otro → log `invalid_status`. Siempre `400`.
4. **Ventana de acceso**, evaluada en `event.timezone`: primero la hora contra
   `entry_start`/`entry_end` (con soporte para ventanas que cruzan la medianoche) → log
   `outside_schedule`; después la jornada contra `[start_date, end_date]` → log `outside_dates`.
   Ambos `400`.
5. **Éxito** → `Guest.status = 'checked_in'` → log `success` → `200 "Acceso concedido: <nombre>"`.

`logAccess()` envuelve la escritura en su propio `try/catch`: un fallo de auditoría **no** aborta
la respuesta al operador de puerta (decisión razonable para una puerta física).

Ver el diagrama en [`docs/diagrama-flujo.md`](diagrama-flujo.md).

---

## 6. Hallazgos de seguridad

Ordenados por severidad. Todos verificados contra el código, no supuestos.

### ✅ S-1 — `JWT_SECRET` no está definido — **RESUELTO**
`backend/.env` sólo declaraba `DATABASE_URL`, así que `jwt.sign` ([admin.js:21](backend/src/routes/admin.js:21), [staff.js:23](backend/src/routes/staff.js:23)) y
`jwt.verify` ([auth.js:14](backend/src/middlewares/auth.js:14)) recibían `undefined` y ningún login llegaba a emitir un token.

Se añadió `JWT_SECRET` (y `PORT`) al entorno, y [`src/index.js`](backend/src/index.js) ahora comprueba
`DATABASE_URL` y `JWT_SECRET` antes de escuchar: si falta alguna, el proceso escribe qué falta y
sale con código 1 en lugar de arrancar y devolver `500` en cada login.

### ✅ S-2 — `verifyToken` no distingue roles → escalada de privilegios — **RESUELTO**
[`middlewares/auth.js`](backend/src/middlewares/auth.js) valida la firma pero **nunca inspecciona `req.user.role`**, y ambos tipos de
token se firman con el mismo secreto. Consecuencias que tenía:

- Un **token de staff** —que obtiene cualquiera con el ID del evento y la contraseña de puerta—
  autorizaba todos los endpoints de `/api/admin`: crear, editar, revocar y **eliminar** invitados de
  cualquier evento.
- En `GET /api/admin/events` producía `where: { admin_id: undefined }`. Prisma **ignora los campos
  `undefined`** en un `where`, así que la consulta degeneraba en "sin filtro" y devolvía **todos los
  eventos de todos los administradores**, con su `staff_password` en texto plano.

*Arreglo aplicado.* [`routes/admin.js`](backend/src/routes/admin.js) define `requireAdmin`, que exige `role === 'admin'` y un
`adminId` presente, y lo empareja con `verifyToken` en una única constante:

```js
const adminOnly = [verifyToken, requireAdmin];
```

Las **nueve** rutas protegidas del router la usan; `/login` sigue siendo pública. Van juntas a
propósito: así no se puede aplicar `verifyToken` y olvidar la comprobación de rol al añadir una ruta
nueva. Verificado ruta por ruta: token de staff → `403`, token bien firmado pero sin rol → `403`,
token de admin → sin cambios.

> **El caso espejo también está cerrado.** `POST /api/scan/validate` usaba `verifyToken` sin
> comprobar el rol: un token del panel llegaba hasta el fondo con `eventId` en `undefined`, acababa
> en un `400 "Código no válido"` engañoso e intentaba escribir un `AccessLog` sin evento. Ahora
> [`routes/scan.js`](backend/src/routes/scan.js) define `requireStaff` —exige `role === 'staff'` **y** un `eventId` presente— y lo
> empareja con `verifyToken` en `staffOnly`, igual que en el router de admin.
>
> Verificado: token de super admin, de admin, sin rol reconocible, de staff sin `eventId` y sin
> token → `403`; sólo el token de staff legítimo pasa. Los rechazos ocurren antes de tocar la base,
> así que no dejan rastro en `AccessLog`.

### 🟠 S-3 — `staff_password` en texto plano
Se guarda tal cual ([admin.js:59](backend/src/routes/admin.js:59)) y se compara con `!==` ([staff.js:16](backend/src/routes/staff.js:16)). El propio código lo
reconoce en comentarios. Además la comparación con `!==` no es de tiempo constante. Debe usarse
`bcrypt.hash` al crear el evento y `bcrypt.compare` al autenticar.

### ✅ S-4 — IDOR: sin verificación de propiedad — **RESUELTO**
`GET /admin/events/:eventId/guests`, `POST /admin/guests` y `PUT/PATCH/DELETE /admin/guests/:id`
operaban sobre el ID recibido **sin comprobar que el recurso perteneciera al `adminId` del token**.
Cualquier administrador autenticado podía leer, modificar y borrar los invitados de otro.

`requireAdmin` (S-2) no cerraba esto: garantiza que quien llama es un administrador, no que el
recurso sea suyo.

*Arreglo aplicado.* Prisma exige un `where` único en `update`/`delete`, así que no admite añadirle
el filtro de propiedad. [`routes/admin.js`](backend/src/routes/admin.js) define dos ayudantes que consultan primero:

```js
const findOwnedGuest = (guestId, adminId, options = {}) =>
    prisma.guest.findFirst({
        where: { id: guestId, event: { admin_id: adminId } },
        ...options
    });

const findOwnedEvent = (eventId, adminId) =>
    prisma.event.findFirst({ where: { id: eventId, admin_id: adminId } });
```

Toda ruta que reciba un `:id` —o un `event_id` en el cuerpo— comprueba la propiedad antes de
actuar. Se responde **`404` tanto si el recurso no existe como si no es suyo**, para no revelar qué
identificadores existen en el sistema.

Verificado con un segundo administrador creado para la prueba: las siete operaciones devuelven
`404` sobre recursos ajenos y siguen funcionando sobre los propios, y los datos del otro
administrador quedan intactos tras el intento.

### ✅ S-5 — Los invitados revocados siguen entrando — **RESUELTO**
[`scan.js`](backend/src/routes/scan.js) comprobaba `status === 'checked_in'` pero **nunca `status === 'revoked'`**. Un invitado
revocado desde el panel pasaba la validación y obtenía `success`: la revocación era puramente
cosmética.

*Arreglo aplicado.* La comprobación pasa a ser por **lista blanca** —sólo entra quien está en
`pending`— para que cualquier estado que se añada en el futuro deniegue por defecto en lugar de
conceder el acceso:

```js
const ESTADOS_DENEGADOS = {
  checked_in: { result: 'already_used', message: 'Entrada ya utilizada' },
  revoked: { result: 'revoked', message: 'Acceso revocado por la organización' },
};

if (guest.status !== 'pending') {
  const motivo = ESTADOS_DENEGADOS[guest.status]
    || { result: 'invalid_status', message: 'Este acceso no es válido' };

  await logAccess(eventId, guest.id, motivo.result);
  return res.status(400).json({ status: 'error', message: motivo.message });
}
```

Verificado por el flujo real (login de staff → escaneo): el revocado recibe `400` y sigue en
`revoked`, un estado inventado también se deniega, y los invitados en `pending` entran como antes.

### ✅ S-6 — Las fechas del evento no se validan — **RESUELTO**
`start_date` y `end_date` existían en el modelo pero el escaneo sólo comparaba la **hora del día**:
un QR de un evento de enero se aceptaba en agosto si eran las 10:00.

*Arreglo aplicado.* El escaneo comprueba ahora que la jornada actual —resuelta en la zona del
evento, ver S-7— caiga dentro de `[start_date, end_date]`, y registra un nuevo resultado
`outside_dates` con el mensaje `Fuera de fecha. El acceso es sólo el 10/09/2026`.

El **horario se comprueba antes que la fecha** a propósito: a quien llega a las 03:00 tras una
ventana de 22:00 a 02:00 le sirve mucho más «fuera de horario» que «fuera de fecha», aunque
técnicamente ya sea el día siguiente.

`POST /admin/events` rechaza además con `400` un evento cuya fecha de fin sea anterior a la de
inicio, que nunca sería válido en la puerta.

### ✅ S-7 — Horario dependiente de la zona horaria del servidor — **RESUELTO**
`now.getHours()` usaba la hora local del proceso Node: en un despliegue en la nube —habitualmente
UTC— la ventana de acceso se desplazaba respecto a la hora real del evento. El modelo tampoco
guardaba la zona horaria, y una ventana nocturna (`22:00`–`02:00`) era imposible de expresar porque
la comparación de cadenas la interpretaba como vacía.

*Arreglo aplicado.* Tres cambios:

1. **`Event.timezone`** (`VARCHAR(64)`, IANA, por defecto `UTC`). El formulario de alta la
   prerrellena con la del navegador del organizador —`Intl.DateTimeFormat().resolvedOptions().timeZone`—
   y permite cambiarla si el evento ocurre en otro huso. `POST /admin/events` la valida y devuelve
   `400` si no existe.
2. **[`utils/schedule.js`](backend/src/utils/schedule.js)** resuelve la fecha y la hora actuales *en la zona del evento* con
   `Intl.DateTimeFormat` y `hourCycle: 'h23'` (evita el `24:00` que algunas versiones de ICU
   devuelven a medianoche con `hour12: false`).
3. **Ventana nocturna.** Si `entry_end < entry_start` la ventana cruza la medianoche y se acepta
   `hora >= entry_start || hora <= entry_end`. La madrugada pertenece además a la **jornada del día
   anterior**: quien entra a la 01:00 del día 11 sigue en el evento del día 10, y así la
   comprobación de fechas de S-6 no lo rechaza.

Verificado con 19 casos sobre instantes y zonas fijados a mano —bordes exactos de la ventana, mismo
instante UTC dando veredictos distintos en Ciudad de México y Madrid, los cuatro tramos de una
ventana nocturna, y una zona inválida que cae a `UTC` sin reventar— más una prueba de extremo a
extremo con eventos en `Pacific/Niue` (UTC−11) y `Pacific/Kiritimati` (UTC+14): con el servidor en
una fecha y UTC en otra, **cada evento se resolvió correctamente en su propia zona**.

### 🟡 S-8 — Sin límite de intentos en los logins
Ni `/admin/login` ni `/staff/login` tienen rate limiting. La contraseña de staff es corta por
diseño (la teclea el personal de puerta) y el `eventId` es un UUID enumerable si se filtra.

### 🟡 S-9 — CORS totalmente abierto
`app.use(cors())` acepta cualquier origen. Debe restringirse al dominio del frontend.

### 🟡 S-10 — Credenciales versionadas
`backend/.env` contiene la cadena de conexión de Neon y está presente en el árbol de trabajo. El
directorio **no es un repositorio Git** (no hay `.git`), por lo que hoy no hay historial que
purgar, pero conviene resolverlo antes del primer `git init`/`push`. [`prisma/seed.js:12`](backend/prisma/seed.js:12) además
lleva una contraseña de administrador incrustada en el código.

### ✅ S-11 — Rutas de administración sin protección en el cliente — **RESUELTO**
[`App.jsx`](frontend/src/App.jsx) renderizaba las tres pantallas de administración sin comprobar `adminToken`, y el
catch-all `<Route path="*">` mandaba cualquier ruta a `/admin/dashboard`. El resultado era entrar
directo a un panel sin sesión, con todas las peticiones fallando.

*Arreglo aplicado.* Tres piezas:

1. **Guardas de ruta.** `RequireAdmin` y `RequireStaff` envuelven sus pantallas; sin sesión válida
   redirigen al login correspondiente recordando a dónde ibas, y el login te devuelve ahí.
2. **Caducidad leída del propio token.** [`utils/session.js`](frontend/src/utils/session.js) decodifica el `exp` del JWT, así
   que una sesión vencida se detecta *antes* de lanzar ninguna petición.
3. **Rechazo del servidor.** Cuando el backend invalida el token a mitad de uso, la capa de red
   emite un evento que limpia la sesión, avisa y devuelve al login. Los errores de sesión llevan
   ahora un `code` (`no_token`, `invalid_token`, `forbidden_role`) para distinguirlos de cualquier
   otro 401 — equivocarse en la contraseña actual al cambiarla ya no te expulsa.

También hay **menú de cuenta con logout** en la barra superior, y `ScannerView` cierra sólo la
sesión de staff (antes hacía `localStorage.clear()` y se llevaba por delante la del administrador).

*Verificado en el navegador:* sin sesión, `/admin/dashboard` redirige al login sin una sola petición
al backend; un token caducado hace lo mismo; un token que el backend rechaza limpia la sesión,
muestra el aviso y vuelve al login recordando la ruta.

---

## 7. Funcionalidad incompleta

### ✅ F-1 — El invitado nunca recibe su QR — **RESUELTO**
No existía endpoint ni pantalla que generara o entregara el código, así que había tokens en la base
de datos pero nadie podía presentarlos en la puerta.

Ahora hay dos vías de entrega, ambas partiendo del mismo `qr_token`:

- **Descarga.** El menú de cada invitado abre una tarjeta de acceso con el QR (`qrcode.react`),
  el nombre del evento, el del invitado, la fecha y la ventana de ingreso. «Descargar PNG» exporta
  esa tarjeta a 1440×1616.
- **Correo.** `POST /admin/guests/:id/send-qr` envía el acceso al invitado con el QR incrustado
  como adjunto inline (`cid:qr-entrada`), más una versión en texto plano. El envío masivo por
  evento sólo alcanza a quienes aún no lo han recibido, salvo que se pida `resend`.

El correo es **opcional**: sin `SMTP_HOST`/`SMTP_PORT`/`MAIL_FROM` el sistema funciona igual y los
endpoints responden `503` con el mensaje de qué configurar; la descarga sigue disponible.

> **Nota sobre `html-to-image`.** Se implementó primero con `toPng` sobre el nodo del diálogo, pero
> la promesa **nunca resuelve ni rechaza** (verificado: 15 s sin respuesta) al intentar inlinear los
> estilos que MUI inyecta en tiempo de ejecución. La tarjeta se compone ahora directamente sobre un
> `<canvas>`, dibujando el QR a 2× exactos con `imageSmoothingEnabled = false`. `html-to-image`
> quedó sin uso en ambos `package.json`.

### ✅ F-2 — `GuestsManager` está completamente desconectado — **RESUELTO**
[`GuestsManager.jsx`](frontend/src/pages/admin/GuestsManager.jsx) trabajaba sobre estado local: la lista de eventos estaba escrita a mano,
los invitados se añadían con `Math.random()` como id y nada se persistía.

Ahora [`services/api.js`](frontend/src/services/api.js) expone `getEvents`, `getGuests`, `createGuest`, `updateGuest`,
`revokeGuest` y `deleteGuest` sobre un helper `authFetch` que adjunta el `Bearer` y propaga el
mensaje del backend (por ejemplo el de correo duplicado). La pantalla carga los eventos del
administrador al montar, lista los invitados del evento seleccionado, y los diálogos de editar y
eliminar —que antes eran un comentario— están implementados contra `PUT`, `PATCH .../revoke` y
`DELETE`.

### ✅ F-3 — El dashboard muestra datos simulados — **RESUELTO**
El dashboard usaba `mockStats` y `mockChartData`, y no existía ningún endpoint de métricas.

*Arreglo aplicado.* `GET /admin/events/:eventId/stats` agrega sobre `Guest` y `AccessLog`:
invitados, ingresados, pendientes, revocados, QR enviados, escaneos totales, desglose por `result`
y flujo de ingreso por hora **en la zona horaria del evento**. La pestaña «Métricas» del panel lo
pinta con la gráfica que antes era decorativa.

Además el dashboard cambió de propósito: ya no es un panel de cifras sino la **lista de eventos**,
separada en activos y no activos (§«Estructura del panel»).

### 🟠 F-4 — `qr_config` y `device_info` declarados pero muertos — **PARCIAL**
`Event.qr_config` ya **no está muerto**: guarda el diseño de la invitación (colores, mensaje de
bienvenida y logo) que edita la pestaña «Invitación» del panel del evento, y que leen tanto el PNG
descargable como el correo. Se escribe con `PATCH /admin/events/:eventId/design`.

Sigue pendiente `AccessLog.device_info`, que nunca se escribe aunque el `User-Agent` de la petición
de escaneo estaría disponible en `req.headers`.

### 🟠 F-5 — No hay alta de administradores
El único admin es el que crea [`prisma/seed.js`](backend/prisma/seed.js). No existe registro ni recuperación de contraseña.

*Cubierto salvo la recuperación:* se puede **cambiar la contraseña** desde `/admin/profile`, y el
super administrador **da de alta administradores** desde `/admin/admins` eligiendo su rol. Sigue
faltando la recuperación de contraseña por correo para quien la olvide.

---

## 8. Defectos de código

### ✅ B-1 — Guardia de reentrada rota en el escáner — **RESUELTO**
`onScanSuccess` se registraba una sola vez en el `useEffect` de montaje y **capturaba `isProcessing`
del primer render** (siempre `false`). La guarda `if (isProcessing) return;` no se cumplía nunca, así
que un QR leído a 15 fps disparaba varias llamadas concurrentes a `/scan/validate`: la primera
devolvía `success` y las siguientes `already_used`, mostrando "ACCESO DENEGADO" a un invitado
legítimo.

*Arreglo aplicado.* La bandera pasa a un `useRef`, que el callback lee siempre en su valor actual;
el estado `isProcessing` se conserva sólo para pintar el `Backdrop`. Como la comprobación y la
asignación ocurren de forma síncrona antes del primer `await`, funciona como un mutex real.

Además el lector se **pausa** durante los 2,5 s del mensaje (`scanner.pause(true)` / `resume()`): sin
eso, un invitado que deje el código delante de la cámara se lo re-escanea a sí mismo al reiniciarse
la guarda y acaba viendo "entrada ya utilizada". De paso se declararon las dependencias reales del
efecto (B-4) y se limpiaron el import de `Paper` y la variable `error` sin usar.

*Verificado sobre el componente real*, alcanzando su callback a través del árbol de React y
disparándolo en ráfaga:

| guarda | invocaciones | peticiones a `/scan/validate` | pantalla final |
|---|---|---|---|
| anterior (estado) | 8 | **8** | ACCESO DENEGADO — Entrada ya utilizada |
| actual (`useRef`) | 8 | **1** | ACCESO VÁLIDO |
| actual (`useRef`) | 13, en dos tandas dentro de la ventana de 2,5 s | **1** | ACCESO VÁLIDO |

Los `AccessLog` de la base confirman el recuento: la tanda con la guarda anterior dejó 8 registros;
cada tanda con la nueva, uno solo.

> La pausa del lector no pudo ejercitarse porque el entorno de prueba no tiene cámara: `pause()`
> lanza y queda absorbido por su `try/catch`, y es la guarda del `useRef` la que hizo el trabajo en
> la medición. En un dispositivo con cámara ambas actúan.

### ✅ B-2 — Propiedad CSS inválida — **RESUELTO**
`zify: 10` era una errata de `zIndex: 10`: como `zify` no es una propiedad CSS, no se aplicaba nada
y la cabecera del escáner quedaba sin apilamiento explícito.

Comprobado en el navegador tras el cambio: la cabecera (`position: absolute`) resuelve ahora
`z-index: 10` en su estilo calculado.

### ✅ B-3 — Log cruzado entre eventos — **RESUELTO**
Cuando el token existía pero pertenecía a otro evento se escribía
`logAccess(eventId, guest.id, 'invalid_token')`: un `AccessLog` que asociaba el `guest_id` de un
evento con el `event_id` de otro, contaminando cualquier métrica agrupada por evento.

*Arreglo aplicado.* Ese caso registra ahora `guest_id = null`, igual que un token inexistente. Se
pierde a propósito la traza de *qué* código ajeno se presentó: guardarla ahí crearía una fila donde
el `event_id` del registro y el del invitado se contradicen, y rompería cualquier consulta que los
cruce. Si esa información hiciera falta, es una decisión de esquema aparte.

*Verificado* con dos eventos y sus invitados, escaneando el código de uno en la puerta del otro. La
respuesta HTTP es idéntica antes y después —`400 "Código no válido para este evento"`—, que es
precisamente por lo que el fallo pasaba desapercibido; lo que cambia es la tabla:

| | registro escrito | filas cruzadas en la tabla |
|---|---|---|
| antes | `invalid_token` con el `guest_id` del otro evento | 1 |
| ahora | `invalid_token` con `guest_id = null` | 0 |

Sin regresión: un token inexistente sigue registrando `null`, y un código propio sigue registrando
`success` con su invitado correcto.

### ✅ B-4 — `useEffect` sin dependencias declaradas — **RESUELTO**
El array estaba vacío mientras el efecto leía `token` y `navigate`. Resuelto junto con B-1: el
efecto declara `[token, navigate, onScanSuccess]`, y `onScanSuccess` es un `useCallback` con
identidad estable, así que el lector se sigue creando una sola vez. `npx eslint src/` ya no reporta
nada en todo el frontend.

### 🟢 B-5 — Dependencias y archivos sobrantes
`html-to-image` figura en las dependencias del **backend**, donde no tiene sentido, y desde el
arreglo de F-1 tampoco se usa ya en el frontend.
`frontend/src/index.css` está desactivado a propósito ([main.jsx:3](frontend/src/main.jsx:3)) y `App.css` no se importa en
ningún sitio.

### 🟢 B-6 — Manejo de errores homogéneo
Todos los `catch` devuelven `500` con un mensaje genérico. Un `P2025` de Prisma (registro
inexistente) en `PUT/DELETE /guests/:id` se presenta como error del servidor en lugar de `404`.

### 🟢 B-7 — Sin validación de entrada
Ningún endpoint valida tipos ni formatos. `POST /admin/events` con un `start_date` no parseable
crea un `Invalid Date` que revienta en la capa de base de datos como un `500` opaco.

---

## 9. Puesta en marcha

### Requisitos
- Node.js 18+
- Una base PostgreSQL accesible (el proyecto está configurado contra Neon)

### Backend
```bash
cd backend && npm install
```

`backend/.env` debe contener ambas variables; el servidor se detiene al arrancar si falta alguna:

```
DATABASE_URL=postgresql://usuario:password@host/base?sslmode=require
JWT_SECRET=<cadena aleatoria larga>
PORT=3000

# Opcionales: sin ellas el panel permite descargar el QR pero no enviarlo.
SMTP_HOST=smtp.ejemplo.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM="Accesos <no-reply@ejemplo.com>"
```

Hay una plantilla lista en [`backend/.env.example`](backend/.env.example).

```bash
npx prisma migrate deploy
```

```bash
npx prisma generate
```

```bash
node prisma/seed.js
```

```bash
npm run dev
```

### Frontend
```bash
cd frontend && npm install
```

```bash
npm run dev
```

`frontend/.env`:

```
VITE_API_URL=http://localhost:3000/api
```

> **Nota sobre la cámara:** `html5-qrcode` requiere un contexto seguro. Funciona en `localhost`,
> pero al probar el escáner desde un móvil contra la IP LAN del equipo el navegador bloqueará
> `getUserMedia` salvo que se sirva por HTTPS.

### Recorrido de prueba
1. `/admin/login` → `admin@evento.com` / la contraseña definida en `prisma/seed.js`.
2. `/admin/create-event` → crear un evento; anotar su `id` y la contraseña de staff.
3. Registrar un invitado desde `/admin/guests` seleccionando ese evento.
4. En el menú del invitado, «Ver acceso QR» → «Descargar PNG» (o «Enviar por correo» si
   configuraste SMTP).
5. `/staff/login` → ID del evento + contraseña de staff → `/staff/scan` → escanear el PNG.

---

## 10. Recomendaciones priorizadas

**Bloqueantes (impiden usar el sistema)** — todos resueltos
1. ~~Definir `JWT_SECRET`~~ (S-1) — **hecho**.
2. ~~Conectar `GuestsManager` a los endpoints existentes~~ (F-2) — **hecho**.
3. ~~Generar y entregar el QR al invitado~~ (F-1) — **hecho**.

**Seguridad (antes de cualquier uso real)** — ahora es el bloque prioritario
4. ~~Middleware de rol y saneado de `where` con `undefined`~~ (S-2) — **hecho** en los dos routers:
   `adminOnly` en el panel y `staffOnly` en el escaneo.
5. Hashear `staff_password` con bcrypt (S-3).
6. ~~Verificar propiedad del recurso en las rutas de invitados~~ (S-4) — **hecho**.
7. ~~Rechazar `status === 'revoked'` en el escaneo~~ (S-5) — **hecho**.
8. Restringir CORS y añadir rate limiting a los logins (S-8, S-9).

**Corrección funcional**
9. ~~Validar `start_date`/`end_date` y fijar la zona horaria del evento~~ (S-6, S-7) — **hecho**.
10. ~~Sustituir la guarda de reentrada del escáner por un `useRef`~~ (B-1) — **hecho**.
11. ~~Endpoint de métricas sobre `AccessLog` y conectar el dashboard~~ (F-3) — **hecho**.

**Calidad**
12. Validación de entrada (Zod o similar) y mapeo de errores de Prisma a códigos HTTP (B-6, B-7).
13. ~~Guardas de ruta en el frontend~~ (S-11) — **hecho**.
14. `git init` + `.gitignore` que excluya `.env`, tras rotar la credencial de Neon (S-10).
15. Poblar `device_info` con el `User-Agent` del escaneo (F-4).
