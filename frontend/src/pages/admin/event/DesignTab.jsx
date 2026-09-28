import { useState, useRef } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Alert, Stack, Divider, CircularProgress,
  FormControlLabel, Switch, FormGroup
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import UploadIcon from '@mui/icons-material/Upload';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { saveEventDesign } from '../../../services/api';
import { sesionAdmin } from '../../../utils/session';
import { DISENO_POR_DEFECTO, CAMPOS, leerDiseno } from '../../../utils/design';
import TicketCard from '../../../components/TicketCard';

const LIMITE_LOGO = 300 * 1024; // el backend rechaza por encima de ~300 kB

// Invitado ficticio para que la vista previa muestre algo realista sin depender
// de que el evento ya tenga gente registrada.
const INVITADO_EJEMPLO = {
  name: 'Nombre del invitado',
  email: 'invitado@ejemplo.com',
  department: 'Departamento',
  party_size: 3,
  companions: ['Acompañante uno', 'Acompañante dos'],
  qr_token: '00000000-0000-0000-0000-000000000000',
};

export default function DesignTab({ event, onGuardado }) {
  const token = sesionAdmin()?.token;

  const [diseno, setDiseno] = useState(() => leerDiseno(event));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const inputArchivo = useRef(null);

  const cambiar = (campo) => (e) => setDiseno({ ...diseno, [campo]: e.target.value });

  const handleLogo = (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError(null);

    if (!archivo.type.startsWith('image/')) {
      setError('El logo debe ser una imagen.');
      return;
    }
    if (archivo.size > LIMITE_LOGO) {
      setError(`El logo pesa ${Math.round(archivo.size / 1024)} kB; el máximo es 300 kB.`);
      return;
    }

    const lector = new FileReader();
    lector.onload = () => setDiseno({ ...diseno, logo: lector.result });
    lector.onerror = () => setError('No se pudo leer el archivo.');
    lector.readAsDataURL(archivo);
  };

  const handleGuardar = async () => {
    setGuardando(true);
    setError(null);
    setAviso(null);
    try {
      const actualizado = await saveEventDesign(event.id, diseno, token);
      onGuardado?.(actualizado);
      setAviso('Diseño guardado. Se aplicará a las descargas y a los correos que se envíen a partir de ahora.');
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 340px' }, gap: 3, alignItems: 'start' }}>
      <Box>
        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>{error}</Alert>}
        {aviso && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setAviso(null)}>{aviso}</Alert>}

        <Paper elevation={2} sx={{ p: 3, borderRadius: 2 }}>
          <Typography variant="h6" fontWeight="bold" sx={{ mb: 0.5 }}>Diseño de la invitación</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Lo que ves a la derecha es lo que recibe el invitado, tanto en el PNG que descargues
            como en el correo.
          </Typography>

          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5 }}>Colores</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <ColorField etiqueta="Acento" valor={diseno.colorAcento} onChange={cambiar('colorAcento')} />
                <ColorField etiqueta="Fondo" valor={diseno.colorFondo} onChange={cambiar('colorFondo')} />
                <ColorField etiqueta="Texto" valor={diseno.colorTexto} onChange={cambiar('colorTexto')} />
              </Stack>
            </Box>

            <Divider />

            <TextField
              label="Mensaje de bienvenida" fullWidth
              value={diseno.mensaje} onChange={cambiar('mensaje')}
              placeholder="Ej. ¡Te esperamos!"
              helperText="Opcional. Aparece bajo el nombre del evento."
              inputProps={{ maxLength: 90 }}
            />

            <Divider />

            <Box>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 0.5 }}>
                Qué datos se muestran
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                Un dato sólo aparece si está activado aquí y además el invitado lo tiene.
                Activar «Departamento» no inventa uno.
              </Typography>
              <FormGroup>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
                  {CAMPOS.map(campo => (
                    <FormControlLabel
                      key={campo.clave}
                      control={
                        <Switch
                          size="small"
                          checked={Boolean(diseno.mostrar?.[campo.clave])}
                          onChange={(e) => setDiseno({
                            ...diseno,
                            mostrar: { ...diseno.mostrar, [campo.clave]: e.target.checked },
                          })}
                        />
                      }
                      label={<Typography variant="body2">{campo.etiqueta}</Typography>}
                    />
                  ))}
                </Box>
              </FormGroup>
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1.5 }}>Logo</Typography>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => inputArchivo.current?.click()}>
                  Subir imagen
                </Button>
                {diseno.logo && (
                  <Button color="error" onClick={() => setDiseno({ ...diseno, logo: null })}>
                    Quitar
                  </Button>
                )}
                <Typography variant="caption" color="text.secondary">
                  PNG o JPG, máximo 300 kB
                </Typography>
              </Stack>
              <input
                ref={inputArchivo} type="file" accept="image/*" hidden onChange={handleLogo}
              />
            </Box>
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Stack direction="row" spacing={1}>
            <Button
              variant="contained" onClick={handleGuardar} disabled={guardando}
              startIcon={guardando ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              sx={{ backgroundColor: '#1f2937', '&:hover': { backgroundColor: '#0f172a' } }}
            >
              {guardando ? 'Guardando…' : 'Guardar diseño'}
            </Button>
            <Button startIcon={<RestartAltIcon />} onClick={() => setDiseno(DISENO_POR_DEFECTO)}>
              Restablecer
            </Button>
          </Stack>
        </Paper>
      </Box>

      <Box sx={{ position: { md: 'sticky' }, top: 16 }}>
        <Typography variant="overline" sx={{ color: '#64748b', letterSpacing: 1.2, fontWeight: 'bold' }}>
          Vista previa
        </Typography>
        <Box sx={{ mt: 1 }}>
          <TicketCard event={event} guest={INVITADO_EJEMPLO} diseno={diseno} />
        </Box>
      </Box>
    </Box>
  );
}

function ColorField({ etiqueta, valor, onChange }) {
  return (
    <TextField
      label={etiqueta} type="color" value={valor} onChange={onChange}
      sx={{ width: { xs: '100%', sm: 120 } }}
      InputLabelProps={{ shrink: true }}
    />
  );
}
