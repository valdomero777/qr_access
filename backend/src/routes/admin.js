const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const verifyToken = require('../middlewares/auth'); // Asegúrate de que este middleware exista
const { renderQrPng } = require('../utils/qr');
const { isMailConfigured, sendGuestQr } = require('../utils/mailer');
const { isValidTimezone, nowInZone } = require('../utils/schedule');

// Roles que pueden entrar al panel. El staff no: su token está firmado con el
// mismo secreto, así que sin esta comprobación pasaría igual.
const ROLES_DE_PANEL = ['admin', 'super_admin'];

// verifyToken sólo valida la firma, no el rol. Exigimos además un adminId
// presente, porque un `undefined` dentro de un `where` de Prisma desactiva el
// filtro en lugar de no encontrar nada.
const requireAdmin = (req, res, next) => {
  if (!ROLES_DE_PANEL.includes(req.user?.role) || !req.user.adminId) {
    return res.status(403).json({ error: 'Se requiere una sesión de administrador', code: 'forbidden_role' });
  }
  next();
};

// Un admin corriente que toque una ruta de super admin NO debe perder la sesión:
// el código es distinto a propósito para que el cliente muestre el error sin
// mandarlo al login.
const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'super_admin') {
    return res.status(403).json({
      error: 'Esta acción es sólo para el super administrador',
      code: 'insufficient_role'
    });
  }
  next();
};

// Toda ruta de este router salvo /login usa esta pareja. Van juntas a propósito:
// así no se puede aplicar verifyToken y olvidar la comprobación de rol.
const adminOnly = [verifyToken, requireAdmin];
const superAdminOnly = [verifyToken, requireAdmin, requireSuperAdmin];

// Qué eventos puede ver quien llama: el super admin todos, el admin sólo los que
// tiene asignados. Se aplica como filtro en cada consulta en vez de comprobarse
// después, para que un evento ajeno sea sencillamente invisible.
const filtroDeEventosVisibles = (user) =>
    user.role === 'super_admin'
        ? {}
        : { assignments: { some: { admin_id: user.adminId } } };

// Prisma exige un `where` único en update/delete, así que no admite añadirle el
// filtro de visibilidad: consultamos antes. Devuelven null si el recurso no
// existe o no es visible, y en ambos casos respondemos 404 para no revelar qué
// identificadores hay.
const findVisibleEvent = (eventId, user) =>
    prisma.event.findFirst({ where: { id: eventId, ...filtroDeEventosVisibles(user) } });

const findVisibleGuest = (guestId, user, options = {}) =>
    prisma.guest.findFirst({
        where: {
            id: guestId,
            ...(user.role === 'super_admin'
                ? {}
                : { event: { assignments: { some: { admin_id: user.adminId } } } })
        },
        ...options
    });

// Normaliza y valida lo que llega del panel para un invitado. Devuelve
// { datos } o { error }.
const leerDatosDeInvitado = (body) => {
    const name = String(body.name || '').trim();
    if (!name) return { error: 'El nombre es obligatorio' };

    // Cadena vacía y ausencia son lo mismo aquí: "sin dato".
    const email = String(body.email || '').trim() || null;
    const department = String(body.department || '').trim() || null;

    const party_size = body.party_size === undefined || body.party_size === ''
        ? 1
        : Number(body.party_size);

    if (!Number.isInteger(party_size) || party_size < 1 || party_size > 50) {
        return { error: 'El número de invitados debe ser un entero entre 1 y 50' };
    }

    const companions = (Array.isArray(body.companions) ? body.companions : [])
        .map(c => String(c).trim())
        .filter(Boolean);

    // Pueden faltar nombres por conocer, pero no sobrar.
    if (companions.length > party_size - 1) {
        return {
            error: party_size === 1
                ? 'Para añadir acompañantes, sube el número de invitados de la invitación'
                : `Con ${party_size} invitados sólo caben ${party_size - 1} acompañante(s)`
        };
    }

    return { datos: { name, email, department, party_size, companions } };
};

const guestNotFound = { error: 'Invitado no encontrado' };
const eventNotFound = { error: 'Evento no encontrado' };

const mailNotConfigured = {
  error: 'El envío de correo no está configurado. Define SMTP_HOST, SMTP_PORT y MAIL_FROM en backend/.env',
};

