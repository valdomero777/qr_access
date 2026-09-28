const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const verifyToken = require('../middlewares/auth');
const { checkEntryWindow } = require('../utils/schedule');

// verifyToken valida la firma, no el rol: un token del panel está firmado con el
// mismo secreto y pasaría igual, sólo que sin eventId. Sin esta comprobación, esa
// petición llegaba hasta el fondo con `eventId` en undefined y acababa en un
// "código no válido" engañoso, además de intentar escribir un AccessLog sin evento.
const requireStaff = (req, res, next) => {
  if (req.user?.role !== 'staff' || !req.user.eventId) {
    return res.status(403).json({
      error: 'Se requiere una sesión de personal de puerta',
      code: 'forbidden_role'
    });
  }
  next();
};

// Van juntas a propósito, igual que en el router de admin: así no se puede aplicar
// verifyToken y olvidar la comprobación de rol al añadir una ruta.
const staffOnly = [verifyToken, requireStaff];

// Estados que niegan el paso, con el motivo que se registra en AccessLog y el
// texto que ve el operador de puerta.
const ESTADOS_DENEGADOS = {
  checked_in: { result: 'already_used', message: 'Entrada ya utilizada' },
  revoked: { result: 'revoked', message: 'Acceso revocado por la organización' },
};

router.post('/validate', staffOnly, async (req, res) => {
  const { qr_token } = req.body;
  const eventId = req.user.eventId; // Viene del JWT

  try {
    const guest = await prisma.guest.findUnique({
      where: { qr_token: qr_token },
      include: { event: true }
    });

    // 1. Validar que el código exista y pertenezca a este evento.
    // El guest_id se deja en null a propósito: si el código existe pero es de otro
    // evento, guardar su id aquí crearía un AccessLog que ata un invitado ajeno a
    // este evento, y contaminaría cualquier métrica que agrupe por evento.
    if (!guest || guest.event_id !== eventId) {
      await logAccess(eventId, null, 'invalid_token');
      return res.status(400).json({ status: 'error', message: 'Código no válido para este evento' });
    }

    // 2. Validar el estado del invitado. Sólo entra quien está en 'pending':
    // comprobamos por lista blanca para que cualquier estado que se añada en el
    // futuro deniegue por defecto en lugar de conceder el acceso.
    if (guest.status !== 'pending') {
      const motivo = ESTADOS_DENEGADOS[guest.status]
        || { result: 'invalid_status', message: 'Este acceso no es válido' };

      await logAccess(eventId, guest.id, motivo.result);
      return res.status(400).json({ status: 'error', message: motivo.message });
    }

    // 3. Validar fecha y horario, evaluados en la zona horaria del evento
    const ventana = checkEntryWindow(guest.event);

    if (!ventana.ok) {
      await logAccess(eventId, guest.id, ventana.result);
      return res.status(400).json({ status: 'error', message: ventana.message });
    }

    // 4. Todo bien: Actualizar estado y registrar éxito
    await prisma.guest.update({
      where: { id: guest.id },
      data: { status: 'checked_in' }
    });

    await logAccess(eventId, guest.id, 'success');

    // Una invitación puede cubrir a varias personas, así que el operador necesita
    // saber cuántas dejar pasar. El check-in sigue siendo uno por invitación.
    res.json({
      status: 'success',
      message: `Acceso concedido: ${guest.name}`,
      guest: {
        name: guest.name,
        department: guest.department,
        party_size: guest.party_size,
        companions: guest.companions,
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error procesando el escaneo' });
  }
});

// Función de ayuda para registrar las métricas
async function logAccess(eventId, guestId, result) {
  try {
    await prisma.accessLog.create({
      data: { event_id: eventId, guest_id: guestId, result: result }
    });
  } catch (error) {
    console.error("Error guardando el log:", error);
  }
}

module.exports = router;