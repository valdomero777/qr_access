const nodemailer = require('nodemailer');

// El envío es opcional: si no hay SMTP configurado el resto del sistema sigue
// funcionando y el administrador puede descargar el QR desde el panel.
const isMailConfigured = () =>
  Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.MAIL_FROM);

let transport = null;

const getTransport = () => {
  if (!transport) {
    const port = Number(process.env.SMTP_PORT);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465, // 465 abre TLS directo; 587 y 25 negocian STARTTLS
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transport;
};

// start_date y end_date son columnas DATE, así que Prisma las devuelve a
// medianoche UTC. Leemos las partes en UTC para no restar un día en husos
// negativos como el de México.
const formatDate = (date) => {
  const d = new Date(date);
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${d.getUTCFullYear()}`;
};

// Valores por defecto del diseño, espejo de los del panel. Si el evento no tiene
// qr_config, el correo sale con el aspecto neutro de siempre.
const CAMPOS_POR_DEFECTO = {
  mensaje: true,
  fecha: true,
  horario: true,
  departamento: true,
  invitados: true,     // "Entran N personas"
  acompanantes: true,
  correo: false,       // dato del propio invitado: no se imprime salvo que se pida
  token: true,
};

const DISENO_POR_DEFECTO = {
  colorAcento: '#0d6b73',
  colorFondo: '#ffffff',
  colorTexto: '#0f172a',
  mensaje: '',
  logo: null,
  mostrar: CAMPOS_POR_DEFECTO,
};

const leerDiseno = (event) => {
  const guardado = event.qr_config || {};
  return {
    ...DISENO_POR_DEFECTO,
    ...guardado,
    // Fusión aparte: si el diseño guardado es anterior a estos campos, o sólo
    // trae algunos, el resto conserva su valor por defecto.
    mostrar: { ...CAMPOS_POR_DEFECTO, ...(guardado.mostrar || {}) },
  };
};

// "data:image/png;base64,AAA..." -> { content, contentType } para adjuntarlo inline.
const logoAdjunto = (dataUri) => {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUri || '');
  if (!m) return null;
  return { contentType: m[1], content: Buffer.from(m[2], 'base64') };
};

const buildHtml = (guest, event, diseno, tieneLogo) => {
  const ver = diseno.mostrar;

  const fechas =
    formatDate(event.start_date) === formatDate(event.end_date)
      ? formatDate(event.start_date)
      : `del ${formatDate(event.start_date)} al ${formatDate(event.end_date)}`;

  // Cada fila sólo aparece si está activada en el diseño y además hay dato.
  const filas = [
    ver.fecha && ['Fecha', fechas],
    ver.horario && ['Horario de ingreso', `${event.entry_start} a ${event.entry_end}`],
    ver.departamento && guest.department && ['Departamento', guest.department],
    ver.invitados && guest.party_size > 1 && ['Entran', `${guest.party_size} personas`],
    ver.correo && guest.email && ['Correo', guest.email],
  ].filter(Boolean);

  const acompanantes =
    ver.acompanantes && guest.companions?.length
      ? `<p style="font-size: 14px; color: #475569; line-height: 1.6;">
           <strong>Acompañantes:</strong> ${guest.companions.join(', ')}
         </p>`
      : '';

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto; color: ${diseno.colorTexto};">
      <div style="height: 6px; background: ${diseno.colorAcento}; border-radius: 3px; margin-bottom: 24px;"></div>

      ${tieneLogo ? `<div style="text-align:center; margin-bottom: 16px;"><img src="cid:logo-evento" alt="" style="max-height:72px; max-width:220px;" /></div>` : ''}

      <p style="font-size: 16px;">Hola ${guest.name},</p>
      <p style="font-size: 16px; line-height: 1.6;">
        Aquí tienes tu acceso para <strong>${event.name}</strong>. Muestra este código en la
        entrada; es personal y sólo admite un ingreso.
      </p>

      ${ver.mensaje && diseno.mensaje ? `<p style="font-size: 16px; line-height: 1.6; color: ${diseno.colorAcento};"><em>${diseno.mensaje}</em></p>` : ''}

      <div style="text-align: center; background: ${diseno.colorFondo}; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 24px 0;">
        <img src="cid:qr-entrada" alt="Código QR de acceso" width="260" height="260" style="display: block; margin: 0 auto;" />
        ${ver.token ? `<p style="font-family: monospace; font-size: 12px; color: #64748b; margin: 16px 0 0;">${guest.qr_token}</p>` : ''}
      </div>

      ${filas.length ? `<table style="width: 100%; font-size: 15px; border-collapse: collapse;">
        ${filas.map(([etiqueta, valor]) => `<tr>
          <td style="padding: 6px 0; color: #64748b;">${etiqueta}</td>
          <td style="padding: 6px 0; text-align: right;"><strong>${valor}</strong></td>
        </tr>`).join('')}
      </table>` : ''}

      ${acompanantes}

      ${event.description ? `<p style="font-size: 14px; color: #475569; line-height: 1.6;">${event.description}</p>` : ''}

      <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin-top: 24px;">
        Fuera del horario de ingreso el código no será válido. Si no vas a asistir, avisa a la
        organización para liberar tu lugar.
      </p>
    </div>
  `;
};

const buildText = (guest, event) =>
  [
    `Hola ${guest.name},`,
    '',
    `Aquí tienes tu acceso para ${event.name}. Muestra el código QR adjunto en la entrada;`,
    'es personal y sólo admite un ingreso.',
    '',
    `Código: ${guest.qr_token}`,
    `Fecha: ${formatDate(event.start_date)} - ${formatDate(event.end_date)}`,
    `Horario de ingreso: ${event.entry_start} a ${event.entry_end}`,
    guest.department ? `Departamento: ${guest.department}` : null,
    guest.party_size > 1 ? `Entran ${guest.party_size} personas` : null,
    guest.companions?.length ? `Acompañantes: ${guest.companions.join(', ')}` : null,
    '',
    'Fuera del horario de ingreso el código no será válido.',
  ].filter(l => l !== null).join('\n');

const sendGuestQr = ({ guest, event, qrPng }) => {
  const diseno = leerDiseno(event);
  const logo = logoAdjunto(diseno.logo);

  const adjuntos = [
    {
      filename: 'acceso-qr.png',
      content: qrPng,
      cid: 'qr-entrada', // referenciado desde el <img src="cid:qr-entrada">
    },
  ];

  if (logo) {
    adjuntos.push({
      filename: 'logo' + (logo.contentType === 'image/png' ? '.png' : '.img'),
      content: logo.content,
      contentType: logo.contentType,
      cid: 'logo-evento',
    });
  }

  return getTransport().sendMail({
    from: process.env.MAIL_FROM,
    to: guest.email,
    subject: `Tu acceso para ${event.name}`,
    text: buildText(guest, event),
    html: buildHtml(guest, event, diseno, Boolean(logo)),
    attachments: adjuntos,
  });
};

module.exports = { isMailConfigured, sendGuestQr };