// --- AUTH ---

// Login de Administrador
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const admin = await prisma.admin.findUnique({ where: { email } });
        if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const token = jwt.sign(
            { adminId: admin.id, role: admin.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ token, adminName: admin.full_name, adminId: admin.id, role: admin.role });
    } catch (error) {
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// --- PERFIL ---

// Datos del administrador de la sesión. El `select` es explícito para que el
// hash de la contraseña no pueda escaparse por aquí.
router.get('/me', adminOnly, async (req, res) => {
    try {
        const admin = await prisma.admin.findUnique({
            where: { id: req.user.adminId },
            select: { id: true, full_name: true, email: true, role: true, created_at: true }
        });

        if (!admin) return res.status(404).json({ error: 'Administrador no encontrado' });
        res.json(admin);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener el perfil' });
    }
});

router.patch('/me/password', adminOnly, async (req, res) => {
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
        return res.status(400).json({ error: 'Falta la contraseña actual o la nueva' });
    }
    if (new_password.length < 8) {
        return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }
    if (new_password === current_password) {
        return res.status(400).json({ error: 'La nueva contraseña debe ser distinta de la actual' });
    }

    try {
        const admin = await prisma.admin.findUnique({ where: { id: req.user.adminId } });

        // 401 sin `code` de sesión: es la contraseña del cuerpo la que falla, no el
        // token, así que el cliente muestra el error y NO cierra la sesión.
        if (!admin || !(await bcrypt.compare(current_password, admin.password_hash))) {
            return res.status(401).json({ error: 'La contraseña actual no es correcta', code: 'wrong_password' });
        }

        await prisma.admin.update({
            where: { id: admin.id },
            data: { password_hash: await bcrypt.hash(new_password, 10) }
        });

        // El JWT es sin estado: cambiar la contraseña no invalida los ya emitidos.
        // Devolvemos uno nuevo para que esta sesión siga con su plazo completo; las
        // abiertas en otros dispositivos siguen vivas hasta que caduquen solas.
        const token = jwt.sign(
            { adminId: admin.id, role: admin.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({ message: 'Contraseña actualizada', token });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'No se pudo cambiar la contraseña' });
    }
});

// Si el envío de correo está configurado. La interfaz oculta todo lo relativo al
// envío cuando no lo está, para no ofrecer un botón que sólo puede fallar. Basta
// con rellenar SMTP_* y MAIL_FROM para que reaparezca: no hay un segundo
// interruptor que recordar.
router.get('/mail-status', adminOnly, (req, res) => {
    res.json({ configurado: isMailConfigured() });
});

// --- ADMINISTRADORES (sólo super admin) ---

const SIN_HASH = { id: true, full_name: true, email: true, role: true, created_at: true };

router.get('/admins', superAdminOnly, async (req, res) => {
    try {
        const admins = await prisma.admin.findMany({
            select: { ...SIN_HASH, _count: { select: { assignments: true } } },
            orderBy: { created_at: 'asc' }
        });
        res.json(admins);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al listar administradores' });
    }
});

router.post('/admins', superAdminOnly, async (req, res) => {
    const { full_name, email, password, role } = req.body;

    if (!full_name || !email || !password) {
        return res.status(400).json({ error: 'Faltan nombre, correo o contraseña' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }
    if (role && !ROLES_DE_PANEL.includes(role)) {
        return res.status(400).json({ error: 'Rol no válido' });
    }

    try {
        const admin = await prisma.admin.create({
            data: {
                full_name,
                email,
                role: role || 'admin',
                password_hash: await bcrypt.hash(password, 10)
            },
            select: SIN_HASH
        });
        res.json(admin);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: 'Ya existe un administrador con ese correo' });
        }
        console.error(error);
        res.status(500).json({ error: 'No se pudo crear el administrador' });
    }
});

