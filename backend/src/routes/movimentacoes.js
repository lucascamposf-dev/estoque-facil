const express = require('express');
const prisma = require('../prismaClient');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

// Custo médio ponderado: cada vez que entra estoque com um custo unitário
// informado, o custo médio do produto é recalculado levando em conta o que
// já tinha em estoque (a preço antigo) e o que está entrando agora (a preço
// novo). Se o produto nunca teve custo médio ou estava zerado, o custo médio
// vira simplesmente o custo dessa entrada.
function calcularNovoCustoMedio(produto, quantidadeEntrada, custoUnitario) {
  const custoAtual = produto.precoCustoMedio !== null && produto.precoCustoMedio !== undefined
    ? Number(produto.precoCustoMedio)
    : null;
  const estoqueAntes = produto.estoqueAtual;
  if (custoAtual === null || estoqueAntes <= 0) {
    return Number(custoUnitario);
  }
  return ((estoqueAntes * custoAtual) + (quantidadeEntrada * Number(custoUnitario))) / (estoqueAntes + quantidadeEntrada);
}

// Listar movimentações recentes (usado na tela de fechamento de caixa)
router.get('/', async (req, res) => {
  try {
    const { data, produtoId, inicio, fim, limite, funcionario } = req.query;
    const where = { empresaId: req.empresaId };

    if (data) {
      const inicioDia = new Date(`${data}T00:00:00`);
      const fimDia = new Date(`${data}T23:59:59`);
      where.criadoEm = { gte: inicioDia, lte: fimDia };
    } else if (inicio || fim) {
      where.criadoEm = {
        ...(inicio ? { gte: new Date(inicio) } : {}),
        ...(fim ? { lte: new Date(`${fim}T23:59:59`) } : {}),
      };
    }

    if (produtoId) where.produtoId = produtoId;
    if (funcionario) where.responsavelNome = funcionario;

    const movimentacoes = await prisma.movimentacao.findMany({
      where,
      include: { produto: true, clienteFiado: true },
      orderBy: { criadoEm: 'desc' },
      take: limite ? Number(limite) : 100,
    });
    res.json(movimentacoes);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar movimentações', detalhe: erro.message });
  }
});

