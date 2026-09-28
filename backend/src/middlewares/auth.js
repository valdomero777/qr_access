const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  // Validamos que exista el header y que empiece con "Bearer "
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // El `code` permite al cliente distinguir "tu sesión no sirve" de cualquier
    // otro 401/403, y no cerrar sesión por, digamos, una contraseña mal tecleada.
    return res.status(403).json({ error: 'Formato de token inválido o no proporcionado', code: 'no_token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Esto contiene { adminId, role } del login
    next(); // ¡Importante! No uses "return next()", solo next()
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado', code: 'invalid_token' });
  }
};

module.exports = verifyToken;