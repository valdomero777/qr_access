import { useState, useEffect } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate, Link as RouterLink,
  useNavigate, useLocation
} from 'react-router-dom';
import {
  ThemeProvider, createTheme, CssBaseline, AppBar, Toolbar, Button, Typography,
  Box, GlobalStyles, IconButton, Menu, MenuItem, Divider, ListItemIcon, Snackbar, Alert
} from '@mui/material';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import PersonIcon from '@mui/icons-material/Person';
import LogoutIcon from '@mui/icons-material/Logout';

// Importación de Páginas
import LoginStaff from './pages/staff/LoginStaff';
import ScannerView from './pages/staff/ScannerView';
import Dashboard from './pages/admin/Dashboard';
import EventPanel from './pages/admin/EventPanel';
import LoginAdmin from './pages/admin/LoginAdmin';
import CreateEvent from './pages/admin/CreateEvent';
import Profile from './pages/admin/Profile';
import Admins from './pages/admin/Admins';

import {
  SESION_EXPIRADA, sesionAdmin, sesionStaff, esSuperAdmin,
  cerrarSesionAdmin, cerrarSesionStaff
} from './utils/session';

// 1. Crear un Tema Personalizado (Colores profesionales)
const theme = createTheme({
  palette: {
    primary: {
      main: '#1f2937', // Un azul/gris oscuro elegante
    },
    secondary: {
      main: '#10b981', // Verde esmeralda para acciones de éxito
    },
    background: {
      default: '#f3f4f6', // Gris muy claro para el fondo de la app
    }
  },
});

// Sin sesión válida no se monta la pantalla: se redirige al login recordando a
// dónde iba, para volver ahí después de entrar.
function RequireAdmin({ children }) {
  const location = useLocation();

  if (!sesionAdmin()) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

// El backend rechaza igualmente estas rutas; la guarda evita enseñar una pantalla
// que no va a poder cargar nada.
function RequireSuperAdmin({ children }) {
  if (!esSuperAdmin()) return <Navigate to="/admin/dashboard" replace />;
  return children;
}

function RequireStaff({ children }) {
  if (!sesionStaff()) {
    return <Navigate to="/staff/login" replace />;
  }
  return children;
}

// Escucha el aviso que emite la capa de red cuando el backend rechaza el token,
// limpia la sesión y devuelve al login que corresponda.
function VigilanteDeSesion() {
  const navigate = useNavigate();
  const [expirada, setExpirada] = useState(false);

  useEffect(() => {
    const alExpirar = (evento) => {
      const ambito = evento.detail?.ambito;
      const clave = ambito === 'staff' ? 'staffToken' : 'adminToken';

      // Puede haber varias peticiones en vuelo fallando a la vez —en desarrollo,
      // StrictMode ya monta cada pantalla dos veces—. La primera limpia la sesión;
      // las siguientes llegarían con la ruta ya cambiada y pisarían el destino.
      if (!localStorage.getItem(clave)) return;

      // Se lee en el momento del aviso, no al montar, para no arrastrar una ruta
      // vieja. Así el login devuelve a donde estabas, igual que hace la guarda.
      const desde = window.location.pathname;

      if (ambito === 'staff') {
        cerrarSesionStaff();
        navigate('/staff/login', { replace: true });
      } else {
        cerrarSesionAdmin();
        navigate('/admin/login', { replace: true, state: { from: desde } });
      }
      setExpirada(true);
    };

    window.addEventListener(SESION_EXPIRADA, alExpirar);
    return () => window.removeEventListener(SESION_EXPIRADA, alExpirar);
  }, [navigate]);

  return (
    <Snackbar
      open={expirada}
      autoHideDuration={6000}
      onClose={() => setExpirada(false)}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert severity="warning" variant="filled" onClose={() => setExpirada(false)}>
        Tu sesión caducó. Vuelve a iniciarla.
      </Alert>
    </Snackbar>
  );
}

// 2. Refactorizar el AdminLayout con MUI
function AdminLayout({ children }) {
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);
  const nombre = localStorage.getItem('adminName') || 'Mi cuenta';

  const handleLogout = () => {
    setAnchorEl(null);
    cerrarSesionAdmin();
    navigate('/admin/login', { replace: true });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static" elevation={1}>
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold' }}>
            QR Access
          </Typography>
          <Button color="inherit" component={RouterLink} to="/admin/dashboard">
            Dashboard
          </Button>
          {esSuperAdmin() && (
            <>
              <Button color="inherit" component={RouterLink} to="/admin/create-event">
                Nuevo Evento
              </Button>
              <Button color="inherit" component={RouterLink} to="/admin/admins">
                Administradores
              </Button>
            </>
          )}

          <IconButton color="inherit" onClick={(e) => setAnchorEl(e.currentTarget)} sx={{ ml: 1 }}>
            <AccountCircleIcon />
          </IconButton>
          <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>{nombre}</Typography>
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                {esSuperAdmin() ? 'Super administrador' : 'Administrador'}
              </Typography>
            </Box>
            <Divider />
            <MenuItem
              component={RouterLink} to="/admin/profile" onClick={() => setAnchorEl(null)}
            >
              <ListItemIcon><PersonIcon fontSize="small" /></ListItemIcon>
              Mi perfil
            </MenuItem>
            <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
              <ListItemIcon><LogoutIcon fontSize="small" color="error" /></ListItemIcon>
              Cerrar sesión
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      {/* Contenedor principal donde se renderizarán las vistas */}
      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2, md: 4 } }}>
        {children}
      </Box>
    </Box>
  );
}

// Envuelve una vista de admin con su guarda y su layout.
const admin = (vista) => (
  <RequireAdmin>
    <AdminLayout>{vista}</AdminLayout>
  </RequireAdmin>
);

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline /> {/* Resetea márgenes y aplica la tipografía de MUI */}
      <GlobalStyles styles={{
        'html, body, #root': {
          height: '100%',
          width: '100%',
          margin: 0,
          padding: 0,
          boxSizing: 'border-box'
        }
      }} />
      {/* Bajo GitHub Pages la app cuelga de /<repo>/, no de la raíz. BASE_URL lo
          rellena Vite en compilación; en local vale '/' y no cambia nada. */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <VigilanteDeSesion />
        <Routes>
          {/* Rutas de Administrador */}
          <Route path="/admin/login" element={<LoginAdmin />} />
          <Route path="/admin/dashboard" element={admin(<Dashboard />)} />
          <Route path="/admin/events/:eventId" element={admin(<EventPanel />)} />
          {/* La gestión de invitados vive ahora dentro del panel de cada evento. */}
          <Route path="/admin/guests" element={<Navigate to="/admin/dashboard" replace />} />
          <Route
            path="/admin/create-event"
            element={admin(<RequireSuperAdmin><CreateEvent /></RequireSuperAdmin>)}
          />
          <Route
            path="/admin/admins"
            element={admin(<RequireSuperAdmin><Admins /></RequireSuperAdmin>)}
          />
          <Route path="/admin/profile" element={admin(<Profile />)} />

          {/* Rutas del Staff */}
          <Route path="/staff/login" element={<LoginStaff />} />
          <Route path="/staff/scan" element={<RequireStaff><ScannerView /></RequireStaff>} />

          {/* Cualquier otra ruta pasa por el dashboard, que a su vez exige sesión */}
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
