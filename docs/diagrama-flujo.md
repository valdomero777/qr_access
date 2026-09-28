# QR Access — Diagramas de flujo

Diagramas en sintaxis Mermaid. Se renderizan directamente en GitHub, GitLab, VS Code
(extensión Markdown Preview Mermaid) y en https://mermaid.live.

---

## 1. Flujo completo del sistema

Recorre los tres actores. La entrega del código (generación + descarga o correo) ya está
implementada; ver §7 del [análisis](ANALISIS-SISTEMA.md) para lo que sigue pendiente.

```mermaid
flowchart TD
    Start([Inicio]) --> Role{¿Qué actor?}

    %% ---------- ADMIN ----------
    Role -->|Administrador| AL["/admin/login<br/>email + contraseña"]
    AL --> ALP[["POST /api/admin/login"]]
    ALP --> ALC{"bcrypt.compare<br/>OK?"}
    ALC -->|No| ALE[401 Credenciales inválidas] --> AL
    ALC -->|Sí| ALT["JWT {adminId, role:'admin'} · 7d<br/>→ localStorage.adminToken"]
    ALT --> ADash["/admin/dashboard"]

    ADash --> AAcc{Acción}
    AAcc -->|Crear evento| CE["/admin/create-event<br/>nombre, fechas, horario,<br/>contraseña de staff"]
    CE --> CEP[["POST /api/admin/events"]]
    CEP --> CEDB[("Event<br/>id UUID generado")]
    CEDB --> AShare["El admin comparte<br/>eventId + staff_password<br/>con el personal de puerta"]

    AAcc -->|Registrar invitado| GM["/admin/guests"]
    GM --> GMP[["POST /api/admin/guests<br/>name, email, event_id"]]
    GMP --> GDup{"¿Email duplicado<br/>en el evento?"}
    GDup -->|Sí P2002| GErr[400 Ya registrado] --> GM
    GDup -->|No| GDB[("Guest<br/>qr_token UUID · status=pending")]
    GDB --> QRGen[/"Tarjeta de acceso con el QR<br/>generada desde qr_token"/]
    QRGen --> Entrega{"¿Cómo se entrega?"}
    Entrega -->|Descargar PNG| Desc["El admin descarga la tarjeta<br/>y la hace llegar por su cuenta"]
    Entrega -->|Enviar por correo| Mail[/"POST /admin/guests/:id/send-qr<br/>QR inline · marca qr_sent_at"/]

    AAcc -->|Ver métricas| Dash["Dashboard<br/>· DATOS SIMULADOS F-3 ·"]

    %% ---------- INVITADO ----------
    Role -->|Invitado| GHas["Presenta su QR<br/>en la puerta"]
    Mail --> GHas
    Desc --> GHas

    %% ---------- STAFF ----------
    Role -->|Staff| SL["/staff/login<br/>eventId + contraseña"]
    SL --> SLP[["POST /api/staff/login"]]
    SLP --> SLF{"¿Evento existe?"}
    SLF -->|No| SL404[404 Evento no encontrado] --> SL
    SLF -->|Sí| SLC{"staff_password<br/>coincide?<br/>(texto plano S-3)"}
    SLC -->|No| SL401[401 Contraseña incorrecta] --> SL
    SLC -->|Sí| SLT["JWT {role:'staff', eventId} · 12h<br/>→ localStorage.staffToken"]
    SLT --> Scan["/staff/scan<br/>html5-qrcode activa la cámara"]

    GHas --> Scan
    Scan --> Val[["POST /api/scan/validate<br/>{ qr_token } + Bearer staffToken"]]
    Val --> Verdict{{"Motor de validación<br/>(ver diagrama 2)"}}
    Verdict -->|success| OK["Pantalla VERDE<br/>ACCESO VÁLIDO"]
    Verdict -->|error| KO["Pantalla ROJA<br/>ACCESO DENEGADO"]
    OK --> Reset["Reset tras 2.5 s"] --> Scan
    KO --> Reset

    Verdict --> Log[("AccessLog<br/>event_id, guest_id, result")]
    Log -.->|falta endpoint F-3| Dash

```

---

## 2. Motor de validación del QR — `POST /api/scan/validate`

Es el núcleo del sistema, en [`backend/src/routes/scan.js`](../backend/src/routes/scan.js).
Toda la cadena está implementada. La ventana de acceso se evalúa en `event.timezone`, no en la
hora del servidor.

