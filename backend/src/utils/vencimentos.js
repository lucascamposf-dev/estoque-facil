const prisma = require('../prismaClient');
const { inicioDoDiaBrasil } = require('./data');

// Desativa toda empresa ativa cujo dataVencimento já passou (comparado com
// "hoje" em Brasília). Empresas sem dataVencimento definida nunca são
// afetadas - vencimento automático só vale pra quem tem data marcada.
async function desativarEmpresasVencidas() {
  const hoje = inicioDoDiaBrasil();

  const vencidas = await prisma.empresa.findMany({
    where: { ativo: true, dataVencimento: { lt: hoje } },
    select: { id: true, nome: true, dataVencimento: true },
  });

  if (vencidas.length > 0) {
    await prisma.empresa.updateMany({
      where: { id: { in: vencidas.map((e) => e.id) } },
      data: { ativo: false },
    });
  }

  return { verificadoEm: new Date().toISOString(), desativadas: vencidas };
}

module.exports = { desativarEmpresasVencidas };
