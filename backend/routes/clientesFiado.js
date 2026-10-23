const express = require('express');
const prisma = require('../prismaClient');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

// Listar clientes com saldo devedor (a "caderneta digital") - só da própria empresa
router.get('/', async (req, res) => {
  try {
    const clientes = await prisma.clienteFiado.findMany({
      where: { empresaId: req.empresaId },
      orderBy: { nome: 'asc' },
    });
    res.json(clientes);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar clientes', detalhe: erro.message });
  }
});

// Criar novo cliente fiado
router.post('/', async (req, res) => {
  try {
    const { nome, telefone, limiteCredito } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });

    const cliente = await prisma.clienteFiado.create({
      data: {
        empresaId: req.empresaId,
        nome,
        telefone: telefone || null,
        limiteCredito: limiteCredito ? Number(limiteCredito) : null,
      },
    });
    res.status(201).json(cliente);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao criar cliente', detalhe: erro.message });
  }
});

// Atualizar dados do cliente (nome, telefone, limite de crédito)
router.put('/:id', async (req, res) => {
  try {
    const existente = await prisma.clienteFiado.findFirst({
      where: { id: req.params.id, empresaId: req.empresaId },
    });
    if (!existente) return res.status(404).json({ erro: 'Cliente não encontrado' });

    const { nome, telefone, limiteCredito } = req.body;
    const cliente = await prisma.clienteFiado.update({
      where: { id: req.params.id },
      data: {
        nome: nome ?? existente.nome,
        telefone: telefone ?? existente.telefone,
        limiteCredito: limiteCredito !== undefined ? (limiteCredito === null ? null : Number(limiteCredito)) : existente.limiteCredito,
      },
    });
    res.json(cliente);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao atualizar cliente', detalhe: erro.message });
  }
});

// Registrar um pagamento e abater da dívida
router.post('/:id/pagamentos', async (req, res) => {
  try {
    const { valor, tipo } = req.body;
    if (!valor || valor <= 0) return res.status(400).json({ erro: 'Valor inválido' });
    if (!['AUMENTO', 'PAGAMENTO'].includes(tipo)) return res.status(400).json({ erro: 'Tipo inválido' });

    const existente = await prisma.clienteFiado.findFirst({
      where: { id: req.params.id, empresaId: req.empresaId },
    });
    if (!existente) return res.status(404).json({ erro: 'Cliente não encontrado' });

    const resultado = await prisma.$transaction(async (tx) => {
      let novoSaldo;
      if (tipo === 'AUMENTO') {
        novoSaldo = { increment: Number(valor) };
      } else {
        // Não deixa o saldo ficar negativo: no máximo zera
        const valorReal = Math.min(Number(valor), Number(existente.saldoDevedor));
        if (valorReal <= 0) {
          throw new Error('Este cliente não possui dívida pendente para baixar.');
        }
        novoSaldo = { decrement: valorReal };
      }

      const cliente = await tx.clienteFiado.update({
        where: { id: req.params.id },
        data: { saldoDevedor: novoSaldo },
      });

      if (tipo === 'PAGAMENTO') {
        const valorReal = Math.min(Number(valor), Number(existente.saldoDevedor));
        await tx.pagamentoFiado.create({
          data: { clienteId: req.params.id, valor: valorReal },
        });
      }
      return cliente;
    });

    res.status(201).json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao registrar pagamento', detalhe: erro.message });
  }
});

// Histórico de compras fiado e pagamentos de um cliente
router.get('/:id/historico', async (req, res) => {
  try {
    const cliente = await prisma.clienteFiado.findFirst({
      where: { id: req.params.id, empresaId: req.empresaId },
      include: {
        movimentacoes: { include: { produto: true }, orderBy: { criadoEm: 'desc' } },
        pagamentos: { orderBy: { criadoEm: 'desc' } },
      },
    });
    if (!cliente) return res.status(404).json({ erro: 'Cliente não encontrado' });
    res.json(cliente);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar histórico', detalhe: erro.message });
  }
});

// Ajusta o saldo devedor manualmente - usado tanto pra lançar uma dívida fiado
// direto (sem passar por venda de produto) quanto pra registrar pagamento
router.post('/:id/ajuste', async (req, res) => {
  try {
    const { valor, tipo } = req.body;
    if (!valor || Number(valor) <= 0) return res.status(400).json({ erro: 'Valor inválido' });
    if (!['AUMENTO', 'PAGAMENTO'].includes(tipo)) return res.status(400).json({ erro: 'Tipo inválido' });

    const existente = await prisma.clienteFiado.findFirst({
      where: { id: req.params.id, empresaId: req.empresaId },
    });
    if (!existente) return res.status(404).json({ erro: 'Cliente não encontrado' });

    const resultado = await prisma.$transaction(async (tx) => {
      const valorReal = tipo === 'PAGAMENTO'
        ? Math.min(Number(valor), Number(existente.saldoDevedor))
        : Number(valor);

      const cliente = await tx.clienteFiado.update({
        where: { id: req.params.id },
        data: {
          saldoDevedor: tipo === 'AUMENTO'
            ? { increment: valorReal }
            : { decrement: valorReal },
        },
      });
      if (tipo === 'PAGAMENTO') {
        await tx.pagamentoFiado.create({
          data: { clienteId: req.params.id, valor: valorReal },
        });
      }
      return cliente;
    });

    res.status(201).json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao ajustar saldo', detalhe: erro.message });
  }
});

module.exports = router;