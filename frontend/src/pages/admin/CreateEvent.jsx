import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createEvent } from '../../services/api';
import { Box, Typography, Paper, TextField, Button, Grid } from '@mui/material';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';

export default function CreateEvent() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '', description: '', start_date: '', end_date: '',
    entry_start: '', entry_end: '', staff_password: '',
    // La ventana de ingreso se evalúa en esta zona, no en la del servidor.
    // Partimos de la del navegador del organizador, que casi siempre es la del evento.
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  });

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('adminToken');
    try {
      await createEvent(formData, token);
      alert('¡Evento creado con éxito!');
      navigate('/admin/dashboard');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, margin: '0 auto', mt: 2 }}>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 4, color: '#1e293b' }}>
        Crear Nuevo Evento
      </Typography>

      <Paper component="form" onSubmit={handleSubmit} elevation={2} sx={{ p: 4, borderRadius: 2 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <TextField fullWidth required label="Nombre del Evento" name="name" onChange={handleChange} placeholder="Ej. Tech Conf 2026" />
          </Grid>
          
          <Grid item xs={12}>
            <TextField fullWidth multiline rows={3} label="Descripción breve" name="description" onChange={handleChange} />
          </Grid>

          {/* Fechas */}
          <Grid item xs={12} sm={6}>
            <TextField fullWidth required type="date" label="Fecha de Inicio" name="start_date" onChange={handleChange} InputLabelProps={{ shrink: true }} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth required type="date" label="Fecha de Fin" name="end_date" onChange={handleChange} InputLabelProps={{ shrink: true }} />
          </Grid>

          {/* Horarios */}
          <Grid item xs={12} sm={6}>
            <TextField fullWidth required type="time" label="Hora Inicio Ingreso" name="entry_start" onChange={handleChange} InputLabelProps={{ shrink: true }} helperText="Si la hora límite es menor que la de inicio, la ventana cruza la medianoche." />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth required type="time" label="Hora Límite Ingreso" name="entry_end" onChange={handleChange} InputLabelProps={{ shrink: true }} />
          </Grid>

          {/* Zona horaria */}
          <Grid item xs={12}>
            <TextField
              fullWidth required label="Zona horaria del evento" name="timezone"
              value={formData.timezone} onChange={handleChange}
              helperText="Detectada de tu navegador. Cámbiala si el evento ocurre en otro huso; el horario de ingreso se evalúa aquí."
            />
          </Grid>

          {/* Contraseña Staff */}
          <Grid item xs={12}>
            <TextField fullWidth required type="text" label="Contraseña para el Staff (Escáner)" name="staff_password" onChange={handleChange} helperText="El personal en puertas necesitará esta contraseña para acceder al escáner de QR." />
          </Grid>

          <Grid item xs={12} sx={{ mt: 2 }}>
            <Button type="submit" variant="contained" size="large" startIcon={<EventAvailableIcon />} sx={{ backgroundColor: '#1f2937', '&:hover': { backgroundColor: '#0f172a' } }}>
              Guardar y Publicar Evento
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}