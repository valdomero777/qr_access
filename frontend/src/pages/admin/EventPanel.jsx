import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box, Typography, Tabs, Tab, Alert, CircularProgress, Chip, Button, Stack, Tooltip, IconButton
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { getEvent } from '../../services/api';
import { sesionAdmin, esSuperAdmin } from '../../utils/session';
import { formatDate } from '../../utils/eventFormat';
import GuestsTab from './event/GuestsTab';
import MetricsTab from './event/MetricsTab';
import DesignTab from './event/DesignTab';
import TeamTab from './event/TeamTab';

export default function EventPanel() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const token = sesionAdmin()?.token;

  const [event, setEvent] = useState(null);
  const [error, setError] = useState(null);
  const [pestana, setPestana] = useState(0);
  const [copiado, setCopiado] = useState(false);
  const superAdmin = esSuperAdmin();

  useEffect(() => {
    let vigente = true;

    getEvent(eventId, token)
      .then(data => { if (vigente) setEvent(data); })
      .catch(err => { if (vigente) setError(err.message); });

    return () => { vigente = false; };
  }, [eventId, token]);

  const copiarId = async () => {
    try {
      await navigator.clipboard.writeText(eventId);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError('No se pudo copiar. El id es: ' + eventId);
    }
  };

  if (error) {
    return (
      <Box sx={{ maxWidth: 1000, margin: '0 auto', mt: 2 }}>
        <Alert severity="error" sx={{ borderRadius: 2, mb: 2 }}>{error}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/admin/dashboard')}>
          Volver a mis eventos
        </Button>
      </Box>
    );
  }

  if (!event) return <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>;

  const inicio = formatDate(event.start_date);
  const fin = formatDate(event.end_date);

  return (
    <Box sx={{ maxWidth: 1100, margin: '0 auto', mt: 2 }}>
      <Button
        startIcon={<ArrowBackIcon />} onClick={() => navigate('/admin/dashboard')}
        sx={{ mb: 2, color: '#64748b' }}
      >
        Mis eventos
      </Button>

      <Typography variant="h4" fontWeight="bold" sx={{ color: '#1e293b' }}>
        {event.name}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {inicio === fin ? inicio : `${inicio} – ${fin}`}
        {' · '}Ingreso de {event.entry_start} a {event.entry_end}
        {' · '}{event.timezone}
      </Typography>

      {/* El personal de puerta necesita este id para entrar al escáner. */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5, mb: 3, flexWrap: 'wrap' }}>
        <Chip
          size="small" variant="outlined"
          label={`ID para el staff: ${eventId}`}
          sx={{ fontFamily: 'monospace' }}
        />
        <Tooltip title={copiado ? '¡Copiado!' : 'Copiar el id'}>
          <IconButton size="small" onClick={copiarId}><ContentCopyIcon fontSize="small" /></IconButton>
        </Tooltip>
      </Stack>

      <Tabs
        value={pestana} onChange={(_, v) => setPestana(v)}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        <Tab label="Invitados" />
        <Tab label="Métricas" />
        <Tab label="Invitación" />
        {superAdmin && <Tab label="Equipo" />}
      </Tabs>

      {pestana === 0 && <GuestsTab event={event} />}
      {pestana === 1 && <MetricsTab event={event} />}
      {pestana === 2 && <DesignTab event={event} onGuardado={setEvent} />}
      {pestana === 3 && superAdmin && <TeamTab event={event} />}
    </Box>
  );
}
