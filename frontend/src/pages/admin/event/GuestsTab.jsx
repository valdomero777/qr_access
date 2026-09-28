import { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, Dialog, DialogContent,
  DialogActions, IconButton, Menu, MenuItem, DialogTitle,
  Alert, CircularProgress, DialogContentText, Tooltip, Stack
} from '@mui/material';
import {
  MoreVert as MoreVertIcon, Edit as EditIcon, Delete as DeleteIcon,
  Block as BlockIcon, PersonAdd as PersonAddIcon, QrCode as QrCodeIcon,
  Download as DownloadIcon, Send as SendIcon
} from '@mui/icons-material';
import {
  getGuests, createGuest, updateGuest, revokeGuest, deleteGuest,
  sendGuestQr, sendEventQrs, getMailStatus
} from '../../../services/api';
import { sesionAdmin } from '../../../utils/session';
import { buildTicketPng, leerDiseno } from '../../../utils/design';
import TicketCard from '../../../components/TicketCard';
import { eventDetail } from '../../../utils/eventFormat';

// Quita acentos y deja sólo caracteres seguros para un nombre de archivo.
const slug = (text) =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();

export default function GuestsTab({ event }) {
  const token = sesionAdmin()?.token;
  const diseno = leerDiseno(event);

  // null = todavía cargando los invitados.
  const [guests, setGuests] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [newGuest, setNewGuest] = useState({ name: '', email: '', department: '', party_size: 1, companions: [] });
  const [saving, setSaving] = useState(false);

  const [anchorEl, setAnchorEl] = useState(null);
  const [activeGuest, setActiveGuest] = useState(null);
  const [openDelete, setOpenDelete] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [openQr, setOpenQr] = useState(false);
  const [editData, setEditData] = useState({ name: '', email: '', department: '', party_size: 1, companions: [] });
  const [sending, setSending] = useState(false);
  // null mientras se consulta. Si el backend no tiene SMTP configurado, toda la
  // parte de envío desaparece: un botón que sólo puede fallar no ayuda a nadie.
  const [correoActivo, setCorreoActivo] = useState(false);
  const qrRef = useRef(null); // canvas que dibuja qrcode.react, base del PNG descargable

  // Sin correo no hay nada que enviar, así que no cuentan como pendientes.
  const pendientesDeEnvio = (guests ?? [])
    .filter(g => g.email && !g.qr_sent_at && g.status !== 'revoked').length;
  const sinCorreo = (guests ?? []).filter(g => !g.email).length;

  useEffect(() => {
    let vigente = true;

    getMailStatus(token)
      .then(r => { if (vigente) setCorreoActivo(Boolean(r.configurado)); })
      .catch(() => { /* ante la duda, se queda oculto */ });

    return () => { vigente = false; };
  }, [token]);

  useEffect(() => {
    let vigente = true;

    getGuests(event.id, token)
      .then(data => { if (vigente) setGuests(data); })
      .catch(err => { if (vigente) { setError(err.message); setGuests([]); } });

    return () => { vigente = false; };
  }, [event.id, token]);

  const handleOpenMenu = (e, guest) => {
    setAnchorEl(e.currentTarget);
    setActiveGuest(guest);
  };

  const handleAddGuest = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const guest = await createGuest({ ...newGuest, event_id: event.id }, token);
      setGuests([...(guests ?? []), guest]);
      setNewGuest({ name: '', email: '', department: '', party_size: 1, companions: [] });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    setError(null);
    try {
      const updated = await updateGuest(activeGuest.id, editData, token);
      setGuests(guests.map(g => (g.id === updated.id ? updated : g)));
      setOpenEdit(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevoke = async (guest) => {
    setError(null);
    try {
      const updated = await revokeGuest(guest.id, token);
      setGuests(guests.map(g => (g.id === updated.id ? updated : g)));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    setError(null);
    try {
      await deleteGuest(activeGuest.id, token);
      setGuests(guests.filter(g => g.id !== activeGuest.id));
      setOpenDelete(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDownload = async () => {
    if (!qrRef.current || !activeGuest) return;
    setError(null);
    try {
      const dataUrl = await buildTicketPng(qrRef.current, {
        eventName: event.name,
        guest: activeGuest,
        detalle: eventDetail(event, diseno.mostrar),
        diseno,
      });
      const link = document.createElement('a');
      link.download = `acceso-${slug(activeGuest.name)}-${slug(event.name)}.png`;
      link.href = dataUrl;
      link.click();
    } catch {
      setError('No se pudo generar la imagen del acceso.');
    }
  };

  const handleSendOne = async () => {
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await sendGuestQr(activeGuest.id, token);
      setGuests(guests.map(g => (g.id === updated.id ? updated : g)));
      setActiveGuest(updated);
      setNotice(`Acceso enviado a ${updated.email}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const handleSendAll = async () => {
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await sendEventQrs(event.id, token);
      setGuests(await getGuests(event.id, token));

      // A quien no tiene correo no se le puede enviar: decirlo, no omitirlo.
      const nota = result.sinCorreo
        ? ` ${result.sinCorreo} invitado(s) no tienen correo: descarga su acceso y hazlo llegar por otra vía.`
        : '';

      if (result.total === 0) {
        setNotice(`No quedaba nadie a quien enviar.${nota}`);
      } else if (result.fallidos.length === 0) {
        setNotice(`Acceso enviado a ${result.enviados} invitado(s).${nota}`);
      } else {
        setNotice(`Enviados ${result.enviados} de ${result.total}.${nota}`);
        setError(`No se pudo enviar a: ${result.fallidos.map(f => f.email).join(', ')}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>
      )}
      {notice && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setNotice(null)}>{notice}</Alert>
      )}

      <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
        <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>Inscribir asistente</Typography>
        <Box component="form" onSubmit={handleAddGuest}>
          <CamposDeInvitado datos={newGuest} onChange={setNewGuest} />
          <Button
            type="submit" variant="contained" color="secondary"
            startIcon={<PersonAddIcon />} disabled={saving} sx={{ mt: 2 }}
          >
            {saving ? 'Registrando…' : 'Registrar'}
          </Button>
        </Box>
      </Paper>

      {correoActivo && guests?.length > 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            {pendientesDeEnvio > 0
              ? `${pendientesDeEnvio} invitado(s) todavía no han recibido su acceso.`
              : 'Todos los que tienen correo han recibido su acceso.'}
            {sinCorreo > 0 && ` ${sinCorreo} sin correo: descarga su acceso desde el menú.`}
          </Typography>
          <Button
            variant="outlined" size="small"
            startIcon={sending ? <CircularProgress size={16} /> : <SendIcon />}
            onClick={handleSendAll} disabled={sending || pendientesDeEnvio === 0}
          >
            Enviar a los pendientes
          </Button>
        </Box>
      )}

      <TableContainer component={Paper} elevation={2} sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Nombre</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Correo</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Departamento</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }} align="center">Personas</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Estado</TableCell>
              {correoActivo && <TableCell sx={{ fontWeight: 'bold' }}>Entrega del QR</TableCell>}
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {guests === null ? (
              <TableRow><TableCell colSpan={correoActivo ? 7 : 6} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
            ) : guests.length === 0 ? (
              <TableRow><TableCell colSpan={correoActivo ? 7 : 6} align="center">No hay invitados registrados aún.</TableCell></TableRow>
            ) : (
              guests.map((guest) => (
                <TableRow key={guest.id} hover>
                  <TableCell>
                    {guest.name}
                    {guest.companions?.length > 0 && (
                      <Typography variant="caption" sx={{ display: 'block', color: '#94a3b8' }}>
                        con {guest.companions.join(', ')}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {guest.email || <Typography variant="caption" color="text.disabled">sin correo</Typography>}
                  </TableCell>
                  <TableCell>
                    {guest.department || <Typography variant="caption" color="text.disabled">—</Typography>}
                  </TableCell>
                  <TableCell align="center">{guest.party_size}</TableCell>
                  <TableCell>
                    <Chip
                      label={guest.status === 'checked_in' ? 'Ingresó' : guest.status === 'revoked' ? 'Revocado' : 'Pendiente'}
                      color={guest.status === 'checked_in' ? 'success' : guest.status === 'revoked' ? 'error' : 'warning'}
                      size="small"
                    />
                  </TableCell>
                  {correoActivo && (
                    <TableCell>
                      {guest.qr_sent_at ? (
                        <Tooltip title={new Date(guest.qr_sent_at).toLocaleString()}>
                          <Chip label="Enviado" color="success" variant="outlined" size="small" />
                        </Tooltip>
                      ) : (
                        <Chip label="Sin enviar" size="small" variant="outlined" />
                      )}
                    </TableCell>
                  )}
                  <TableCell align="right">
                    <IconButton onClick={(e) => handleOpenMenu(e, guest)}><MoreVertIcon /></IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        <MenuItem onClick={() => { setOpenQr(true); setAnchorEl(null); }}>
          <QrCodeIcon fontSize="small" sx={{ mr: 1 }} /> Ver acceso QR
        </MenuItem>
        <MenuItem onClick={() => { setEditData(aFormulario(activeGuest)); setOpenEdit(true); setAnchorEl(null); }}>
          <EditIcon fontSize="small" sx={{ mr: 1 }} /> Editar
        </MenuItem>
        <MenuItem onClick={() => { handleRevoke(activeGuest); setAnchorEl(null); }}>
          <BlockIcon fontSize="small" sx={{ mr: 1, color: 'orange' }} /> Revocar
        </MenuItem>
        <MenuItem onClick={() => { setOpenDelete(true); setAnchorEl(null); }} sx={{ color: 'error.main' }}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} /> Eliminar
        </MenuItem>
      </Menu>

      <Dialog open={openQr} onClose={() => setOpenQr(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 'bold' }}>Acceso de {activeGuest?.name}</DialogTitle>
        <DialogContent>
          {activeGuest && (
            <TicketCard event={event} guest={activeGuest} diseno={diseno} qrRef={qrRef} />
          )}
          {activeGuest?.status === 'revoked' && (
            <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
              Este acceso está revocado: el código no dará entrada.
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={() => setOpenQr(false)}>Cerrar</Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button
            onClick={handleDownload} startIcon={<DownloadIcon />}
            variant={correoActivo ? 'text' : 'contained'}
            sx={correoActivo ? undefined : { backgroundColor: '#1f2937', '&:hover': { backgroundColor: '#0f172a' } }}
          >
            Descargar PNG
          </Button>
          {correoActivo && (
            <Button
              onClick={handleSendOne} variant="contained"
              startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
              disabled={sending || activeGuest?.status === 'revoked'}
            >
              {activeGuest?.qr_sent_at ? 'Reenviar por correo' : 'Enviar por correo'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={openEdit} onClose={() => setOpenEdit(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 'bold' }}>Editar invitado</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <CamposDeInvitado datos={editData} onChange={setEditData} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenEdit(false)}>Cancelar</Button>
          <Button onClick={handleEdit} variant="contained">Guardar cambios</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openDelete} onClose={() => setOpenDelete(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 'bold' }}>Eliminar invitado</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Se eliminará a <strong>{activeGuest?.name}</strong> y su código QR dejará de funcionar.
            Esta acción no se puede deshacer.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenDelete(false)}>Cancelar</Button>
          <Button onClick={handleDelete} variant="contained" color="error">Eliminar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// Los mismos campos en el alta y en la edición, para que no se desincronicen.
// Sólo el nombre es obligatorio: del resto puede no saberse nada todavía.
function CamposDeInvitado({ datos, onChange }) {
  const cambiar = (campo) => (e) => onChange({ ...datos, [campo]: e.target.value });

  // El número de invitados manda: los acompañantes son party_size - 1 huecos.
  const cambiarTamano = (e) => {
    const party_size = Math.max(1, Math.min(50, Number(e.target.value) || 1));
    onChange({ ...datos, party_size, companions: datos.companions.slice(0, party_size - 1) });
  };

  const cambiarAcompanante = (i) => (e) => {
    const companions = [...datos.companions];
    companions[i] = e.target.value;
    onChange({ ...datos, companions });
  };

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          size="small" label="Nombre completo" required sx={{ flexGrow: 1 }}
          value={datos.name} onChange={cambiar('name')}
        />
        <TextField
          size="small" label="Correo electrónico" type="email" sx={{ flexGrow: 1 }}
          value={datos.email || ''} onChange={cambiar('email')}
          helperText="Opcional. Sin correo no se le puede enviar el acceso."
        />
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          size="small" label="Departamento" sx={{ flexGrow: 1 }}
          value={datos.department || ''} onChange={cambiar('department')}
          helperText="Opcional."
        />
        <TextField
          size="small" label="Personas en la invitación" type="number" sx={{ width: { sm: 220 } }}
          value={datos.party_size} onChange={cambiarTamano}
          inputProps={{ min: 1, max: 50 }}
          helperText="Titular incluido."
        />
      </Stack>

      {datos.party_size > 1 && (
        <Box>
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            Acompañantes
          </Typography>
          <Stack spacing={1.5}>
            {Array.from({ length: datos.party_size - 1 }).map((_, i) => (
              <TextField
                key={i} size="small" label={`Acompañante ${i + 1}`} fullWidth
                value={datos.companions[i] || ''} onChange={cambiarAcompanante(i)}
              />
            ))}
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Puedes dejar en blanco los que aún no conozcas.
          </Typography>
        </Box>
      )}
    </Stack>
  );
}

// Un invitado de la API, en la forma que espera el formulario.
function aFormulario(guest) {
  return {
    name: guest.name || '',
    email: guest.email || '',
    department: guest.department || '',
    party_size: guest.party_size || 1,
    companions: guest.companions || [],
  };
}
