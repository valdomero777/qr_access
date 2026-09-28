const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
require('dotenv').config(); // Cargamos el .env para obtener la URL de Neon

// 1. Configuramos el adaptador igual que en el servidor
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const password = 'Oswaldo2223@'; // La que usarás para loguearte
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);

  console.log('⏳ Creando administrador en Neon...');

  const admin = await prisma.admin.upsert({
    where: { email: 'admin@evento.com' },
    update: {},
    create: {
      full_name: 'Admin Principal',
      email: 'admin@evento.com',
      password_hash: hash,
      // El primero es super admin: es quien crea los eventos y asigna a los demás
      // administradores. Sin al menos uno, el sistema nace bloqueado.
      role: 'super_admin',
    },
  });

  console.log('✅ Administrador creado con éxito:', admin.email);
}

main()
  .catch((e) => {
    console.error('❌ Error en el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });