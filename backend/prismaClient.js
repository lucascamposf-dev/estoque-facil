const { PrismaClient } = require('@prisma/client');

// Uma única instância do Prisma reutilizada em toda a aplicação
const prisma = new PrismaClient();

module.exports = prisma;
