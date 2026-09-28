// Formateo de fechas y horarios del evento, compartido por la tarjeta, el
// dashboard y el panel. Vive aparte del componente para no mezclar exportaciones
// de componentes y de utilidades en el mismo archivo.

// "2026-05-14T00:00:00.000Z" -> "14/05/2026". Las fechas del evento son columnas
// DATE, así que llegan a medianoche UTC: leemos las partes en UTC para no restar
// un día en husos negativos.
export const formatDate = (valor) => {
  const d = new Date(valor);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};

// "10/09/2026 · Ingreso de 09:00 a 18:00" — la misma línea en la tarjeta, en el
// PNG descargable y en el correo.
export const eventDetail = (event, ver = { fecha: true, horario: true }) => {
  if (!event) return '';

  const inicio = formatDate(event.start_date);
  const fin = formatDate(event.end_date);

  // Cada mitad se puede apagar desde el diseño de la invitación.
  const partes = [
    ver.fecha && (inicio === fin ? inicio : `${inicio} - ${fin}`),
    ver.horario && `Ingreso de ${event.entry_start} a ${event.entry_end}`,
  ].filter(Boolean);

  return partes.join(' · ');
};