router.delete('/admins/:id', superAdminOnly, async (req, res) => {
    // Quedarse sin super admin dejaría el sistema sin quien cree eventos ni asigne
    // administradores, así que ese caso se bloquea antes de borrar.
    if (req.params.id === req.user.adminId) {
        return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
    }

    try {
        const objetivo = await prisma.admin.findUnique({ where: { id: req.params.id } });
        if (!objetivo) return res.status(404).json({ error: 'Administrador no encontrado' });

        if (objetivo.role === 'super_admin') {
            const supers = await prisma.admin.count({ where: { role: 'super_admin' } });
            if (supers <= 1) {
                return res.status(400).json({ error: 'Debe quedar al menos un super administrador' });
            }
        }

        await prisma.admin.delete({ where: { id: req.params.id } });
        res.json({ message: 'Administrador eliminado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'No se pudo eliminar el administrador' });
    }
});

// --- ASIGNACIONES DE UN EVENTO (sólo super admin) ---

router.get('/events/:eventId/admins', superAdminOnly, async (req, res) => {
    try {
        const asignaciones = await prisma.eventAdmin.findMany({
            where: { event_id: req.params.eventId },
            include: { admin: { select: SIN_HASH } },
            orderBy: { assigned_at: 'asc' }
        });
        res.json(asignaciones.map(a => a.admin));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al listar las asignaciones' });
    }
});

router.post('/events/:eventId/admins', superAdminOnly, async (req, res) => {
    const { admin_id } = req.body;

    try {
        const [evento, admin] = await Promise.all([
            prisma.event.findUnique({ where: { id: req.params.eventId } }),
            prisma.admin.findUnique({ where: { id: admin_id } })
        ]);

        if (!evento) return res.status(404).json(eventNotFound);
        if (!admin) return res.status(404).json({ error: 'Administrador no encontrado' });

        // Un super admin ya ve todos los eventos por su rol: asignarlo no aporta.
        if (admin.role === 'super_admin') {
            return res.status(400).json({ error: 'Un super administrador ya tiene acceso a todos los eventos' });
        }

        await prisma.eventAdmin.upsert({
            where: { event_id_admin_id: { event_id: evento.id, admin_id: admin.id } },
            update: {},
            create: { event_id: evento.id, admin_id: admin.id }
        });

        res.json({ message: 'Administrador asignado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'No se pudo asignar el administrador' });
    }
});

router.delete('/events/:eventId/admins/:adminId', superAdminOnly, async (req, res) => {
    try {
        await prisma.eventAdmin.delete({
            where: { event_id_admin_id: { event_id: req.params.eventId, admin_id: req.params.adminId } }
        });
        res.json({ message: 'Asignación retirada' });
    } catch (error) {
        if (error.code === 'P2025') {
            return res.status(404).json({ error: 'Esa asignación no existe' });
        }
        console.error(error);
        res.status(500).json({ error: 'No se pudo retirar la asignación' });
    }
});

// --- EVENTOS ---

// Listar eventos del administrador (Para el selector de invitados)
router.get('/events', adminOnly, async (req, res) => {
    try {
        const events = await prisma.event.findMany({
            where: filtroDeEventosVisibles(req.user),
            orderBy: { created_at: 'desc' }
        });
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener eventos' });
    }
});

// Crear Evento
// Crear eventos es del super admin: es quien luego decide qué administrador los
// gestiona. Al crearlo se auto-asigna, para que no nazca sin nadie que lo vea.
router.post('/events', superAdminOnly, async (req, res) => {
    const { name, description, start_date, end_date, entry_start, entry_end, staff_password, qr_config, timezone } = req.body;

    // La ventana de ingreso se evalúa en esta zona, así que una zona inválida
    // dejaría el evento inservible en la puerta: mejor rechazarla al crearlo.
    const zona = timezone || 'UTC';
    if (!isValidTimezone(zona)) {
        return res.status(400).json({ error: `Zona horaria no válida: ${zona}` });
    }

    if (new Date(end_date) < new Date(start_date)) {
        return res.status(400).json({ error: 'La fecha de fin no puede ser anterior a la de inicio' });
    }

    try {
        const event = await prisma.event.create({
            data: {
                name,
                description,
                start_date: new Date(start_date),
                end_date: new Date(end_date),
                entry_start,
                entry_end,
                timezone: zona,
                staff_password, // En producción: await bcrypt.hash(staff_password, 10)
                qr_config: qr_config || {},
                admin_id: req.user.adminId, // Extraído del JWT por el middleware
                assignments: { create: { admin_id: req.user.adminId } }
            }
        });
        res.json(event);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'No se pudo crear el evento' });
    }
});

// Un evento concreto, para el panel de administración del evento
router.get('/events/:eventId', adminOnly, async (req, res) => {
    try {
        const event = await findVisibleEvent(req.params.eventId, req.user);
        if (!event) return res.status(404).json(eventNotFound);
        res.json(event);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener el evento' });
    }
});

// Diseño de la invitación. Se guarda tal cual en qr_config, que hasta ahora era un
// campo declarado y sin usar.
router.patch('/events/:eventId/design', adminOnly, async (req, res) => {
    const { qr_config } = req.body;

    if (!qr_config || typeof qr_config !== 'object' || Array.isArray(qr_config)) {
        return res.status(400).json({ error: 'El diseño debe ser un objeto' });
    }
    // El logo viaja embebido: sin tope, una fila de evento podría crecer sin medida.
    if (typeof qr_config.logo === 'string' && qr_config.logo.length > 400_000) {
        return res.status(400).json({ error: 'El logo es demasiado grande (máximo ~300 kB)' });
    }

    try {
        if (!(await findVisibleEvent(req.params.eventId, req.user))) {
            return res.status(404).json(eventNotFound);
        }

        const event = await prisma.event.update({
            where: { id: req.params.eventId },
            data: { qr_config }
        });
        res.json(event);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'No se pudo guardar el diseño' });
    }
});

