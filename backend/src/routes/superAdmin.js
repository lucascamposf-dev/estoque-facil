const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../prismaClient');

const router = express.Router();

function autenticarSuperAdmin(req, res, next) {
  const senha = req.headers['x-super-admin-senha'] || '';
  const esperada = process.env.SUPER_ADMIN_SENHA || '';
  const bufA = Buffer.from(senha);
  const bufB = Buffer.from(esperada);
  const ok = bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  if (!ok) {
    return res.status(401).json({ erro: 'Acesso negado' });
  }
  next();
}

router.use(autenticarSuperAdmin);

// Cria uma empresa (loja cliente) + já cadastra o admin dela como Funcionario
router.post('/empresas', async (req, res) => {
  try {
    const { nome, slug, email, senha, adminNome, adminUsuario, adminSenha } = req.body;
    const senhaHash = await bcrypt.hash(senha, 10);
    const adminSenhaHash = await bcrypt.hash(adminSenha, 10);

    const empresa = await prisma.empresa.create({
  data: {
    nome, slug, email,
    usuario: slug,
    senha: senhaHash,
    funcionarios: {
      create: {
        nome: adminNome,
        usuario: adminUsuario,
        senha: adminSenhaHash,
        papel: 'ADMIN',
      },
    },
  },
  include: { funcionarios: true },

    });
    res.status(201).json(empresa);
  } catch (erro) {
    if (erro.code === 'P2002') {
      return res.status(409).json({ erro: 'E-mail, slug ou usuário de admin já em uso.' });
    }
    res.status(500).json({ erro: 'Erro ao criar empresa', detalhe: erro.message });
  }
});

// Listar empresas com contagem de funcionários e produtos
router.get('/empresas', async (req, res) => {
  try {
    const empresas = await prisma.empresa.findMany({
      orderBy: { criadoEm: 'desc' },
      include: {
        _count: { select: { funcionarios: true, produtos: true } },
      },
    });
    res.json(empresas);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao listar empresas', detalhe: erro.message });
  }
});

// Detalhe de uma empresa: dados + lista de funcionários
router.get('/empresas/:id', async (req, res) => {
  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: req.params.id },
      include: {
        funcionarios: {
          select: { id: true, nome: true, usuario: true, papel: true, ativo: true },
        },
        _count: { select: { produtos: true } },
      },
    });
    if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada' });
    res.json(empresa);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar empresa', detalhe: erro.message });
  }
});

// Editar dados da empresa (e opcionalmente resetar a senha dela)
router.put('/empresas/:id', async (req, res) => {
  try {
    const { nome, email, slug, novaSenha, plano, valorMensalidade, dataVencimento } = req.body;
    const dados = {
      ...(nome !== undefined && { nome }),
      ...(email !== undefined && { email }),
      ...(slug !== undefined && { slug }),
      ...(plano !== undefined && { plano: plano || null }),
      ...(valorMensalidade !== undefined && { valorMensalidade: valorMensalidade === '' || valorMensalidade === null ? null : Number(valorMensalidade) }),
      ...(dataVencimento !== undefined && { dataVencimento: dataVencimento || null }),
    };
    if (novaSenha) {
      dados.senha = await bcrypt.hash(novaSenha, 10);
    }
    const empresa = await prisma.empresa.update({
      where: { id: req.params.id },
      data: dados,
    });
    res.json(empresa);
  } catch (erro) {
    if (erro.code === 'P2002') {
      return res.status(409).json({ erro: 'E-mail ou slug já em uso por outra empresa.' });
    }
    res.status(500).json({ erro: 'Erro ao atualizar empresa', detalhe: erro.message });
  }
});

router.put('/empresas/:id/ativo', async (req, res) => {
  try {
    const empresa = await prisma.empresa.update({
      where: { id: req.params.id },
      data: { ativo: req.body.ativo },
    });
    res.json(empresa);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao atualizar status da empresa', detalhe: erro.message });
  }
});

// Excluir definitivamente uma empresa (exige confirmação com o nome exato)
router.delete('/empresas/:id', async (req, res) => {
  try {
    const { confirmacaoNome } = req.body;
    const empresa = await prisma.empresa.findUnique({ where: { id: req.params.id } });

    if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada' });
    if (confirmacaoNome !== empresa.nome) {
      return res.status(400).json({ erro: 'Nome de confirmação não confere.' });
    }

    await prisma.empresa.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao excluir empresa', detalhe: erro.message });
  }
});



// Métricas de assinatura: MRR (soma da mensalidade das empresas ativas) e
// quantas empresas estão com o plano vencido (dataVencimento no passado)
router.get('/metricas-assinatura', async (req, res) => {
  try {
    const { inicioDoDiaBrasil } = require('../utils/data');
    const hoje = inicioDoDiaBrasil();

    const empresas = await prisma.empresa.findMany({
      select: { id: true, nome: true, ativo: true, plano: true, valorMensalidade: true, dataVencimento: true },
    });

    const mrr = empresas
      .filter((e) => e.ativo)
      .reduce((soma, e) => soma + Number(e.valorMensalidade || 0), 0);

    const vencidas = empresas.filter((e) => e.dataVencimento && new Date(e.dataVencimento) < hoje);

    res.json({
      mrr,
      totalEmpresas: empresas.length,
      empresasVencidas: vencidas.map((e) => ({ id: e.id, nome: e.nome, ativo: e.ativo, dataVencimento: e.dataVencimento })),
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao calcular métricas de assinatura', detalhe: erro.message });
  }
});

// Desativa automaticamente empresas cujo plano venceu. Roda sozinho todo dia
// (ver server.js), mas também pode ser disparado manualmente aqui pelo painel.
router.post('/empresas/verificar-vencimentos', async (req, res) => {
  try {
    const resultado = await require('../utils/vencimentos').desativarEmpresasVencidas();
    res.json(resultado);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao verificar vencimentos', detalhe: erro.message });
  }
});

module.exports = router;