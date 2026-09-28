import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Chip, Button, Alert, CircularProgress, Divider, Stack
} from '@mui/material';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { getEvents } from '../../services/api';
import { sesionAdmin } from '../../utils/session';
import { formatDate } from '../../utils/eventFormat';

// Un evento está activo si HOY, en la zona horaria del propio evento, cae dentro
// de su rango de fechas. Se resuelve en su zona por la misma razón que el escaneo:
// la del navegador no tiene por qué coincidir con la del evento.
const estadoDelEvento = (event) => {
  const hoy = new Intl.DateTimeFormat('en-CA', {
    timeZone: event.timezone || 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  const inicio = new Date(event.start_date).toISOString().slice(0, 10);
  const fin = new Date(event.end_date).toISOString().slice(0, 10);

  if (hoy < inicio) return 'proximo';
  if (hoy > fin) return 'finalizado';
  return 'activo';
};

const ETIQUETAS = {
  activo: { texto: 'En curso', color: 'success' },
  proximo: { texto: 'Próximo', color: 'info' },
  finalizado: { texto: 'Finalizado', color: 'default' },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const sesion = sesionAdmin();

  const [eventos, setEventos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sesion) return;

    let vigente = true;
    getEvents(sesion.token)
      .then(data => { if (vigente) setEventos(data); })
      .catch(err => { if (vigente) { setError(err.message); setEventos([]); } });

    return () => { vigente = false; };
    // Sólo al montar: el token no cambia mientras la página está abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conEstado = (eventos || []).map(e => ({ ...e, estado: estadoDelEvento(e) }));
  const activos = conEstado.filter(e => e.estado === 'activo');
  const noActivos = conEstado.filter(e => e.estado !== 'activo');

  return (
    <Box sx={{ maxWidth: 1000, margin: '0 auto', mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4, gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="h4" fontWeight="bold" sx={{ color: '#1e293b' }}>
          Mis eventos
        </Typography>
        <Button
          variant="contained" startIcon={<EventAvailableIcon />}
          onClick={() => navigate('/admin/create-event')}
          sx={{ backgroundColor: '#1f2937', '&:hover': { backgroundColor: '#0f172a' } }}
        >
          Nuevo evento
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>{error}</Alert>}

      {eventos === null ? (
        <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>
      ) : eventos.length === 0 ? (
        <Paper elevation={0} sx={{ p: 6, textAlign: 'center', borderRadius: 2, border: '1px dashed #cbd5e1' }}>
          <Typography variant="h6" sx={{ color: '#475569', mb: 1 }}>Todavía no hay eventos</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Crea el primero para empezar a registrar invitados y emitir sus accesos.
          </Typography>
          <Button variant="contained" onClick={() => navigate('/admin/create-event')}>
            Crear evento
          </Button>
        </Paper>
      ) : (
        <Stack spacing={4}>
          <Seccion titulo="Activos" vacio="Ningún evento en curso hoy." eventos={activos} />
          <Seccion titulo="No activos" vacio="Nada más por aquí." eventos={noActivos} />
        </Stack>
      )}
    </Box>
  );
}

function Seccion({ titulo, vacio, eventos }) {
  return (
    <Box>
      <Typography
        variant="overline"
        sx={{ color: '#64748b', letterSpacing: 1.2, fontWeight: 'bold' }}
      >
        {titulo} · {eventos.length}
      </Typography>
      <Divider sx={{ mb: 2, mt: 0.5 }} />

      {eventos.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>{vacio}</Typography>
      ) : (
        <Stack spacing={1.5}>
          {eventos.map(evento => <TarjetaEvento key={evento.id} evento={evento} />)}
        </Stack>
      )}
    </Box>
  );
}

function TarjetaEvento({ evento }) {
  const navigate = useNavigate();
  const etiqueta = ETIQUETAS[evento.estado];
  const inicio = formatDate(evento.start_date);
  const fin = formatDate(evento.end_date);

  return (
    <Paper
      elevation={2}
      onClick={() => navigate(`/admin/events/${evento.id}`)}
      sx={{
        p: 2.5, borderRadius: 2, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 2,
        borderLeft: '4px solid',
        borderLeftColor: evento.estado === 'activo' ? 'success.main' : '#cbd5e1',
        transition: 'box-shadow .15s, transform .15s',
        '&:hover': { boxShadow: 6, transform: 'translateY(-1px)' },
      }}
    >
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="h6" fontWeight="bold" sx={{ color: '#1e293b' }}>
            {evento.name}
          </Typography>
          <Chip size="small" label={etiqueta.texto} color={etiqueta.color} variant="outlined" />
        </Box>
        <Typography variant="body2" color="text.secondary">
          {inicio === fin ? inicio : `${inicio} – ${fin}`}
          {' · '}Ingreso de {evento.entry_start} a {evento.entry_end}
          {' · '}{evento.timezone}
        </Typography>
        {evento.description && (
          <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.5 }} noWrap>
            {evento.description}
          </Typography>
        )}
      </Box>
      <ChevronRightIcon sx={{ color: '#94a3b8' }} />
    </Paper>
  );
}
