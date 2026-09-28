const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');

router.post('/login', async (req, res) => {
  const { eventId, staffPassword } = req.body;

  try {
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    
    if (!event) return res.status(404).json({ error: 'Evento no encontrado' });

    // En producción, usa bcrypt para comparar contraseñas encriptadas. 
    // Para simplificar ahora, lo comparamos directo.
    if (event.staff_password !== staffPassword) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // Generamos el token que expira en 12 horas
    const token = jwt.sign(
      { role: 'staff', eventId: event.id }, 
      process.env.JWT_SECRET, 
      { expiresIn: '12h' }
    );

    res.json({ message: 'Login exitoso', token, eventName: event.name });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;