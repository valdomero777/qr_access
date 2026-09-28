// Diseño de la invitación: valores por defecto y composición de la tarjeta.
//
// Se guarda en Event.qr_config, el campo JSONB que el esquema declaraba desde el
// principio y nunca se usaba. Los mismos valores los lee el backend para pintar
// el correo, así que lo que se ve en la vista previa es lo que recibe el invitado.

// Qué datos aparecen en la invitación. Cada uno se pinta sólo si está activado
// AQUÍ y además el invitado tiene ese dato: activar "departamento" no inventa uno.
export const CAMPOS = [
  { clave: 'mensaje', etiqueta: 'Mensaje de bienvenida' },
  { clave: 'fecha', etiqueta: 'Fecha del evento' },
  { clave: 'horario', etiqueta: 'Horario de ingreso' },
  { clave: 'departamento', etiqueta: 'Departamento' },
  { clave: 'invitados', etiqueta: 'Cuántas personas entran' },
  { clave: 'acompanantes', etiqueta: 'Nombres de los acompañantes' },
  { clave: 'correo', etiqueta: 'Correo del invitado' },
  { clave: 'token', etiqueta: 'Código en texto' },
];

export const CAMPOS_POR_DEFECTO = {
  mensaje: true,
  fecha: true,
  horario: true,
  departamento: true,
  invitados: true,
  acompanantes: true,
  correo: false, // dato del propio invitado: no se imprime salvo que se pida
  token: true,
};

export const DISENO_POR_DEFECTO = {
  colorAcento: '#0d6b73',
  colorFondo: '#ffffff',
  colorTexto: '#0f172a',
  mensaje: '',
  logo: null, // data URI
  mostrar: CAMPOS_POR_DEFECTO,
};

export const leerDiseno = (event) => {
  const guardado = event?.qr_config || {};
  return {
    ...DISENO_POR_DEFECTO,
    ...guardado,
    // Fusión aparte: un diseño guardado antes de existir estos campos, o con sólo
    // algunos, conserva el valor por defecto en el resto.
    mostrar: { ...CAMPOS_POR_DEFECTO, ...(guardado.mostrar || {}) },
  };
};

const cargarImagen = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // un logo roto no debe impedir la descarga
    img.src = src;
  });

// Compone la tarjeta descargable sobre un canvas propio, partiendo del que ya
// dibujó qrcode.react. Se probó html-to-image sobre el nodo del diálogo, pero
// toPng se queda colgado indefinidamente al intentar inlinear los estilos que MUI
// inyecta en tiempo de ejecución; dibujarla a mano es determinista.
export const buildTicketPng = async (qrCanvas, { eventName, guest, detalle, diseno }) => {
  const d = { ...DISENO_POR_DEFECTO, ...diseno };
  const ver = { ...CAMPOS_POR_DEFECTO, ...(diseno?.mostrar || {}) };

  // Líneas de datos: sólo las activadas Y con contenido.
  const lineas = [
    ver.departamento && guest.department,
    ver.invitados && guest.party_size > 1 && `Entran ${guest.party_size} personas`,
    ver.acompanantes && guest.companions?.length && `Con: ${guest.companions.join(', ')}`,
    ver.correo && guest.email,
  ].filter(Boolean);
  const W = 720;
  const escala = 2; // exporta al doble de resolución para que imprima bien
  const ladoQr = qrCanvas.width * 2; // factor entero: los módulos quedan nítidos

  const logo = d.logo ? await cargarImagen(d.logo) : null;
  let anchoLogo = 0;
  let altoLogo = 0;
  if (logo) {
    const escalaLogo = Math.min(220 / logo.width, 72 / logo.height, 1);
    anchoLogo = logo.width * escalaLogo;
    altoLogo = logo.height * escalaLogo;
  }

  // La altura sale de los bloques que realmente se pintan, así que el lienzo y el
  // dibujo no pueden desincronizarse cuando falta el logo o el mensaje.
  const bloques = [
    { tipo: 'eyebrow', alto: 40 },
    ...(logo ? [{ tipo: 'logo', alto: altoLogo + 28 }] : []),
    { tipo: 'nombre', alto: 46 },
    ...(ver.mensaje && d.mensaje ? [{ tipo: 'mensaje', alto: 34 }] : []),
    { tipo: 'hueco', alto: 26 },
    { tipo: 'qr', alto: ladoQr },
    { tipo: 'invitado', alto: 50 },
    ...(detalle ? [{ tipo: 'detalle', alto: 34 }] : []),
    ...lineas.map(texto => ({ tipo: 'linea', alto: 30, texto })),
    ...(ver.token ? [{ tipo: 'token', alto: 32 }] : []),
  ];
  const ALTO_BARRA = 10;
  const H = ALTO_BARRA + bloques.reduce((a, b) => a + b.alto, 0) + 40;

  const canvas = document.createElement('canvas');
  canvas.width = W * escala;
  canvas.height = H * escala;
  const ctx = canvas.getContext('2d');
  ctx.scale(escala, escala);

  ctx.fillStyle = d.colorFondo;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  ctx.fillStyle = d.colorAcento;
  ctx.fillRect(0, 0, W, ALTO_BARRA);

  ctx.textAlign = 'center';
  let y = ALTO_BARRA;

  for (const bloque of bloques) {
    switch (bloque.tipo) {
      case 'eyebrow':
        ctx.fillStyle = d.colorAcento;
        ctx.font = '500 17px Arial, Helvetica, sans-serif';
        ctx.fillText('A C C E S O   P E R S O N A L', W / 2, y + 28);
        break;

      case 'logo':
        ctx.drawImage(logo, (W - anchoLogo) / 2, y + 6, anchoLogo, altoLogo);
        break;

      case 'nombre': {
        ctx.fillStyle = d.colorTexto;
        let tamano = 36;
        do {
          tamano -= 2;
          ctx.font = `bold ${tamano}px Arial, Helvetica, sans-serif`;
        } while (ctx.measureText(eventName).width > W - 96 && tamano > 16);
        ctx.fillText(eventName, W / 2, y + 34);
        break;
      }

      case 'mensaje':
        ctx.fillStyle = d.colorAcento;
        ctx.font = 'italic 19px Arial, Helvetica, sans-serif';
        ctx.fillText(d.mensaje, W / 2, y + 24);
        break;

      case 'qr':
        // Sin interpolación y a 2x exactos: ampliar un QR con suavizado emborrona
        // los módulos y puede costarle al lector.
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(qrCanvas, (W - ladoQr) / 2, y, ladoQr, ladoQr);
        ctx.imageSmoothingEnabled = true;
        break;

      case 'invitado':
        ctx.fillStyle = d.colorTexto;
        ctx.font = 'bold 30px Arial, Helvetica, sans-serif';
        ctx.fillText(guest.name, W / 2, y + 38);
        break;

      case 'linea':
        ctx.fillStyle = '#475569';
        ctx.font = '18px Arial, Helvetica, sans-serif';
        ctx.fillText(bloque.texto, W / 2, y + 20);
        break;

      case 'detalle':
        ctx.fillStyle = '#64748b';
        ctx.font = '20px Arial, Helvetica, sans-serif';
        ctx.fillText(detalle, W / 2, y + 22);
        break;

      case 'token':
        ctx.fillStyle = '#94a3b8';
        ctx.font = '17px "Courier New", Courier, monospace';
        ctx.fillText(guest.qr_token, W / 2, y + 20);
        break;

      default:
        break; // hueco
    }
    y += bloque.alto;
  }

  return canvas.toDataURL('image/png');
};
