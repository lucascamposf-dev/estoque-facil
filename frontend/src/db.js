import Dexie from 'dexie';

export const db = new Dexie('estoqueFacilDB');

db.version(1).stores({
  produtos: '++id, servidorId, codigoBarras, nome',
  movimentacoes: '++id, idLocal, produtoId, sincronizado, criadoEm',
  clientesFiado: '++id, servidorId, nome',
});

db.version(2).stores({
  produtos: '++id, servidorId, codigoBarras, nome, categoria',
  movimentacoes: '++id, idLocal, produtoId, sincronizado, criadoEm',
  clientesFiado: '++id, servidorId, nome',
});

db.version(3).stores({
  produtos: '++id, servidorId, codigoBarras, nome, categoria',
  movimentacoes: '++id, idLocal, produtoId, sincronizado, criadoEm, tipo',
  clientesFiado: '++id, servidorId, nome',
});

// A Venda Rápida agora grava o carrinho inteiro como uma "venda" só (itens
// dentro do mesmo registro), em vez de um item solto por linha na tabela
// "movimentacoes" - mantém o mesmo padrão de fila offline (sincronizado 0/1/2),
// só que agrupado. RegistrarMovimentacao (entrada/saída avulsa fora do
// carrinho) continua usando "movimentacoes" normalmente.
db.version(4).stores({
  produtos: '++id, servidorId, codigoBarras, nome, categoria',
  movimentacoes: '++id, idLocal, produtoId, sincronizado, criadoEm, tipo',
  clientesFiado: '++id, servidorId, nome',
  vendas: '++id, idLocal, sincronizado, criadoEm',
});

export async function gerarIdLocal() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function contarPendentes() {
  const [movimentacoesPendentes, vendasPendentes] = await Promise.all([
    db.movimentacoes.where('sincronizado').equals(0).count(),
    db.vendas.where('sincronizado').equals(0).count(),
  ]);
  return movimentacoesPendentes + vendasPendentes;
}