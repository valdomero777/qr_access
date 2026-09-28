// Lectura de la sesión a partir del propio JWT.
//
// El token lleva su fecha de caducidad dentro, así que podemos saber que expiró
// sin preguntar al servidor y pedir el login antes de que falle una petición.
// Esto es sólo para la interfaz: quien valida de verdad la firma es el backend.

export const SESION_EXPIRADA = 'sesion-expirada';

// Códigos con los que el backend marca "tu sesión ya no sirve". Cualquier otro
// 401/403 no cierra la sesión: ni una contraseña actual mal tecleada, ni un admin
// que toque una ruta de super admin (`insufficient_role`), que sigue con su sesión
// perfectamente válida.
const CODIGOS_DE_SESION = ['no_token', 'invalid_token', 'forbidden_role'];

export const esErrorDeSesion = (codigo) => CODIGOS_DE_SESION.includes(codigo);

const decodificar = (token) => {
  try {
    const carga = token.split('.')[1];
    const base64 = carga.replace(/-/g, '+').replace(/_/g, '/');
    const conRelleno = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(conRelleno));
  } catch {
    return null; // token con forma inesperada: lo tratamos como ausente
  }
};

const leerSesion = (clave) => {
  const token = localStorage.getItem(clave);
  if (!token) return null;

  const carga = decodificar(token);
  if (!carga?.exp) return null;

  return { token, ...carga, expiraEn: carga.exp * 1000 };
};

const vigente = (sesion) => Boolean(sesion) && sesion.expiraEn > Date.now();

export const sesionAdmin = () => {
  const s = leerSesion('adminToken');
  return vigente(s) ? s : null;
};

export const sesionStaff = () => {
  const s = leerSesion('staffToken');
  return vigente(s) ? s : null;
};

// El rol viaja dentro del JWT, así que la interfaz puede decidir qué mostrar sin
// preguntar al servidor. Quien manda de verdad sigue siendo el backend.
export const esSuperAdmin = () => sesionAdmin()?.role === 'super_admin';

export const cerrarSesionAdmin = () => {
  ['adminToken', 'adminName', 'adminId', 'adminRole'].forEach(k => localStorage.removeItem(k));
};

export const cerrarSesionStaff = () => {
  ['staffToken', 'eventName'].forEach(k => localStorage.removeItem(k));
};

// Avisa a la app de que hay que volver a pedir el login. Lo emite la capa de red
// para no acoplarla al router.
export const avisarSesionExpirada = (ambito) =>
  window.dispatchEvent(new CustomEvent(SESION_EXPIRADA, { detail: { ambito } }));

// "3 d", "5 h", "12 min" — cuánto le queda a la sesión.
export const tiempoRestante = (expiraEn) => {
  const ms = expiraEn - Date.now();
  if (ms <= 0) return 'caducada';

  const minutos = Math.floor(ms / 60000);
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  if (horas < 48) return `${horas} h`;

  return `${Math.floor(horas / 24)} días`;
};
