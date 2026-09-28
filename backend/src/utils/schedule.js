// Decide si un escaneo cae dentro de la ventana de acceso del evento.
//
// Dos cosas que el cálculo original hacía mal:
//   - usaba la hora local del proceso Node, que en la nube suele ser UTC y no la
//     hora real del evento;
//   - comparaba entry_start/entry_end como cadenas, lo que hace imposible una
//     ventana nocturna: con "22:00" y "02:00" ningún valor cumple las dos.
// Y no miraba start_date/end_date en absoluto, así que un QR servía cualquier día.

// Comprueba que una zona IANA exista antes de guardarla.
const isValidTimezone = (timezone) => {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

// Fecha y hora actuales EN LA ZONA DEL EVENTO, como cadenas comparables
// ("2026-09-10" y "22:30"). hourCycle h23 evita el "24:00" que algunas versiones
// de ICU devuelven a medianoche con hour12: false.
const nowInZone = (timezone, now = new Date()) => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
    .formatToParts(now)
    .reduce((acc, parte) => ({ ...acc, [parte.type]: parte.value }), {});

  return {
    date: `${partes.year}-${partes.month}-${partes.day}`,
    time: `${partes.hour}:${partes.minute}`,
  };
};

// start_date y end_date son columnas DATE: Prisma las devuelve a medianoche UTC,
// así que leemos las partes en UTC para no desplazarlas un día.
const toISODate = (value) => {
  const d = new Date(value);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
};

const toHumanDate = (isoDate) => isoDate.split('-').reverse().join('/');

// Devuelve { ok: true } o { ok: false, result, message }, donde `result` es lo
// que se guarda en AccessLog y `message` lo que lee el operador de puerta.
const checkEntryWindow = (event, now = new Date()) => {
  const timezone = isValidTimezone(event.timezone) ? event.timezone : 'UTC';
  const { date, time } = nowInZone(timezone, now);

  const inicio = toISODate(event.start_date);
  const fin = toISODate(event.end_date);
  const cruzaMedianoche = event.entry_end < event.entry_start;

  // El horario se comprueba antes que la fecha a propósito: a quien llega a las
  // 03:00 tras una ventana de 22:00 a 02:00 le sirve mucho más "fuera de horario"
  // que "fuera de fecha", aunque técnicamente ya sea el día siguiente.
  const dentroDeHorario = cruzaMedianoche
    ? (time >= event.entry_start || time <= event.entry_end)
    : (time >= event.entry_start && time <= event.entry_end);

  if (!dentroDeHorario) {
    return {
      ok: false,
      result: 'outside_schedule',
      message: `Fuera de horario. Acceso de ${event.entry_start} a ${event.entry_end}`,
    };
  }

  // En una ventana nocturna (22:00–02:00) la madrugada pertenece a la jornada del
  // día anterior: quien entra a la 01:00 del día 11 sigue en el evento del día 10.
  const enLaMadrugada = cruzaMedianoche && time <= event.entry_end;
  const jornada = enLaMadrugada ? addDays(date, -1) : date;

  if (jornada < inicio || jornada > fin) {
    const cuando = inicio === fin
      ? `sólo el ${toHumanDate(inicio)}`
      : `del ${toHumanDate(inicio)} al ${toHumanDate(fin)}`;
    return { ok: false, result: 'outside_dates', message: `Fuera de fecha. El acceso es ${cuando}` };
  }

  return { ok: true };
};

module.exports = { isValidTimezone, checkEntryWindow, nowInZone };