// Registrar uma movimentação (venda, compra, perda, ajuste) e atualizar o estoque
// idLocal: id gerado no celular quando offline, usado pra evitar duplicar ao sincronizar
router.post('/', async (req, res) => {
  const { produtoId, tipo, quantidade, motivo, clienteFiadoId, formaPagamento, idLocal, unidadeVendaId, fornecedorId, custoUnitario } = req.body;

  if (!produtoId || !tipo || !quantidade) {
    return res.status(400).json({ erro: 'produtoId, tipo e quantidade são obrigatórios' });
  }

  if (tipo === 'SAIDA' && !formaPagamento) {
    return res.status(400).json({ erro: 'Informe a forma de pagamento para saídas' });
  }

  try {
    if (idLocal) {
      const existente = await prisma.movimentacao.findUnique({ where: { idLocal } });
      if (existente) return res.status(200).json(existente);
    }

    const resultado = await prisma.$transaction(async (tx) => {
      const produto = await tx.produto.findFirst({ where: { id: produtoId, empresaId: req.empresaId } });
      if (!produto) throw new Error('Produto não encontrado');

      // Se a venda foi feita numa unidade diferente (fardo, caixa), converte pra unidade-base
      // pra debitar o estoque certo, mas guarda o preço e a quantidade originais pra exibição
      let quantidadeBase = quantidade;
      let precoUnitarioUsado = produto.precoVenda;
      if (unidadeVendaId) {
        const unidade = await tx.unidadeVenda.findFirst({ where: { id: unidadeVendaId, produtoId } });
        if (!unidade) throw new Error('Unidade de venda não encontrada');
        quantidadeBase = quantidade * unidade.quantidadeEmUnidades;
        precoUnitarioUsado = unidade.precoVenda;
      }

      // Entrada com custo informado (compra/reposição) recalcula o custo médio
      // ponderado do produto - só faz sentido em ENTRADA, venda não mexe nisso
      const dadosAtualizacaoProduto = {
        estoqueAtual: tipo === 'ENTRADA'
          ? { increment: quantidadeBase }
          : { decrement: quantidadeBase },
      };
      if (tipo === 'ENTRADA' && custoUnitario) {
        dadosAtualizacaoProduto.precoCustoMedio = calcularNovoCustoMedio(produto, quantidadeBase, custoUnitario);
        dadosAtualizacaoProduto.precoCusto = Number(custoUnitario);
      }

      const produtoAtualizado = await tx.produto.update({
        where: { id: produtoId },
        data: dadosAtualizacaoProduto,
      });

      // Não bloqueia a venda por estoque insuficiente (contagem pode estar
      // desatualizada nesse aparelho por causa do offline-first) - só sinaliza
      // pro funcionário que o número ficou negativo, pra alguém conferir depois
      const ficouNegativo = tipo === 'SAIDA' && produtoAtualizado.estoqueAtual < 0;

      const valorVenda = tipo === 'SAIDA'
        ? (unidadeVendaId ? Number(precoUnitarioUsado) * quantidade : Number(precoUnitarioUsado) * quantidadeBase)
        : null;

      if (clienteFiadoId && tipo === 'SAIDA') {
        await tx.clienteFiado.update({
          where: { id: clienteFiadoId },
          data: { saldoDevedor: { increment: valorVenda } },
        });
      }

      const movimentacaoCriada = await tx.movimentacao.create({
        data: {
          empresaId: req.empresaId,
          produtoId,
          tipo,
          quantidade: quantidadeBase,
          motivo,
          clienteFiadoId,
          formaPagamento: tipo === 'SAIDA' ? formaPagamento : undefined,
          idLocal,
          unidadeVendaId: unidadeVendaId || null,
          quantidadeVendida: unidadeVendaId ? quantidade : null,
          valorTotal: valorVenda,
          responsavelNome: req.nomeResponsavel,
          fornecedorId: tipo === 'ENTRADA' ? (fornecedorId || null) : null,
          custoUnitario: tipo === 'ENTRADA' && custoUnitario ? Number(custoUnitario) : null,
        },
      });

      return { ...movimentacaoCriada, estoqueResultante: produtoAtualizado.estoqueAtual, avisoEstoqueNegativo: ficouNegativo };
    });

    res.status(201).json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao registrar movimentação', detalhe: erro.message });
  }
});