// Métricas del evento, calculadas sobre Guest y AccessLog
router.get('/events/:eventId/stats', adminOnly, async (req, res) => {
    try {
        const event = await findVisibleEvent(req.params.eventId, req.user);
        if (!event) return res.status(404).json(eventNotFound);

        const where = { event_id: event.id };
        const [total, ingresados, revocados, enviados, logs] = await Promise.all([
            prisma.guest.count({ where }),
            prisma.guest.count({ where: { ...where, status: 'checked_in' } }),
            prisma.guest.count({ where: { ...where, status: 'revoked' } }),
            prisma.guest.count({ where: { ...where, qr_sent_at: { not: null } } }),
            // Sin el id (BigInt) para no arrastrar problemas al serializar a JSON.
            prisma.accessLog.findMany({ where, select: { result: true, scanned_at: true } })
        ]);

        const porResultado = logs.reduce((acc, l) => ({ ...acc, [l.result]: (acc[l.result] || 0) + 1 }), {});

        // Flujo de ingreso por hora, en la zona del evento y no en la del servidor.
        const cuentaPorHora = {};
        for (const l of logs) {
            if (l.result !== 'success') continue;
            const hora = `${nowInZone(event.timezone, l.scanned_at).time.slice(0, 2)}:00`;
            cuentaPorHora[hora] = (cuentaPorHora[hora] || 0) + 1;
        }

        res.json({
            total,
            ingresados,
            revocados,
            pendientes: total - ingresados - revocados,
            enviados,
            escaneos: logs.length,
            porResultado,
            porHora: Object.entries(cuentaPorHora)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([hora, accesos]) => ({ hora, accesos }))
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al calcular las métricas' });
    }
});

// --- INVITADOS ---

// Obtener invitados de un evento (Añadido para que la tabla cargue datos reales)
router.get('/events/:eventId/guests', adminOnly, async (req, res) => {
    try {
        if (!(await findVisibleEvent(req.params.eventId, req.user))) {
            return res.status(404).json(eventNotFound);
        }

        const guests = await prisma.guest.findMany({
            where: { event_id: req.params.eventId },
            orderBy: { name: 'asc' }
        });
        res.json(guests);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener invitados' });
    }
});

router.post('/guests', adminOnly, async (req, res) => {
    const { event_id } = req.body;
    const { datos, error } = leerDatosDeInvitado(req.body);
    if (error) return res.status(400).json({ error });

    try {
        if (!(await findVisibleEvent(event_id, req.user))) {
            return res.status(404).json(eventNotFound);
        }

        const guest = await prisma.guest.create({
            data: {
                ...datos,
                event_id,
                // qr_token se genera solo gracias a @default(uuid()) en tu schema.prisma
            }
        });
        res.json(guest);
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(400).json({ error: "Este correo ya está registrado en este evento." });
        }
        res.status(500).json({ error: "Error al crear invitado." });
    }
});

