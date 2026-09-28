import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, TextField, Button, Alert, Divider,
  CircularProgress, Chip, Stack
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import LockResetIcon from '@mui/icons-material/LockReset';
import { getProfile, changePassword } from '../../services/api';
import { sesionAdmin, cerrarSesionAdmin, tiempoRestante } from '../../utils/session';

const formatearFecha = (valor) =>
  new Date(valor).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

export default function Profile() {
  const navigate = useNavigate();
  const sesion = sesionAdmin();

  const [perfil, setPerfil] = useState(null);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const [claves, setClaves] = useState({ actual: '', nueva: '', repetir: '' });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!sesion) return;

    let vigente = true;
    getProfile(sesion.token)
      .then(data => { if (vigente) setPerfil(data); })
      .catch(err => { if (vigente) setError(err.message); });

    return () => { vigente = false; };
    // Sólo al montar: el token no cambia mientras la página está abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    cerrarSesionAdmin();
    navigate('/admin/login', { replace: true });
  };

  const handleCambiarClave = async (e) => {
    e.preventDefault();
    setError(null);
    setAviso(null);

    if (claves.nueva !== claves.repetir) {
      setError('La nueva contraseña y su repetición no coinciden.');
      return;
    }

    setGuardando(true);
    try {
      const r = await changePassword(claves.actual, claves.nueva, sesion.token);
      // El backend devuelve un token nuevo para que esta sesión no se corte.
      if (r.token) localStorage.setItem('adminToken', r.token);
      setClaves({ actual: '', nueva: '', repetir: '' });
      setAviso('Contraseña actualizada. Las sesiones abiertas en otros dispositivos siguen activas hasta que caduquen.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 720, margin: '0 auto', mt: 2 }}>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 4, color: '#1e293b' }}>
        Mi perfil
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {aviso && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setAviso(null)}>
          {aviso}
        </Alert>
      )}

      {/* DATOS DE LA CUENTA */}
      <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
        <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>Cuenta</Typography>

        {!perfil ? (
          <Box sx={{ py: 2, textAlign: 'center' }}><CircularProgress size={26} /></Box>
        ) : (
          <Stack spacing={1.5}>
            <Dato etiqueta="Nombre" valor={perfil.full_name} />
            <Dato etiqueta="Correo" valor={perfil.email} />
            <Dato etiqueta="Alta" valor={formatearFecha(perfil.created_at)} />
            <Dato
              etiqueta="Sesión"
              valor={sesion ? `caduca en ${tiempoRestante(sesion.expiraEn)}` : 'sin sesión'}
            />
          </Stack>
        )}

        <Divider sx={{ my: 3 }} />

        <Button
          variant="outlined" color="error" startIcon={<LogoutIcon />} onClick={handleLogout}
        >
          Cerrar sesión
        </Button>
      </Paper>

      {/* CAMBIO DE CONTRASEÑA */}
      <Paper component="form" onSubmit={handleCambiarClave} elevation={2} sx={{ p: 3, borderRadius: 2 }}>
        <Typography variant="h6" fontWeight="bold" sx={{ mb: 0.5 }}>Cambiar contraseña</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Mínimo 8 caracteres. Se te pide la actual para confirmar que eres tú.
        </Typography>

        <Stack spacing={2}>
          <TextField
            required type="password" label="Contraseña actual" autoComplete="current-password"
            value={claves.actual} onChange={e => setClaves({ ...claves, actual: e.target.value })}
          />
          <TextField
            required type="password" label="Nueva contraseña" autoComplete="new-password"
            value={claves.nueva} onChange={e => setClaves({ ...claves, nueva: e.target.value })}
          />
          <TextField
            required type="password" label="Repetir la nueva" autoComplete="new-password"
            value={claves.repetir} onChange={e => setClaves({ ...claves, repetir: e.target.value })}
            error={claves.repetir.length > 0 && claves.repetir !== claves.nueva}
            helperText={
              claves.repetir.length > 0 && claves.repetir !== claves.nueva ? 'No coincide' : ' '
            }
          />
        </Stack>

        <Button
          type="submit" variant="contained" startIcon={<LockResetIcon />} disabled={guardando}
          sx={{ mt: 2, backgroundColor: '#1f2937', '&:hover': { backgroundColor: '#0f172a' } }}
        >
          {guardando ? 'Guardando…' : 'Actualizar contraseña'}
        </Button>
      </Paper>
    </Box>
  );
}

function Dato({ etiqueta, valor }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
      <Typography variant="body2" color="text.secondary">{etiqueta}</Typography>
      {etiqueta === 'Sesión'
        ? <Chip size="small" label={valor} color="success" variant="outlined" />
        : <Typography variant="body1" fontWeight={500}>{valor}</Typography>}
    </Box>
  );
}
