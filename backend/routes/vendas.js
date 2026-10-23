const express = require('express');
const prisma = require('../prismaClient');
const { autenticar } = require('../middleware/auth');
const { calcularPrecoUnitario } = require('../utils/precificacao');

const router = express.Router();
router.use(autenticar);

// Registra, dentro de uma única transação, a Venda (o "recibo") e uma
// Movimentacao (tipo SAIDA) pra cada item do carrinho, debitando o estoque
// de cada produto. Antes (rota /movimentacoes chamada em loop pelo frontend)
// cada item virava uma chamada HTTP separada, sem nenhum vínculo entre elas:
// se a 3ª de 5 chamadas falhasse, a venda ficava "pela metade" sem
// possibilidade de saber isso depois, e não existia como contar quantas
// vendas (tickets) realmente aconteceram - só quantas linhas de produto.
//
// idLocal: mesmo padrão já usado em Movimentacao, gerado no celular quando
// offline, pra evitar duplicar a venda inteira ao sincronizar.
async function registrarVenda({ empresaId, nomeResponsavel, itens, formaPagamento, clienteFiadoId, idLocal }) {
  if (!Array.isArray(itens) || itens.length === 0) {
    const erro = new Error('Informe ao menos um item');
    erro.status = 400;
    throw erro;
  }
  if (!formaPagamento) {
    const erro = new Error('Informe a forma de pagamento');
    erro.status = 400;
    throw erro;
  }

  if (idLocal) {
    const existente = await prisma.venda.findUnique({ where: { idLocal }, include: { itens: true } });
    if (existente) return { venda: existente, jaExistia: true };
  }

  const produtosComEstoqueNegativo = [];

  const venda = await prisma.$transaction(async (tx) => {
    let valorTotalVenda = 0;
    const itensCriados = [];

    for (const item of itens) {
      const { produtoId, quantidade, unidadeVendaId, ehDose, precoManual } = item;
      if (!produtoId || !quantidade || quantidade <= 0) {
        throw new Error('Cada item precisa de produtoId e quantidade válidos');
      }

      const produto = await tx.produto.findFirst({ where: { id: produtoId, empresaId } });
      if (!produto) throw new Error(`Produto não encontrado (${produtoId})`);

      let quantidadeBase = quantidade;
      let unidade = null;
      if (unidadeVendaId) {
        unidade = await tx.unidadeVenda.findFirst({ where: { id: unidadeVendaId, produtoId } });
        if (!unidade) throw new Error('Unidade de venda não encontrada');
        quantidadeBase = quantidade * unidade.quantidadeEmUnidades;
      }

      const precoUnitario = calcularPrecoUnitario({ produto, unidade, formaPagamento, ehDose, precoManual });
      const valorItem = unidadeVendaId ? precoUnitario * quantidade : precoUnitario * quantidadeBase;
      valorTotalVenda += valorItem;

      // Dose avulsa debita estoqueDoses; o resto debita estoqueAtual - mesma
      // regra usada em /movimentacoes.
      const produtoAtualizado = ehDose
        ? await tx.produto.update({ where: { id: produtoId }, data: { estoqueDoses: { decrement: quantidadeBase } } })
        : await tx.produto.update({ where: { id: produtoId }, data: { estoqueAtual: { decrement: quantidadeBase } } });

      const estoqueResultante = ehDose ? produtoAtualizado.estoqueDoses : produtoAtualizado.estoqueAtual;
      if (estoqueResultante < 0) produtosComEstoqueNegativo.push(produto.nome);

      itensCriados.push({
        produtoId,
        tipo: 'SAIDA',
        quantidade: quantidadeBase,
        motivo: ehDose ? 'venda (dose)' : 'venda',
        clienteFiadoId: clienteFiadoId || null,
        formaPagamento,
        unidadeVendaId: unidadeVendaId || null,
        quantidadeVendida: unidadeVendaId ? quantidade : null,
        valorTotal: valorItem,
        responsavelNome: nomeResponsavel,
        ehDose: !!ehDose,
      });
    }

    if (clienteFiadoId) {
      // Incrementa a dívida do fiado uma única vez com o total da venda, em vez
      // de uma vez por item - equivalente ao resultado anterior, só que agora
      // numa única query em vez de N.
      await tx.clienteFiado.update({
        where: { id: clienteFiadoId },
        data: { saldoDevedor: { increment: valorTotalVenda } },
      });
    }

    return tx.venda.create({
      data: {
        empresaId,
        formaPagamento,
        valorTotal: valorTotalVenda,
        clienteFiadoId: clienteFiadoId || null,
        responsavelNome: nomeResponsavel,
        idLocal: idLocal || null,
        itens: { create: itensCriados },
      },
      include: { itens: true },
    });
  });

  return { venda, jaExistia: false, avisoEstoqueNegativo: produtosComEstoqueNegativo };
}

router.post('/', async (req, res) => {
  try {
    const resultado = await registrarVenda({
      empresaId: req.empresaId,
      nomeResponsavel: req.nomeResponsavel,
      ...req.body,
    });
    res.status(resultado.jaExistia ? 200 : 201).json(resultado);
  } catch (erro) {
    res.status(erro.status || 500).json({ erro: erro.status ? erro.message : 'Erro ao registrar venda', detalhe: erro.message });
  }
});

// Sincronização em lote das vendas feitas offline (mesmo padrão de
// /movimentacoes/sincronizar): o app manda um array de vendas completas
// (cada uma com seus itens), e cada uma é idempotente pelo idLocal.
router.post('/sincronizar', async (req, res) => {
  const { vendas } = req.body;
  if (!Array.isArray(vendas)) {
    return res.status(400).json({ erro: 'Envie um array de vendas' });
  }

  const resultados = [];
  for (const v of vendas) {
    try {
      const resultado = await registrarVenda({
        empresaId: req.empresaId,
        nomeResponsavel: req.nomeResponsavel,
        ...v,
      });
      resultados.push({
        idLocal: v.idLocal,
        status: resultado.jaExistia ? 'ja_existia' : 'sincronizado',
        id: resultado.venda.id,
      });
    } catch (erro) {
      resultados.push({ idLocal: v.idLocal, status: 'erro', detalhe: erro.message });
    }
  }

  res.json({ resultados });
});

// Listagem simples (histórico/depuração) - o fechamento de caixa usa direto
// o Prisma em /relatorios, essa rota é um utilitário à parte.
router.get('/', async (req, res) => {
  try {
    const { data, limite } = req.query;
    const where = { empresaId: req.empresaId };
    if (data) {
      where.criadoEm = { gte: new Date(`${data}T00:00:00`), lte: new Date(`${data}T23:59:59`) };
    }
    const vendas = await prisma.venda.findMany({
      where,
      include: { itens: { include: { produto: { select: { nome: true } } } }, clienteFiado: { select: { nome: true } } },
      orderBy: { criadoEm: 'desc' },
      take: limite ? Number(limite) : 100,
    });
    res.json(vendas);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar vendas', detalhe: erro.message });
  }
});

module.exports = router;
