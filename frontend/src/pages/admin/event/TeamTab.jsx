import { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, Alert, Chip, Stack, List, ListItem,
  ListItemText, IconButton, CircularProgress, TextField, MenuItem, Divider
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { getAdmins, getEventAdmins, assignAdmin, unassignAdmin } from '../../../services/api';
import { sesionAdmin } from '../../../utils/session';

// Quién gestiona este evento. Sólo la ve el super admin: es quien asigna.
export default function TeamTab({ event }) {
  const token = sesionAdmin()?.token;

  const [asignados, setAsignados] = useState(null);
  const [todos, setTodos] = useState([]);
  const [elegido, setElegido] = useState('');
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  // Devuelve las dos listas sin tocar el estado, para poder usarla tanto desde el
  // efecto de carga como después de asignar o retirar.
  const traer = () =>
    Promise.all([getEventAdmins(event.id, token), getAdmins(token)]);

  const recargar = async () => {
    const [lista, catalogo] = await traer();
    setAsignados(lista);
    setTodos(catalogo);
  };

  useEffect(() => {
    let vigente = true;

    traer()
      .then(([lista, catalogo]) => {
        if (!vigente) return;
        setAsignados(lista);
        setTodos(catalogo);
      })
      .catch(err => { if (vigente) { setError(err.message); setAsignados([]); } });

    return () => { vigente = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, token]);

  // Un super admin ya ve todos los eventos por su rol, así que no se ofrece.
  const disponibles = todos.filter(
    a => a.role !== 'super_admin' && !(asignados ?? []).some(x => x.id === a.id)
  );

  const handleAsignar = async () => {
    if (!elegido) return;
    setOcupado(true);
    setError(null);
    try {
      await assignAdmin(event.id, elegido, token);
      setElegido('');
      await recargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  const handleRetirar = async (adminId) => {
    setError(null);
    try {
      await unassignAdmin(event.id, adminId, token);
      await recargar();
    } catch (err) {
      setError(err.message);
    }
  };

  if (asignados === null) return <Box sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Box>;

  return (
    <Box sx={{ maxWidth: 720 }}>
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h6" fontWeight="bold" sx={{ mb: 0.5 }}>Quién gestiona este evento</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Los administradores asignados verán este evento en su panel y podrán gestionar sus
          invitados, métricas e invitación. Los super administradores ven todos los eventos sin
          necesidad de asignación.
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
          <TextField
            select size="small" label="Añadir administrador" sx={{ flexGrow: 1 }}
            value={elegido} onChange={e => setElegido(e.target.value)}
            disabled={disponibles.length === 0}
            helperText={
              disponibles.length === 0
                ? 'No queda ningún administrador por asignar.'
                : ' '
            }
          >
            {disponibles.map(a => (
              <MenuItem key={a.id} value={a.id}>{a.full_name} — {a.email}</MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained" startIcon={<PersonAddIcon />}
            onClick={handleAsignar} disabled={!elegido || ocupado}
            sx={{ backgroundColor: '#1f2937', '&:hover': { backgroundColor: '#0f172a' }, alignSelf: 'flex-start' }}
          >
            Asignar
          </Button>
        </Stack>

        <Divider sx={{ mb: 1 }} />

        {asignados.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            Nadie asignado todavía. Sólo los super administradores pueden ver este evento.
          </Typography>
        ) : (
          <List dense>
            {asignados.map(a => (
              <ListItem
                key={a.id}
                secondaryAction={
                  a.role === 'super_admin' ? null : (
                    <IconButton edge="end" color="error" onClick={() => handleRetirar(a.id)}>
                      <DeleteIcon />
                    </IconButton>
                  )
                }
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {a.full_name}
                      {a.role === 'super_admin' && (
                        <Chip size="small" variant="outlined" color="primary" label="Super administrador" />
                      )}
                    </Box>
                  }
                  secondary={a.email}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        ¿Falta alguien en la lista? Créalo primero en{' '}
        <RouterLink to="/admin/admins">Administradores</RouterLink>.
      </Typography>
    </Box>
  );
}
