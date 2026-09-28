import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Box, Typography, Card, CardContent, Paper, Alert, CircularProgress, Chip, Stack } from '@mui/material';
import PeopleIcon from '@mui/icons-material/People';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import SendIcon from '@mui/icons-material/Send';
import { getEventStats } from '../../../services/api';
import { sesionAdmin } from '../../../utils/session';

// Los mismos nombres que guarda AccessLog.result, en castellano.
const MOTIVOS = {
  success: 'Accesos concedidos',
  already_used: 'Entradas ya utilizadas',
  revoked: 'Accesos revocados',
  invalid_status: 'Estado no válido',
  outside_schedule: 'Fuera de horario',
  outside_dates: 'Fuera de fecha',
  invalid_token: 'Códigos no válidos',
};

export default function MetricsTab({ event }) {
  const token = sesionAdmin()?.token;
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let vigente = true;

    getEventStats(event.id, token)
      .then(data => { if (vigente) setStats(data); })
      .catch(err => { if (vigente) setError(err.message); });

    return () => { vigente = false; };
  }, [event.id, token]);

  if (error) return <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>;
  if (!stats) return <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>;

  const rechazos = Object.entries(stats.porResultado).filter(([r]) => r !== 'success');

  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 2, mb: 4 }}>
        <Tarjeta titulo="Invitados" valor={stats.total} icono={<PeopleIcon sx={{ fontSize: 36 }} />} color="#3b82f6" />
        <Tarjeta titulo="Han ingresado" valor={stats.ingresados} icono={<CheckCircleIcon sx={{ fontSize: 36 }} />} color="#10b981" />
        <Tarjeta titulo="Pendientes" valor={stats.pendientes} icono={<AccessTimeIcon sx={{ fontSize: 36 }} />} color="#f59e0b" />
        <Tarjeta titulo="QR enviados" valor={stats.enviados} icono={<SendIcon sx={{ fontSize: 36 }} />} color="#8b5cf6" />
      </Box>

      <Paper elevation={2} sx={{ p: 3, borderRadius: 2, mb: 3 }}>
        <Typography variant="h6" fontWeight="bold" sx={{ mb: 0.5, color: '#475569' }}>
          Flujo de ingreso por hora
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Accesos concedidos, en la hora local del evento ({event.timezone}).
        </Typography>

        {stats.porHora.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            Todavía no hay ingresos registrados.
          </Typography>
        ) : (
          <Box sx={{ height: 320, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.porHora}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="hora" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="accesos" fill="#1f2937" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Box>
        )}
      </Paper>

      <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h6" fontWeight="bold" sx={{ mb: 0.5, color: '#475569' }}>
          Escaneos en la puerta
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {stats.escaneos} escaneo(s) registrados en total.
        </Typography>

        {rechazos.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Ningún escaneo rechazado.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {rechazos.map(([motivo, cuenta]) => (
              <Box key={motivo} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Typography variant="body2">{MOTIVOS[motivo] || motivo}</Typography>
                <Chip size="small" label={cuenta} color={motivo === 'already_used' ? 'warning' : 'error'} variant="outlined" />
              </Box>
            ))}
          </Stack>
        )}

        {stats.revocados > 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {stats.revocados} invitado(s) con el acceso revocado.
          </Typography>
        )}
      </Paper>
    </Box>
  );
}

function Tarjeta({ titulo, valor, icono, color }) {
  return (
    <Card elevation={2} sx={{ borderRadius: 2, display: 'flex', alignItems: 'center', p: 2 }}>
      <Box sx={{ backgroundColor: `${color}15`, color, p: 1.5, borderRadius: 2, mr: 2, display: 'flex' }}>
        {icono}
      </Box>
      <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
        <Typography variant="body2" color="text.secondary" fontWeight="bold" sx={{ textTransform: 'uppercase' }}>
          {titulo}
        </Typography>
        <Typography variant="h4" fontWeight="bold" sx={{ color: '#1e293b' }}>{valor}</Typography>
      </CardContent>
    </Card>
  );
}