// Sincronização em lote: o app manda várias movimentações feitas offline de uma vez
router.post('/sincronizar', async (req, res) => {
  const { movimentacoes } = req.body; // array de movimentações no mesmo formato do POST acima

  if (!Array.isArray(movimentacoes)) {
    return res.status(400).json({ erro: 'Envie um array de movimentações' });
  }

  const resultados = [];
  for (const mov of movimentacoes) {
    try {
      const existente = mov.idLocal
        ? await prisma.movimentacao.findUnique({ where: { idLocal: mov.idLocal } })
        : null;

      if (existente) {
        resultados.push({ idLocal: mov.idLocal, status: 'ja_existia' });
        continue;
      }

      const resultado = await prisma.$transaction(async (tx) => {
        const produto = await tx.produto.findFirst({ where: { id: mov.produtoId, empresaId: req.empresaId } });
        if (!produto) throw new Error('Produto não encontrado');

        // Mesma conversão de fardo/caixa pra unidade-base que o POST / normal já faz -
        // sem isso o estoque ficava errado quando a venda offline usava uma unidade diferente
        let quantidadeBase = mov.quantidade;
        let precoUnitarioUsado = produto.precoVenda;
        if (mov.unidadeVendaId) {
          const unidade = await tx.unidadeVenda.findFirst({
            where: { id: mov.unidadeVendaId, produtoId: mov.produtoId },
          });
          if (unidade) {
            quantidadeBase = mov.quantidade * unidade.quantidadeEmUnidades;
            precoUnitarioUsado = unidade.precoVenda;
          }
        }

        const novoEstoque =
          mov.tipo === 'ENTRADA' ? produto.estoqueAtual + quantidadeBase : produto.estoqueAtual - quantidadeBase;

        // Mesmo recálculo de custo médio ponderado que o POST / normal já faz -
        // sem isso, uma reposição registrada offline nunca atualizava o custo médio
        const dadosAtualizacaoProduto = { estoqueAtual: novoEstoque };
        if (mov.tipo === 'ENTRADA' && mov.custoUnitario) {
          dadosAtualizacaoProduto.precoCustoMedio = calcularNovoCustoMedio(produto, quantidadeBase, mov.custoUnitario);
          dadosAtualizacaoProduto.precoCusto = Number(mov.custoUnitario);
        }

        await tx.produto.update({ where: { id: mov.produtoId }, data: dadosAtualizacaoProduto });

        // Mesmo incremento de dívida do fiado que o POST / normal já faz -
        // sem isso, vendas fiado feitas offline nunca viravam dívida do cliente
        if (mov.clienteFiadoId && mov.tipo === 'SAIDA') {
          const valorVenda = mov.unidadeVendaId
            ? Number(precoUnitarioUsado) * mov.quantidade
            : Number(precoUnitarioUsado) * quantidadeBase;
          await tx.clienteFiado.update({
            where: { id: mov.clienteFiadoId },
            data: { saldoDevedor: { increment: valorVenda } },
          });
        }

        return tx.movimentacao.create({
          data: {
            empresaId: req.empresaId,
            produtoId: mov.produtoId,
            tipo: mov.tipo,
            quantidade: quantidadeBase,
            motivo: mov.motivo,
            clienteFiadoId: mov.clienteFiadoId || null,
            formaPagamento: mov.tipo === 'SAIDA' ? mov.formaPagamento : undefined,
            idLocal: mov.idLocal,
            unidadeVendaId: mov.unidadeVendaId || null,
            quantidadeVendida: mov.unidadeVendaId ? mov.quantidade : null,
            responsavelNome: req.nomeResponsavel,
            fornecedorId: mov.tipo === 'ENTRADA' ? (mov.fornecedorId || null) : null,
            custoUnitario: mov.tipo === 'ENTRADA' && mov.custoUnitario ? Number(mov.custoUnitario) : null,
          },
        });
      });

      resultados.push({ idLocal: mov.idLocal, status: 'sincronizado', id: resultado.id });
    } catch (erro) {
      resultados.push({ idLocal: mov.idLocal, status: 'erro', detalhe: erro.message });
    }
  }

  res.json({ resultados });
});

// Resumo de formas de pagamento no período (usado no dashboard do caixa)
router.get('/resumo-pagamento', async (req, res) => {
  try {
    const { inicio, fim } = req.query; // datas ISO, ex: 2026-07-01, 2026-07-31

    const filtroData = {};
    if (inicio) filtroData.gte = new Date(inicio);
    if (fim) filtroData.lte = new Date(fim + 'T23:59:59');

    const movimentacoes = await prisma.movimentacao.findMany({
      where: {
        empresaId: req.empresaId,
        tipo: 'SAIDA',
        formaPagamento: { not: null },
        ...(inicio || fim ? { criadoEm: filtroData } : {}),
      },
      include: { produto: true },
    });

    const resumo = {};
    for (const mov of movimentacoes) {
      const forma = mov.formaPagamento;
      const valor = Number(mov.valorTotal ?? (mov.produto?.precoVenda || 0) * mov.quantidade);
      if (!resumo[forma]) resumo[forma] = { total: 0, quantidade: 0 };
      resumo[forma].total += valor;
      resumo[forma].quantidade += 1;
    }

    const formaLider = Object.entries(resumo).sort((a, b) => b[1].total - a[1].total)[0];

    res.json({
      porForma: resumo,
      formaLider: formaLider ? { forma: formaLider[0], total: formaLider[1].total } : null,
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao calcular resumo', detalhe: erro.message });
  }
});


module.exports = router;
