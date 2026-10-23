const express = require('express');
const prisma = require('../prismaClient');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

// Listar inventários da empresa, mais recente primeiro, com contagem de itens
router.get('/', async (req, res) => {
  try {
    const inventarios = await prisma.inventario.findMany({
      where: { empresaId: req.empresaId },
      include: { _count: { select: { itens: true } } },
      orderBy: { criadoEm: 'desc' },
      take: 30,
    });
    res.json(inventarios);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar inventários', detalhe: erro.message });
  }
});

// Impede iniciar um inventário novo se já existir um em andamento - evita
// duas contagens simultâneas pisando uma na outra e confundindo o ajuste final
router.post('/', async (req, res) => {
  try {
    const emAndamento = await prisma.inventario.findFirst({
      where: { empresaId: req.empresaId, status: 'EM_ANDAMENTO' },
    });
    if (emAndamento) {
      return res.status(409).json({ erro: 'Já existe um inventário em andamento. Finalize ou cancele antes de iniciar outro.', inventarioId: emAndamento.id });
    }

    const produtos = await prisma.produto.findMany({
      where: { empresaId: req.empresaId, ativo: true },
      select: { id: true, estoqueAtual: true },
    });

    const inventario = await prisma.inventario.create({
      data: {
        empresaId: req.empresaId,
        responsavelNome: req.nomeResponsavel || null,
        itens: {
          create: produtos.map((p) => ({
            produtoId: p.id,
            estoqueSistema: p.estoqueAtual,
          })),
        },
      },
      include: { _count: { select: { itens: true } } },
    });

    res.status(201).json(inventario);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao iniciar inventário', detalhe: erro.message });
  }
});

// Detalhe de um inventário com todos os itens (produto + contagem)
router.get('/:id', async (req, res) => {
  try {
    const inventario = await prisma.inventario.findFirst({
      where: { id: req.params.id, empresaId: req.empresaId },
      include: {
        itens: {
          include: { produto: { select: { nome: true, fotoUrl: true, categoria: true } } },
          orderBy: { produto: { nome: 'asc' } },
        },
      },
    });
    if (!inventario) return res.status(404).json({ erro: 'Inventário não encontrado' });
    res.json(inventario);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar inventário', detalhe: erro.message });
  }
});

// Registrar a contagem física de um item específico
router.put('/:id/itens/:itemId', async (req, res) => {
  try {
    const { estoqueContado } = req.body;
    if (estoqueContado === undefined || Number(estoqueContado) < 0) {
      return res.status(400).json({ erro: 'Informe a quantidade contada (0 ou mais)' });
    }

    const inventario = await prisma.inventario.findFirst({ where: { id: req.params.id, empresaId: req.empresaId } });
    if (!inventario) return res.status(404).json({ erro: 'Inventário não encontrado' });
    if (inventario.status !== 'EM_ANDAMENTO') {
      return res.status(400).json({ erro: 'Esse inventário já foi finalizado ou cancelado' });
    }

    const item = await prisma.itemInventario.findFirst({ where: { id: req.params.itemId, inventarioId: req.params.id } });
    if (!item) return res.status(404).json({ erro: 'Item não encontrado nesse inventário' });

    const atualizado = await prisma.itemInventario.update({
      where: { id: req.params.itemId },
      data: { estoqueContado: Math.round(Number(estoqueContado)), contadoEm: new Date() },
    });
    res.json(atualizado);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao registrar contagem', detalhe: erro.message });
  }
});

// Finalizar o inventário: pra cada item contado, ajusta o estoque do produto
// pro valor contado e registra uma Movimentacao explicando a diferença -
// assim o ajuste fica rastreável no histórico, não é um "estoque mudou do nada"
router.post('/:id/finalizar', async (req, res) => {
  try {
    const inventario = await prisma.inventario.findFirst({
      where: { id: req.params.id, empresaId: req.empresaId },
      include: { itens: true },
    });
    if (!inventario) return res.status(404).json({ erro: 'Inventário não encontrado' });
    if (inventario.status !== 'EM_ANDAMENTO') {
      return res.status(400).json({ erro: 'Esse inventário já foi finalizado ou cancelado' });
    }

    const itensContados = inventario.itens.filter((i) => i.estoqueContado !== null);
    if (itensContados.length === 0) {
      return res.status(400).json({ erro: 'Nenhum item foi contado ainda. Conte ao menos um produto antes de finalizar.' });
    }

    const resumo = await prisma.$transaction(async (tx) => {
      const ajustes = [];

      for (const item of itensContados) {
        // Usa o estoque ATUAL do produto (não o snapshot do início do inventário)
        // como base do ajuste - se alguém vendeu esse produto durante a contagem,
        // o ajuste continua correto em vez de desfazer uma venda real
        const produtoAtual = await tx.produto.findUnique({ where: { id: item.produtoId } });
        if (!produtoAtual) continue;

        const diferenca = item.estoqueContado - produtoAtual.estoqueAtual;
        if (diferenca === 0) continue;

        await tx.produto.update({
          where: { id: item.produtoId },
          data: { estoqueAtual: item.estoqueContado },
        });

        await tx.movimentacao.create({
          data: {
            empresaId: req.empresaId,
            produtoId: item.produtoId,
            tipo: diferenca > 0 ? 'ENTRADA' : 'SAIDA',
            quantidade: Math.abs(diferenca),
            motivo: `Ajuste de inventário (contagem física #${inventario.id.slice(0, 8)})`,
            responsavelNome: req.nomeResponsavel || inventario.responsavelNome,
          },
        });

        ajustes.push({ produtoId: item.produtoId, diferenca });
      }

      const inventarioFinalizado = await tx.inventario.update({
        where: { id: req.params.id },
        data: { status: 'FINALIZADO', finalizadoEm: new Date() },
      });

      return { inventario: inventarioFinalizado, ajustes };
    }, { timeout: 30000 });

    res.json({
      inventario: resumo.inventario,
      itensAjustados: resumo.ajustes.length,
      itensContadosSemDiferenca: itensContados.length - resumo.ajustes.length,
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao finalizar inventário', detalhe: erro.message });
  }
});

// Cancelar um inventário em andamento (não mexe em estoque nenhum)
router.post('/:id/cancelar', async (req, res) => {
  try {
    const inventario = await prisma.inventario.findFirst({ where: { id: req.params.id, empresaId: req.empresaId } });
    if (!inventario) return res.status(404).json({ erro: 'Inventário não encontrado' });
    if (inventario.status !== 'EM_ANDAMENTO') {
      return res.status(400).json({ erro: 'Esse inventário já foi finalizado ou cancelado' });
    }

    const cancelado = await prisma.inventario.update({
      where: { id: req.params.id },
      data: { status: 'CANCELADO', finalizadoEm: new Date() },
    });
    res.json(cancelado);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao cancelar inventário', detalhe: erro.message });
  }
});

module.exports = router;
