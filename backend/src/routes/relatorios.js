const express = require('express');
const prisma = require('../prismaClient');
const { autenticar } = require('../middleware/auth');
const { inicioDoDiaBrasil } = require('../utils/data');

const router = express.Router();
router.use(autenticar);

// Resumo do dia: total vendido, quantidade de vendas, produtos mais vendidos hoje,
// e produtos com estoque baixo (sempre visível, independente de permissão de caixa)
router.get('/resumo-dia', async (req, res) => {
  try {
    const inicioDoDia = inicioDoDiaBrasil();

    const podeVerValores = req.papel === 'ADMIN' || req.permissoes?.podeVerCaixa;

    const vendasHoje = await prisma.movimentacao.findMany({
      where: {
        empresaId: req.empresaId,
        tipo: 'SAIDA',
        criadoEm: { gte: inicioDoDia },
      },
      include: { produto: { select: { nome: true, precoVenda: true } } },
    });

    let totalVendidoHoje = null;
    let quantidadeVendasHoje = vendasHoje.length;
    let produtosMaisVendidosHoje = [];
    let vendasPorFuncionarioHoje = [];

    if (podeVerValores) {
      totalVendidoHoje = vendasHoje.reduce(
        (soma, v) => soma + Number(v.valorTotal ?? v.quantidade * Number(v.produto.precoVenda)),
        0
      );

      const contagemPorProduto = {};
      for (const v of vendasHoje) {
        const chave = v.produto.nome;
        contagemPorProduto[chave] = (contagemPorProduto[chave] || 0) + v.quantidade;
      }
      produtosMaisVendidosHoje = Object.entries(contagemPorProduto)
        .map(([nome, quantidade]) => ({ nome, quantidade }))
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 3);

      const contagemPorFuncionario = {};
      for (const v of vendasHoje) {
        const nome = v.responsavelNome || 'Não identificado';
        const valor = Number(v.valorTotal ?? v.quantidade * Number(v.produto.precoVenda));
        if (!contagemPorFuncionario[nome]) contagemPorFuncionario[nome] = { total: 0, quantidade: 0 };
        contagemPorFuncionario[nome].total += valor;
        contagemPorFuncionario[nome].quantidade += 1;
      }
      vendasPorFuncionarioHoje = Object.entries(contagemPorFuncionario)
        .map(([nome, dados]) => ({ nome, ...dados }))
        .sort((a, b) => b.total - a.total);
    }

    const produtosEstoqueBaixo = await prisma.produto.findMany({
      where: {
        empresaId: req.empresaId,
        ativo: true,
      },
      select: { id: true, nome: true, estoqueAtual: true, estoqueMinimo: true },
    });
    const abaixoDoMinimo = produtosEstoqueBaixo
      .filter((p) => p.estoqueAtual <= p.estoqueMinimo)
      .sort((a, b) => a.estoqueAtual - b.estoqueAtual)
      .slice(0, 5);

    res.json({
      totalVendidoHoje,
      quantidadeVendasHoje,
      produtosMaisVendidosHoje,
      vendasPorFuncionarioHoje,
      produtosEstoqueBaixo: abaixoDoMinimo,
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao gerar resumo do dia', detalhe: erro.message });
  }
});

// Fechamento de caixa: vendas de hoje quebradas por forma de pagamento + sangrias
router.get('/fechamento-dia', async (req, res) => {
  try {
    const inicioDoDia = inicioDoDiaBrasil();

    const vendasHoje = await prisma.movimentacao.findMany({
      where: { empresaId: req.empresaId, tipo: 'SAIDA', criadoEm: { gte: inicioDoDia } },
      include: { produto: { select: { precoVenda: true } } },
    });

    const porFormaPagamento = { DINHEIRO: 0, PIX: 0, DEBITO: 0, CREDITO: 0, FIADO: 0, SEM_REGISTRO: 0 };
    for (const v of vendasHoje) {
      const chave = v.formaPagamento || 'SEM_REGISTRO';
      const valor = Number(v.valorTotal ?? v.quantidade * Number(v.produto.precoVenda));
      porFormaPagamento[chave] = (porFormaPagamento[chave] || 0) + valor;
    }

    const sangriasHoje = await prisma.sangria.findMany({
      where: { empresaId: req.empresaId, criadoEm: { gte: inicioDoDia } },
    });
    const totalSangrias = sangriasHoje.reduce((soma, s) => soma + Number(s.valor), 0);

    const totalVendido = Object.values(porFormaPagamento).reduce((a, b) => a + b, 0);
    const saldoEsperadoDinheiro = porFormaPagamento.DINHEIRO - totalSangrias;

    res.json({
      porFormaPagamento,
      totalVendido,
      sangrias: sangriasHoje,
      totalSangrias,
      saldoEsperadoDinheiro,
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao gerar fechamento do dia', detalhe: erro.message });
  }
});

// Relatório de validade: produtos vencidos ou vencendo dentro da janela de
// alerta configurada em cada produto (diasAlertaValidade). O campo já existia
// no schema, mas não tinha nenhuma rota que de fato calculasse/agrupasse isso.
router.get('/validade', async (req, res) => {
  try {
    const produtos = await prisma.produto.findMany({
      where: { empresaId: req.empresaId, ativo: true, dataValidade: { not: null } },
      select: { id: true, nome: true, dataValidade: true, diasAlertaValidade: true, estoqueAtual: true },
    });

    // dataValidade é uma data "pura" (sem hora), sempre gravada como meia-noite
    // UTC (é assim que o <input type="date"> do frontend manda). Por isso aqui
    // comparamos direto com o timestamp UTC dela - NÃO reaplicamos o deslocamento
    // de fuso de inicioDoDiaBrasil nela, senão o dia calculado fica errado por
    // causa da subtração de 3h. O deslocamento de fuso só faz sentido pra `hoje`,
    // que precisa saber "que dia é hoje em Brasília" a partir do instante atual.
    const hoje = inicioDoDiaBrasil();

    const comStatus = produtos.map((p) => {
      const validade = new Date(p.dataValidade);
      const diasRestantes = Math.round((validade.getTime() - hoje.getTime()) / 86400000);
      const janela = p.diasAlertaValidade ?? 7;
      let status = 'ok';
      if (diasRestantes < 0) status = 'vencido';
      else if (diasRestantes <= janela) status = 'vencendo';
      return { ...p, diasRestantes, status };
    });

    const vencidos = comStatus.filter((p) => p.status === 'vencido').sort((a, b) => a.diasRestantes - b.diasRestantes);
    const vencendo = comStatus.filter((p) => p.status === 'vencendo').sort((a, b) => a.diasRestantes - b.diasRestantes);

    res.json({ vencidos, vencendo, totalComValidadeCadastrada: produtos.length });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao gerar relatório de validade', detalhe: erro.message });
  }
});

// Giro de estoque / curva ABC: quais produtos concentram a maior parte do
// faturamento (classe A = ~80% do valor vendido, B = próximos ~15%, C = o
// resto) no período informado. Regra de Pareto clássica pra priorizar quais
// produtos merecem mais atenção (nunca deixar faltar) e quais giram pouco.
router.get('/giro-estoque', async (req, res) => {
  try {
    const dias = Math.max(1, Math.min(365, Number(req.query.dias) || 30));
    const desde = new Date(Date.now() - dias * 86400000);

    const vendas = await prisma.movimentacao.findMany({
      where: { empresaId: req.empresaId, tipo: 'SAIDA', criadoEm: { gte: desde } },
      include: { produto: { select: { id: true, nome: true, ativo: true, estoqueAtual: true, precoVenda: true } } },
    });

    const porProduto = {};
    for (const v of vendas) {
      if (!v.produto) continue;
      const chave = v.produto.id;
      const valor = Number(v.valorTotal ?? v.quantidade * Number(v.produto.precoVenda));
      if (!porProduto[chave]) {
        porProduto[chave] = {
          produtoId: chave,
          nome: v.produto.nome,
          ativo: v.produto.ativo,
          estoqueAtual: v.produto.estoqueAtual,
          quantidadeVendida: 0,
          valorVendido: 0,
        };
      }
      porProduto[chave].quantidadeVendida += v.quantidade;
      porProduto[chave].valorVendido += valor;
    }

    const lista = Object.values(porProduto).sort((a, b) => b.valorVendido - a.valorVendido);
    const totalValor = lista.reduce((soma, p) => soma + p.valorVendido, 0);

    let acumulado = 0;
    const comClasse = lista.map((p) => {
      acumulado += p.valorVendido;
      const percentualCumulativo = totalValor > 0 ? (acumulado / totalValor) * 100 : 0;
      let classe = 'C';
      if (percentualCumulativo <= 80) classe = 'A';
      else if (percentualCumulativo <= 95) classe = 'B';
      return { ...p, percentualDoTotal: totalValor > 0 ? (p.valorVendido / totalValor) * 100 : 0, percentualCumulativo, classe };
    });

    // Produtos ativos que não venderam nada no período - úteis pra saber o que
    // está "parado" na prateleira sem girar
    const produtosAtivos = await prisma.produto.findMany({
      where: { empresaId: req.empresaId, ativo: true },
      select: { id: true, nome: true, estoqueAtual: true },
    });
    const idsComVenda = new Set(lista.map((p) => p.produtoId));
    const semGiro = produtosAtivos
      .filter((p) => !idsComVenda.has(p.id) && p.estoqueAtual > 0)
      .map((p) => ({ produtoId: p.id, nome: p.nome, estoqueAtual: p.estoqueAtual }));

    res.json({ dias, produtos: comClasse, semGiro, totalValorVendido: totalValor });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao gerar relatório de giro de estoque', detalhe: erro.message });
  }
});

module.exports = router;