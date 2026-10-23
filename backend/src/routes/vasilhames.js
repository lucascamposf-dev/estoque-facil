const express = require('express');
const prisma = require('../prismaClient');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

// Listar tipos de vasilhame cadastrados, com total emprestado (não devolvido) de cada um
router.get('/', async (req, res) => {
  try {
    const vasilhames = await prisma.vasilhame.findMany({
      where: { empresaId: req.empresaId },
      include: { emprestimos: true },
      orderBy: { nome: 'asc' },
    });

    const resultado = vasilhames.map((v) => {
      const totalEmprestado = v.emprestimos.reduce(
        (soma, m) => soma + (m.tipo === 'EMPRESTADO' ? m.quantidade : -m.quantidade),
        0
      );
      const { emprestimos, ...resto } = v;
      return { ...resto, totalEmprestado };
    });

    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar vasilhames', detalhe: erro.message });
  }
});

// Criar um novo tipo de vasilhame (ex: "Casco Skol 600ml", "Engradado Coca 12un")
router.post('/', async (req, res) => {
  try {
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório' });

    const vasilhame = await prisma.vasilhame.create({
      data: { empresaId: req.empresaId, nome },
    });
    res.status(201).json(vasilhame);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao criar vasilhame', detalhe: erro.message });
  }
});

// Saldo emprestado por cliente, pra um tipo de vasilhame específico
router.get('/:id/emprestimos', async (req, res) => {
  try {
    const movimentos = await prisma.vasilhameEmprestimo.findMany({
      where: { vasilhameId: req.params.id, empresaId: req.empresaId },
      include: { clienteFiado: true },
      orderBy: { criadoEm: 'desc' },
    });

    const saldosPorCliente = {};
    for (const m of movimentos) {
      const chave = m.clienteFiadoId || m.clienteNomeAvulso || 'sem-identificacao';
      if (!saldosPorCliente[chave]) {
        saldosPorCliente[chave] = {
          nome: m.clienteFiado?.nome || m.clienteNomeAvulso || 'Sem identificação',
          saldo: 0,
        };
      }
      saldosPorCliente[chave].saldo += m.tipo === 'EMPRESTADO' ? m.quantidade : -m.quantidade;
    }

    res.json({
      movimentos,
      saldosPorCliente: Object.values(saldosPorCliente).filter((s) => s.saldo !== 0),
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar empréstimos', detalhe: erro.message });
  }
});

// Registrar empréstimo ou devolução de vasilhame
router.post('/:id/movimentar', async (req, res) => {
  try {
    const { clienteFiadoId, clienteNomeAvulso, quantidade, tipo } = req.body;

    if (!quantidade || quantidade <= 0) return res.status(400).json({ erro: 'Quantidade inválida' });
    if (!['EMPRESTADO', 'DEVOLVIDO'].includes(tipo)) return res.status(400).json({ erro: 'Tipo inválido' });
    if (!clienteFiadoId && !clienteNomeAvulso) {
      return res.status(400).json({ erro: 'Informe o cliente (cadastrado ou nome avulso)' });
    }

    const vasilhame = await prisma.vasilhame.findFirst({
      where: { id: req.params.id, empresaId: req.empresaId },
    });
    if (!vasilhame) return res.status(404).json({ erro: 'Vasilhame não encontrado' });

    const movimento = await prisma.vasilhameEmprestimo.create({
      data: {
        empresaId: req.empresaId,
        vasilhameId: req.params.id,
        clienteFiadoId: clienteFiadoId || null,
        clienteNomeAvulso: clienteFiadoId ? null : clienteNomeAvulso,
        quantidade: Number(quantidade),
        tipo,
      },
    });
    res.status(201).json(movimento);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao registrar movimento', detalhe: erro.message });
  }
});

module.exports = router;