```mermaid
flowchart TD
    In([POST /api/scan/validate]) --> Hdr{"Header<br/>Authorization: Bearer ?"}
    Hdr -->|Falta o mal formado| E403[403 Formato de token inválido]
    Hdr -->|Presente| Ver{"jwt.verify<br/>con JWT_SECRET"}
    Ver -->|Falla| E401[401 Token inválido o expirado]
    Ver -->|OK| Ctx["req.user = payload<br/>eventId ← JWT, NO del body"]

    Ctx --> Find[("SELECT Guest<br/>WHERE qr_token = ?<br/>INCLUDE event")]

    Find --> C1{"¿Existe el guest<br/>Y guest.event_id === eventId?"}
    C1 -->|No| L1[/"AccessLog: invalid_token"/] --> R1[400 Código no válido para este evento]

    C1 -->|Sí| C2{"¿status === 'pending'?<br/>(lista blanca)"}
    C2 -->|"checked_in"| L2[/"AccessLog: already_used"/] --> R2[400 Entrada ya utilizada]
    C2 -->|"revoked"| L2b[/"AccessLog: revoked"/] --> R2b[400 Acceso revocado por la organización]
    C2 -->|"cualquier otro"| L2c[/"AccessLog: invalid_status"/] --> R2c[400 Este acceso no es válido]

    C2 -->|Sí| C3

    C3{"Hora actual EN event.timezone<br/>dentro de la ventana?<br/>(si entry_end &lt; entry_start,<br/>cruza la medianoche)"}
    C3 -->|No| L3[/"AccessLog: outside_schedule"/] --> R3["400 Fuera de horario.<br/>Acceso de HH:MM a HH:MM"]

    C3 -->|Sí| CY{"Jornada dentro de<br/>[start_date, end_date]?<br/>(en madrugada, la del día anterior)"}
    CY -->|No| L5[/"AccessLog: outside_dates"/] --> R5["400 Fuera de fecha.<br/>El acceso es sólo el DD/MM/AAAA"]

    CY -->|Sí| Upd[("UPDATE Guest<br/>SET status = 'checked_in'")]
    Upd --> L4[/"AccessLog: success"/] --> R4[200 Acceso concedido: nombre]
```

**Siete resultados posibles en `AccessLog.result`:**

| `result` | HTTP | Condición |
|---|---|---|
| `invalid_token` | 400 | El `qr_token` no existe, o pertenece a otro evento |
| `already_used` | 400 | El invitado ya hizo check-in |
| `revoked` | 400 | La organización revocó el acceso desde el panel |
| `invalid_status` | 400 | Cualquier otro estado distinto de `pending` (denegar por defecto) |
| `outside_schedule` | 400 | Hora actual (en `event.timezone`) fuera de la ventana de ingreso |
| `outside_dates` | 400 | La jornada no cae entre `start_date` y `end_date` |
| `success` | 200 | Acceso concedido; `Guest.status` pasa a `checked_in` |

---

## 3. Ciclo de vida de un invitado

```mermaid
stateDiagram-v2
    [*] --> pending: POST /admin/guests<br/>qr_token UUID generado

    pending --> checked_in: Escaneo válido<br/>(dentro de horario)
    pending --> pending: send-qr<br/>marca qr_sent_at
    pending --> revoked: PATCH /guests/:id/revoke
    pending --> [*]: DELETE /guests/:id

    checked_in --> checked_in: Reescaneo<br/>→ already_used (400)
    checked_in --> [*]: DELETE /guests/:id

    revoked --> revoked: Escaneo → revoked (400)
    revoked --> [*]: DELETE /guests/:id

    note right of revoked
        Estado terminal para el acceso:
        el escaneo sólo deja pasar a
        quien está en 'pending'.
    end note
```

---

## 4. Flujo de autenticación y ámbito de los tokens

Las nueve rutas protegidas de `/api/admin` exigen `verifyToken` **y** `requireAdmin`. El bloque
verde inferior muestra el caso que antes filtraba datos.

```mermaid
sequenceDiagram
    participant A as Admin
    participant S as Staff
    participant F as SPA React
    participant API as Express API
    participant DB as PostgreSQL

    rect rgb(238, 242, 255)
    note over A,DB: Sesión de administrador — 7 días
    A->>F: email + contraseña
    F->>API: POST /api/admin/login
    API->>DB: SELECT Admin WHERE email
    DB-->>API: password_hash
    API->>API: bcrypt.compare
    API-->>F: JWT {adminId, role:'admin'}
    F->>F: localStorage.adminToken
    end

    rect rgb(236, 253, 245)
    note over S,DB: Sesión de staff — 12 horas
    A-->>S: comparte eventId + staff_password
    S->>F: eventId + contraseña
    F->>API: POST /api/staff/login
    API->>DB: SELECT Event WHERE id
    DB-->>API: staff_password (texto plano)
    API->>API: comparación directa !==
    API-->>F: JWT {role:'staff', eventId}
    F->>F: localStorage.staffToken
    end

    rect rgb(236, 253, 245)
    note over F,API: S-2 corregido — adminOnly = [verifyToken, requireAdmin]
    F->>API: GET /api/admin/events<br/>con staffToken
    API->>API: requireAdmin: role !== 'admin'
    API-->>F: 403 Se requiere una sesión de administrador
    note right of API: Antes: el filtro admin_id quedaba<br/>en undefined, Prisma lo ignoraba<br/>y devolvía TODOS los eventos
    end
```

---

## 5. Mapa de rutas del frontend

```mermaid
flowchart LR
    subgraph Público
        LA["/admin/login"]
        LS["/staff/login"]
    end

    subgraph "Admin — AdminLayout con AppBar"
        D["/admin/dashboard"]
        G["/admin/guests"]
        C["/admin/create-event"]
    end

    subgraph "Staff — pantalla completa"
        SC["/staff/scan"]
    end

    LA -->|adminToken| D
    D <--> G
    D <--> C
    G <--> C
    LS -->|staffToken| SC
    SC -->|logout: localStorage.clear| LS

    W["* (cualquier otra)"] -->|Navigate replace| D

    D -.->|"S-11: sin guarda de token"| LA
    G -.->|"S-11: sin guarda de token"| LA
    C -.->|"S-11: sin guarda de token"| LA
```

> Sólo `/staff/scan` verifica el token antes de renderizar. Las tres rutas de admin se montan sin
> comprobación, así que un usuario sin sesión ve la pantalla vacía en lugar de ser redirigido.