router.put('/guests/:id', adminOnly, async (req, res) => {
    const { datos, error } = leerDatosDeInvitado(req.body);
    if (error) return res.status(400).json({ error });

    try {
        if (!(await findVisibleGuest(req.params.id, req.user))) {
            return res.status(404).json(guestNotFound);
        }

        const guest = await prisma.guest.update({
            where: { id: req.params.id },
            data: datos
        });
        res.json(guest);
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(400).json({ error: 'Ese correo ya está registrado en este evento.' });
        }
        res.status(500).json({ error: 'Error al editar' });
    }
});

router.patch('/guests/:id/revoke', adminOnly, async (req, res) => {
    try {
        if (!(await findVisibleGuest(req.params.id, req.user))) {
            return res.status(404).json(guestNotFound);
        }

        const guest = await prisma.guest.update({
            where: { id: req.params.id },
            data: { status: 'revoked' }
        });
        res.json(guest);
    } catch (error) { 
        res.status(500).json({ error: "Error al revocar" }); 
    }
});

router.delete('/guests/:id', adminOnly, async (req, res) => {
    try {
        if (!(await findVisibleGuest(req.params.id, req.user))) {
            return res.status(404).json(guestNotFound);
        }

        await prisma.guest.delete({ where: { id: req.params.id } });
        res.json({ message: "Eliminado con éxito" });
    } catch (error) {
        res.status(500).json({ error: "Error al eliminar" });
    }
});

// --- ENTREGA DEL QR ---

// Enviar el código a un invitado concreto
router.post('/guests/:id/send-qr', adminOnly, async (req, res) => {
    if (!isMailConfigured()) return res.status(503).json(mailNotConfigured);

    try {
        const guest = await findVisibleGuest(req.params.id, req.user, {
            include: { event: true }
        });

        if (!guest) return res.status(404).json(guestNotFound);
        if (guest.status === 'revoked') {
            return res.status(400).json({ error: 'El acceso de este invitado está revocado' });
        }
        // El correo es opcional: sin él sólo queda descargar el acceso e imprimirlo.
        if (!guest.email) {
            return res.status(400).json({
                error: 'Este invitado no tiene correo. Descarga su acceso y hazlo llegar por otra vía.'
            });
        }

        const qrPng = await renderQrPng(guest.qr_token);
        await sendGuestQr({ guest, event: guest.event, qrPng });

        const updated = await prisma.guest.update({
            where: { id: guest.id },
            data: { qr_sent_at: new Date() }
        });

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(502).json({ error: `No se pudo enviar el correo: ${error.message}` });
    }
});

// Enviar el código a todos los invitados del evento. Por defecto sólo a quienes
// aún no lo han recibido, para que pulsar dos veces no reenvíe a todo el mundo.
router.post('/events/:eventId/send-qr', adminOnly, async (req, res) => {
    if (!isMailConfigured()) return res.status(503).json(mailNotConfigured);

    const reenviar = req.body?.resend === true;

    try {
        const event = await findVisibleEvent(req.params.eventId, req.user);

        if (!event) return res.status(404).json(eventNotFound);

        const where = {
            event_id: event.id,
            status: { not: 'revoked' },
            ...(reenviar ? {} : { qr_sent_at: null })
        };

        // A quien no tiene correo no se le puede enviar; se cuenta aparte para
        // poder decirlo en vez de dejarlo caer en silencio.
        const sinCorreo = await prisma.guest.count({ where: { ...where, email: null } });
        const guests = await prisma.guest.findMany({
            where: { ...where, email: { not: null } },
            orderBy: { name: 'asc' }
        });

        // En serie y no en paralelo: un Promise.all sobre 150 invitados abre 150
        // conexiones SMTP a la vez y la mayoría de proveedores corta la sesión.
        const fallidos = [];
        let enviados = 0;

        for (const guest of guests) {
            try {
                const qrPng = await renderQrPng(guest.qr_token);
                await sendGuestQr({ guest, event, qrPng });
                await prisma.guest.update({
                    where: { id: guest.id },
                    data: { qr_sent_at: new Date() }
                });
                enviados++;
            } catch (error) {
                console.error(`Error enviando a ${guest.email}:`, error.message);
                fallidos.push({ email: guest.email, error: error.message });
            }
        }

        res.json({ total: guests.length, enviados, fallidos, sinCorreo });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error durante el envío masivo' });
    }
});

module.exports = router;