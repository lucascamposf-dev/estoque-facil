const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../prismaClient');
const { autenticar, exigirAdmin } = require('../middleware/auth');

const router = express.Router();

// Só admin da empresa mexe em funcionários
router.use(autenticar, exigirAdmin);

// Listar funcionários da empresa logada
router.get('/', async (req, res) => {
  try {
    const funcionarios = await prisma.funcionario.findMany({
      where: { empresaId: req.empresaId },
      orderBy: { nome: 'asc' },
      select: {
        id: true,
        nome: true,
        usuario: true,
        papel: true,
        ativo: true,
        podeVerCaixa: true,
        podeVerEstoque: true,
        criadoEm: true,
      },
    });
    res.json(funcionarios);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar funcionários', detalhe: erro.message });
  }
});

// Criar novo funcionário
router.post('/', async (req, res) => {
  try {
    const { nome, usuario, senha, papel, podeVerCaixa, podeVerEstoque } = req.body;

    if (!nome || !usuario || !senha) {
      return res.status(400).json({ erro: 'Nome, usuário e senha são obrigatórios' });
    }
    if (senha.length < 6) {
      return res.status(400).json({ erro: 'A senha precisa ter pelo menos 6 caracteres' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const funcionario = await prisma.funcionario.create({
      data: {
        empresaId: req.empresaId,
        nome,
        usuario,
        senha: senhaHash,
        papel: papel === 'ADMIN' ? 'ADMIN' : 'FUNCIONARIO',
        podeVerCaixa: !!podeVerCaixa,
        podeVerEstoque: !!podeVerEstoque,
      },
      select: {
        id: true, nome: true, usuario: true, papel: true,
        ativo: true, podeVerCaixa: true, podeVerEstoque: true, criadoEm: true,
      },
    });
    res.status(201).json(funcionario);
  } catch (erro) {
    if (erro.code === 'P2002') {
      return res.status(409).json({ erro: 'Esse nome de usuário já está em uso. Escolha outro.' });
    }
    res.status(500).json({ erro: 'Erro ao criar funcionário', detalhe: erro.message });
  }
});

// Editar funcionário (dados, permissões, ativo/inativo, e opcionalmente senha nova)
router.put('/:id', async (req, res) => {
  try {
    const funcionario = await prisma.funcionario.findUnique({ where: { id: req.params.id } });
    if (!funcionario || funcionario.empresaId !== req.empresaId) {
      return res.status(404).json({ erro: 'Funcionário não encontrado' });
    }

    const { nome, papel, ativo, podeVerCaixa, podeVerEstoque, novaSenha } = req.body;

    const dados = {
      ...(nome !== undefined && { nome }),
      ...(papel !== undefined && { papel: papel === 'ADMIN' ? 'ADMIN' : 'FUNCIONARIO' }),
      ...(ativo !== undefined && { ativo: !!ativo }),
      ...(podeVerCaixa !== undefined && { podeVerCaixa: !!podeVerCaixa }),
      ...(podeVerEstoque !== undefined && { podeVerEstoque: !!podeVerEstoque }),
    };

    if (novaSenha) {
      if (novaSenha.length < 6) {
        return res.status(400).json({ erro: 'A nova senha precisa ter pelo menos 6 caracteres' });
      }
      dados.senha = await bcrypt.hash(novaSenha, 10);
    }

    const atualizado = await prisma.funcionario.update({
      where: { id: req.params.id },
      data: dados,
      select: {
        id: true, nome: true, usuario: true, papel: true,
        ativo: true, podeVerCaixa: true, podeVerEstoque: true, criadoEm: true,
      },
    });
    res.json(atualizado);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao atualizar funcionário', detalhe: erro.message });
  }
});

// Excluir funcionário definitivamente (diferente de desativar - some da lista)
router.delete('/:id', async (req, res) => {
  try {
    const funcionario = await prisma.funcionario.findUnique({ where: { id: req.params.id } });
    if (!funcionario || funcionario.empresaId !== req.empresaId) {
      return res.status(404).json({ erro: 'Funcionário não encontrado' });
    }
    await prisma.funcionario.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao excluir funcionário', detalhe: erro.message });
  }
});

module.exports = router;