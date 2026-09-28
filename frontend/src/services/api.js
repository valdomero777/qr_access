import { avisarSesionExpirada, esErrorDeSesion } from '../utils/session';

const API_URL = import.meta.env.VITE_API_URL;

export const staffLogin = async (eventId, staffPassword) => {
  const response = await fetch(`${API_URL}/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, staffPassword }),
  });
  if (!response.ok) throw new Error('Credenciales incorrectas o evento no encontrado');
  return response.json();
};

export const validateQr = async (qrToken, token) => {
  const response = await fetch(`${API_URL}/scan/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}` // Enviamos el JWT del staff
    },
    body: JSON.stringify({ qr_token: qrToken }),
  });

  const data = await response.json().catch(() => ({}));

  // Si al staff se le caducó el turno a mitad de la puerta, hay que devolverlo al
  // login en vez de pintar un "acceso denegado" que no es culpa del invitado.
  if (esErrorDeSesion(data.code)) {
    avisarSesionExpirada('staff');
    return { status: 'error', message: 'Tu sesión caducó. Vuelve a iniciarla.' };
  }

  return data; // Retorna éxito o error controlado por nuestro backend
};
// ... (debajo de las funciones del staff)

export const adminLogin = async (email, password) => {
  const response = await fetch(`${API_URL}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error('Credenciales inválidas');
  return response.json();
};

export const createEvent = async (eventData, token) => {
  const response = await fetch(`${API_URL}/admin/events`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(eventData),
  });
  if (!response.ok) throw new Error('Error creando evento');
  return response.json();
};

// --- Eventos e invitados (rutas protegidas) ---

// Todas comparten cabecera y manejo de error. El backend responde { error: "mensaje" }
// y queremos mostrar ese texto —por ejemplo el de correo duplicado— y no uno genérico.
const authFetch = async (path, token, options = {}) => {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Sólo los códigos de sesión cierran la sesión. Un 401 por contraseña actual
    // incorrecta, por ejemplo, se limita a mostrar su mensaje.
    if (esErrorDeSesion(data.code)) avisarSesionExpirada('admin');
    throw new Error(data.error || 'No se pudo completar la operación');
  }

  return data;
};

// --- Perfil ---

export const getProfile = (token) => authFetch('/admin/me', token);

export const changePassword = (actual, nueva, token) =>
  authFetch('/admin/me/password', token, {
    method: 'PATCH',
    body: JSON.stringify({ current_password: actual, new_password: nueva }),
  });

// --- Administradores y asignaciones (sólo super admin) ---

export const getAdmins = (token) => authFetch('/admin/admins', token);

export const createAdmin = (datos, token) =>
  authFetch('/admin/admins', token, { method: 'POST', body: JSON.stringify(datos) });

export const deleteAdmin = (id, token) =>
  authFetch(`/admin/admins/${id}`, token, { method: 'DELETE' });

export const getEventAdmins = (eventId, token) =>
  authFetch(`/admin/events/${eventId}/admins`, token);

export const assignAdmin = (eventId, adminId, token) =>
  authFetch(`/admin/events/${eventId}/admins`, token, {
    method: 'POST',
    body: JSON.stringify({ admin_id: adminId }),
  });

export const unassignAdmin = (eventId, adminId, token) =>
  authFetch(`/admin/events/${eventId}/admins/${adminId}`, token, { method: 'DELETE' });

// ¿Está configurado el envío de correo? Decide si la interfaz muestra sus botones.
export const getMailStatus = (token) => authFetch('/admin/mail-status', token);

export const getEvents = (token) => authFetch('/admin/events', token);

export const getEvent = (eventId, token) => authFetch(`/admin/events/${eventId}`, token);

export const getEventStats = (eventId, token) => authFetch(`/admin/events/${eventId}/stats`, token);

// Diseño de la invitación; se guarda en el qr_config del evento.
export const saveEventDesign = (eventId, diseno, token) =>
  authFetch(`/admin/events/${eventId}/design`, token, {
    method: 'PATCH',
    body: JSON.stringify({ qr_config: diseno }),
  });

export const getGuests = (eventId, token) =>
  authFetch(`/admin/events/${eventId}/guests`, token);

export const createGuest = (guestData, token) =>
  authFetch('/admin/guests', token, { method: 'POST', body: JSON.stringify(guestData) });

export const updateGuest = (id, guestData, token) =>
  authFetch(`/admin/guests/${id}`, token, { method: 'PUT', body: JSON.stringify(guestData) });

export const revokeGuest = (id, token) =>
  authFetch(`/admin/guests/${id}/revoke`, token, { method: 'PATCH' });

export const deleteGuest = (id, token) =>
  authFetch(`/admin/guests/${id}`, token, { method: 'DELETE' });

// Envía el QR a un invitado. Devuelve el invitado con su qr_sent_at actualizado.
export const sendGuestQr = (id, token) =>
  authFetch(`/admin/guests/${id}/send-qr`, token, { method: 'POST' });

// Envío masivo. Por defecto sólo a quienes aún no lo han recibido;
// con resend: true reenvía a todo el evento.
export const sendEventQrs = (eventId, token, { resend = false } = {}) =>
  authFetch(`/admin/events/${eventId}/send-qr`, token, {
    method: 'POST',
    body: JSON.stringify({ resend }),
  });