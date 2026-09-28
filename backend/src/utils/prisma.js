const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

// 1. Leemos la URL de tu archivo .env
const connectionString = process.env.DATABASE_URL;

// 2. Creamos un "Pool" de conexiones de Postgres
//    En Vercel cada instancia de la función abre su propio pool, así que se
//    limita a pocas conexiones para no agotar las de Neon cuando escala.
const pool = new Pool({ connectionString, max: process.env.VERCEL ? 3 : 10 });

// 3. Creamos el adaptador de Prisma
const adapter = new PrismaPg(pool);

// 4. Inicializamos el cliente pasándole el adaptador
const prisma = new PrismaClient({ adapter });

module.exports = prisma;