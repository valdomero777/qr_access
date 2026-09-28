import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Alert, Chip, Stack, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  IconButton, CircularProgress, MenuItem, Dialog, DialogTitle, DialogContent,
  DialogContentText, DialogActions, Tooltip
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { getAdmins, createAdmin, deleteAdmin } from '../../services/api';
import { sesionAdmin } from '../../utils/session';

const ROLES = [
  { valor: 'admin', etiqueta: 'Administrador', ayuda: 'Sólo ve los eventos que le asignes.' },
  { valor: 'super_admin', etiqueta: 'Super administrador', ayuda: 'Ve todos los eventos y puede crear y asignar.' },
];

export default function Admins() {
  const sesion = sesionAdmin();
  const token = sesion?.token;

  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [nuevo, setNuevo] = useState({ full_name: '', email: '', password: '', role: 'admin' });
  const [guardando, setGuardando] = useState(false);
  const [aBorrar, setABorrar] = useState(null);

  const cargar = () => getAdmins(token).then(setAdmins).catch(err => { setError(err.message); setAdmins([]); });

  useEffect(() => {
    cargar();
    // Sólo al montar: el token no cambia mientras la página está abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCrear = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const creado = await createAdmin(nuevo, token);
      setAdmins([...(admins ?? []), { ...creado, _count: { assignments: 0 } }]);
      setNuevo({ full_name: '', email: '', password: '', role: 'admin' });
      setAviso(`${creado.full_name} ya puede iniciar sesión. Asígnale eventos desde la pestaña «Equipo» de cada evento.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleBorrar = async () => {
    setError(null);
    try {
      await deleteAdmin(aBorrar.id, token);
      setAdmins(admins.filter(a => a.id !== aBorrar.id));
      setABorrar(null);
    } catch (err) {
      setError(err.message);
      setABorrar(null);
    }
  };

  return (
    <Box sx={{ maxWidth: 900, margin: '0 auto', mt: 2 }}>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 1, color: '#1e293b' }}>
        Administradores
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
        Un <strong>administrador</strong> sólo ve los eventos que le asignes. Un{' '}
        <strong>super administrador</strong> ve todos y puede crear eventos y gestionar esta lista.
        El personal de puerta no necesita cuenta: entra con el ID del evento y su contraseña.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {aviso && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setAviso(null)}>{aviso}</Alert>}

      <Paper component="form" onSubmit={handleCrear} elevation={2} sx={{ p: 3, mb: 4, borderRadius: 2 }}>
        <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>Nuevo administrador</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <TextField
            size="small" label="Nombre completo" required sx={{ flexGrow: 1 }}
            value={nuevo.full_name} onChange={e => setNuevo({ ...nuevo, full_name: e.target.value })}
          />
          <TextField
            size="small" label="Correo" type="email" required sx={{ flexGrow: 1 }}
            value={nuevo.email} onChange={e => setNuevo({ ...nuevo, email: e.target.value })}
          />
        </Stack>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-start' }}>
          <TextField
            size="small" label="Contraseña inicial" type="password" required sx={{ flexGrow: 1 }}
            value={nuevo.password} onChange={e => setNuevo({ ...nuevo, password: e.target.value })}
            helperText="Mínimo 8 caracteres. Podrá cambiarla desde su perfil."
          />
          <TextField
            select size="small" label="Rol" sx={{ minWidth: 210 }}
            value={nuevo.role} onChange={e => setNuevo({ ...nuevo, role: e.target.value })}
            helperText={ROLES.find(r => r.valor === nuevo.role)?.ayuda}
          >
            {ROLES.map(r => <MenuItem key={r.valor} value={r.valor}>{r.etiqueta}</MenuItem>)}
          </TextField>
          <Button
            type="submit" variant="contained" startIcon={<PersonAddIcon />} disabled={guardando}
            sx={{ backgroundColor: '#1f2937', '&:hover': { backgroundColor: '#0f172a' } }}
          >
            {guardando ? 'Creando…' : 'Crear'}
          </Button>
        </Stack>
      </Paper>

      <TableContainer component={Paper} elevation={2} sx={{ borderRadius: 2 }}>
        <Table>
          <TableHead sx={{ backgroundColor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Nombre</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Correo</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Rol</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Eventos asignados</TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {admins === null ? (
              <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><CircularProgress size={28} /></TableCell></TableRow>
            ) : (
              admins.map(a => {
                const esSuper = a.role === 'super_admin';
                const soyYo = a.id === sesion?.adminId;
                return (
                  <TableRow key={a.id} hover>
                    <TableCell>
                      {a.full_name}{soyYo && <Chip size="small" label="tú" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell>{a.email}</TableCell>
                    <TableCell>
                      <Chip
                        size="small" variant="outlined"
                        color={esSuper ? 'primary' : 'default'}
                        label={esSuper ? 'Super administrador' : 'Administrador'}
                      />
                    </TableCell>
                    <TableCell>
                      {esSuper
                        ? <Typography variant="body2" color="text.secondary">Todos</Typography>
                        : (a._count?.assignments ?? 0)}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={soyYo ? 'No puedes eliminar tu propia cuenta' : 'Eliminar'}>
                        <span>
                          <IconButton color="error" disabled={soyYo} onClick={() => setABorrar(a)}>
                            <DeleteIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Divider sx={{ my: 3 }} />
      <Typography variant="caption" color="text.secondary">
        Eliminar un administrador no borra los eventos que haya creado: sólo retira sus asignaciones.
      </Typography>

      <Dialog open={Boolean(aBorrar)} onClose={() => setABorrar(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ fontWeight: 'bold' }}>Eliminar administrador</DialogTitle>
        <DialogContent>
          <DialogContentText>
            <strong>{aBorrar?.full_name}</strong> perderá el acceso al panel. Los eventos que haya
            creado se conservan.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setABorrar(null)}>Cancelar</Button>
          <Button onClick={handleBorrar} variant="contained" color="error">Eliminar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
