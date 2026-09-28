import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { staffLogin } from '../../services/api';
import { Box, Container, Paper, TextField, Button, Typography, Avatar, Alert } from '@mui/material';
import QrCodeScannerIcon from '@mui/icons-material/QrCodeScanner';

export default function LoginStaff() {
  const [eventId, setEventId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const data = await staffLogin(eventId, password);
      localStorage.setItem('staffToken', data.token);
      localStorage.setItem('eventName', data.eventName);
      navigate('/staff/scan');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Box sx={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      backgroundColor: '#0f172a' // Fondo oscuro para evitar distracciones
    }}>
      <Container maxWidth="xs">
        <Paper elevation={0} sx={{ p: 4, borderRadius: 4, textAlign: 'center', backgroundColor: '#ffffff' }}>
          <Avatar sx={{ m: '0 auto', bgcolor: '#10b981', width: 60, height: 60, mb: 2 }}>
            <QrCodeScannerIcon sx={{ fontSize: 35 }} />
          </Avatar>
          <Typography variant="h5" fontWeight="bold" gutterBottom>
            Terminal de Acceso
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Escaneo de personal autorizado
          </Typography>

          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleLogin}>
            <TextField
              fullWidth
              label="ID del Evento"
              variant="filled"
              margin="normal"
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              required
            />
            <TextField
              fullWidth
              label="Contraseña del Evento"
              type="password"
              variant="filled"
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              sx={{ 
                mt: 3, 
                py: 2, 
                borderRadius: 3, 
                fontWeight: 'bold',
                backgroundColor: '#0f172a'
              }}
            >
              ACTIVAR CÁMARA
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}