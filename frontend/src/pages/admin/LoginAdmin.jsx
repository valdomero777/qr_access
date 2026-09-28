import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { adminLogin } from '../../services/api';
import { sesionAdmin } from '../../utils/session';
import { Box, Typography, TextField, Button, Alert, Grid, Paper } from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';

export default function LoginAdmin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // A dónde iba el usuario antes de que la guarda lo mandara aquí.
  const destino = location.state?.from || '/admin/dashboard';

  // Con sesión válida esta pantalla no tiene sentido: lo devolvemos a la app.
  if (sesionAdmin()) return <Navigate to={destino} replace />;

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const data = await adminLogin(email, password);
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminName', data.adminName);
      localStorage.setItem('adminId', data.adminId);
      // El rol también viaja dentro del JWT; esto es sólo para pintar la interfaz.
      localStorage.setItem('adminRole', data.role);
      navigate(destino, { replace: true });
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    // Grid contenedor que ocupa el 100vw y 100vh sin márgenes ni líneas externas
    <Grid container component="main" sx={{ height: '100vh', m: 0, p: 0 }}>
      
      {/* LADO IZQUIERDO: Branding y Contexto (Oculto en móviles muy pequeños) */}
      <Grid 
        item 
        xs={false} 
        sm={4} 
        md={6} 
        sx={{
          backgroundColor: '#0f172a', // Azul muy oscuro/elegante
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          color: 'white',
          px: 4
        }}
      >
        <QrCodeScannerIcon sx={{ fontSize: 80, color: '#10b981', mb: 3 }} />
        <Typography variant="h3" fontWeight="bold" gutterBottom textAlign="center">
          QR Access
        </Typography>
        <Typography variant="subtitle1" sx={{ color: '#94a3b8', textAlign: 'center', maxWidth: '400px' }}>
          Plataforma centralizada para la gestión, emisión y validación de accesos en tiempo real.
        </Typography>
      </Grid>

      {/* LADO DERECHO: Formulario Limpio */}
      <Grid 
        item 
        xs={12} 
        sm={8} 
        md={6} 
        component={Paper} 
        elevation={0} // Cero sombra, lienzo completamente plano
        square // Sin bordes redondeados en las esquinas que conectan
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          backgroundColor: '#ffffff'
        }}
      >
        <Box 
          sx={{ 
            my: 8, 
            mx: 4, 
            display: 'flex', 
            flexDirection: 'column', 
            width: '100%',
            maxWidth: '400px' // Limita el ancho del formulario para que no se estire
          }}
        >
          <Typography component="h1" variant="h4" fontWeight="bold" sx={{ color: '#1e293b', mb: 1 }}>
            Bienvenido de nuevo
          </Typography>
          <Typography variant="body1" sx={{ color: '#64748b', mb: 4 }}>
            Ingresa tus credenciales de organizador para continuar.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: '8px' }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleLogin} sx={{ mt: 1 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Correo electrónico"
              name="email"
              autoComplete="email"
              autoFocus
              variant="outlined"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              // Estilización moderna de los inputs (bordes sutiles)
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  borderRadius: '8px',
                  '& fieldset': { borderColor: '#cbd5e1' },
                  '&:hover fieldset': { borderColor: '#94a3b8' },
                  '&.Mui-focused fieldset': { borderColor: '#0f172a' },
                },
                '& .MuiInputLabel-root.Mui-focused': { color: '#0f172a' }
              }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Contraseña"
              type="password"
              id="password"
              autoComplete="current-password"
              variant="outlined"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              sx={{
                mb: 4,
                '& .MuiOutlinedInput-root': {
                  borderRadius: '8px',
                  '& fieldset': { borderColor: '#cbd5e1' },
                  '&:hover fieldset': { borderColor: '#94a3b8' },
                  '&.Mui-focused fieldset': { borderColor: '#0f172a' },
                },
                '& .MuiInputLabel-root.Mui-focused': { color: '#0f172a' }
              }}
            />
            
            <Button
              type="submit"
              fullWidth
              variant="contained"
              disableElevation // Quita la sombra por defecto del botón para un look más "flat"
              sx={{
                py: 1.5,
                backgroundColor: '#0f172a',
                color: 'white',
                fontWeight: 'bold',
                borderRadius: '8px',
                textTransform: 'none', // Evita que el texto esté todo en mayúsculas (se ve más moderno)
                fontSize: '1rem',
                '&:hover': {
                  backgroundColor: '#1e293b',
                },
              }}
            >
              Iniciar Sesión
            </Button>
          </Box>
        </Box>
      </Grid>
    </Grid>
  );
}