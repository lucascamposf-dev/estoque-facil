const express = require('express');
const prisma = require('../prismaClient');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

// Listar fornecedores da empresa (só ativos por padrão)
router.get('/', async (req, res) => {
  try {
    const incluirInativos = req.query.incluirInativos === 'true';
    const fornecedores = await prisma.fornecedor.findMany({
      where: { empresaId: req.empresaId, ...(incluirInativos ? {} : { ativo: true }) },
      orderBy: { nome: 'asc' },
    });
    res.json(fornecedores);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar fornecedores', detalhe: erro.message });
  }
});

// Criar fornecedor
router.post('/', async (req, res) => {
  try {
    const { nome, telefone, observacoes } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Nome é obrigatório' });

    const fornecedor = await prisma.fornecedor.create({
      data: { empresaId: req.empresaId, nome: nome.trim(), telefone: telefone || null, observacoes: observacoes || null },
    });
    res.status(201).json(fornecedor);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao criar fornecedor', detalhe: erro.message });
  }
});

// Editar fornecedor
router.put('/:id', async (req, res) => {
  try {
    const existente = await prisma.fornecedor.findFirst({ where: { id: req.params.id, empresaId: req.empresaId } });
    if (!existente) return res.status(404).json({ erro: 'Fornecedor não encontrado' });

    const { nome, telefone, observacoes, ativo } = req.body;
    const fornecedor = await prisma.fornecedor.update({
      where: { id: req.params.id },
      data: {
        ...(nome !== undefined && { nome: nome.trim() }),
        ...(telefone !== undefined && { telefone: telefone || null }),
        ...(observacoes !== undefined && { observacoes: observacoes || null }),
        ...(ativo !== undefined && { ativo }),
      },
    });
    res.json(fornecedor);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao atualizar fornecedor', detalhe: erro.message });
  }
});

// "Excluir" fornecedor - na prática só desativa (mesmo padrão de produto), pra
// não perder a referência em movimentações antigas que já usaram esse fornecedor
router.delete('/:id', async (req, res) => {
  try {
    const existente = await prisma.fornecedor.findFirst({ where: { id: req.params.id, empresaId: req.empresaId } });
    if (!existente) return res.status(404).json({ erro: 'Fornecedor não encontrado' });

    await prisma.fornecedor.update({ where: { id: req.params.id }, data: { ativo: false } });
    res.status(204).send();
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao remover fornecedor', detalhe: erro.message });
  }
});

module.exports = router;
