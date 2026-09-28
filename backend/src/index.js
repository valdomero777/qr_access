require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Sin estas variables el servidor arranca pero todos los logins fallan con un 500
// opaco, así que preferimos no arrancar y decir qué falta.
const requiredEnv = ['DATABASE_URL', 'JWT_SECRET'];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);

if (missingEnv.length > 0) {
  console.error(`Faltan variables de entorno (backend/.env o panel de Vercel): ${missingEnv.join(', ')}`);
  process.exit(1);
}

const app = express();

// En producción sólo se aceptan peticiones del frontend desplegado. CORS_ORIGIN
// admite varios orígenes separados por comas; sin ella (desarrollo) se acepta
// cualquiera, como antes.
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// Middlewares globales
app.use(cors(allowedOrigins.length > 0 ? { origin: allowedOrigins } : undefined));
// El diseño de la invitación puede llevar un logo embebido como data URI, que no
// cabe en el límite de 100 kB que Express trae por defecto.
app.use(express.json({ limit: '2mb' }));

// --- 1. IMPORTAR LAS RUTAS DE ADMIN (AÑADE ESTA LÍNEA) ---
const adminRoutes = require('./routes/admin'); 

const staffRoutes = require('./routes/staff');
const scanRoutes = require('./routes/scan');

// --- 2. REGISTRAR EL ENDPOINT DE ADMIN (AÑADE ESTA LÍNEA) ---
app.use('/api/admin', adminRoutes);

app.use('/api/staff', staffRoutes);
app.use('/api/scan', scanRoutes);

// Ruta de prueba básica
app.get('/', (req, res) => {
  res.send('API del Sistema de Accesos QR funcionando 🚀');
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});