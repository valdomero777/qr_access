import { Box, Typography } from '@mui/material';
import { QRCodeCanvas } from 'qrcode.react';
import { leerDiseno } from '../utils/design';
import { eventDetail } from '../utils/eventFormat';

// La tarjeta que ve el invitado. Se usa tanto en el diálogo del QR como en la
// vista previa del diseñador, para que no puedan divergir.
export default function TicketCard({ event, guest, diseno: disenoProp, qrRef }) {
  const d = disenoProp || leerDiseno(event);
  const ver = d.mostrar || {};

  // Cada línea aparece sólo si está activada en el diseño Y hay dato que mostrar.
  const detalle = [ver.fecha, ver.horario].some(Boolean) ? eventDetail(event, ver) : '';
  const lineas = [
    ver.departamento && guest?.department,
    ver.invitados && guest?.party_size > 1 && `Entran ${guest.party_size} personas`,
    ver.acompanantes && guest?.companions?.length && `Con: ${guest.companions.join(', ')}`,
    ver.correo && guest?.email,
  ].filter(Boolean);

  return (
    <Box
      sx={{
        backgroundColor: d.colorFondo,
        border: '1px solid #e2e8f0',
        borderRadius: 3,
        overflow: 'hidden',
        textAlign: 'center',
      }}
    >
      <Box sx={{ height: 10, backgroundColor: d.colorAcento }} />

      <Box sx={{ p: 3 }}>
        <Typography variant="overline" sx={{ color: d.colorAcento, letterSpacing: 1.5 }}>
          Acceso personal
        </Typography>

        {d.logo && (
          <Box sx={{ mb: 1.5 }}>
            <Box component="img" src={d.logo} alt="" sx={{ maxHeight: 72, maxWidth: 220 }} />
          </Box>
        )}

        <Typography
          variant="h6" fontWeight="bold"
          sx={{ color: d.colorTexto, mb: ver.mensaje && d.mensaje ? 0.5 : 2 }}
        >
          {event?.name}
        </Typography>

        {ver.mensaje && d.mensaje && (
          <Typography sx={{ color: d.colorAcento, fontStyle: 'italic', mb: 2 }}>
            {d.mensaje}
          </Typography>
        )}

        {/* marginSize en módulos, igual que el margin del PNG del correo, para que
            el código descargado y el enviado sean equivalentes. */}
        <QRCodeCanvas ref={qrRef} value={guest?.qr_token || ''} size={220} level="M" marginSize={2} />

        <Typography variant="body1" fontWeight="bold" sx={{ color: d.colorTexto, mt: 2 }}>
          {guest?.name}
        </Typography>

        {detalle && (
          <Typography variant="body2" sx={{ color: '#64748b' }}>{detalle}</Typography>
        )}

        {lineas.map((texto, i) => (
          <Typography key={i} variant="body2" sx={{ color: '#475569', mt: 0.5 }}>
            {texto}
          </Typography>
        ))}

        {ver.token && (
          <Typography sx={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8', mt: 1.5, wordBreak: 'break-all' }}>
            {guest?.qr_token}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
