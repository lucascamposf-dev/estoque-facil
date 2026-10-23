const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');
const { criarLimitadorTentativas } = require('../utils/rateLimiter');

const router = express.Router();

// Login de admin e de funcionário tinham senha curta (mín. 6 caracteres) e
// nenhuma proteção contra força bruta - um usuário previsível (ex: primeiro
// nome) combinado com tentativas ilimitadas é um ponto fraco. Mesma janela e
// limite já usados na Baixa Rápida (5 tentativas / 15 min), agora por chave
// de login em vez de por slug de empresa.
const limitadorLogin = criarLimitadorTentativas({ janelaMs: 15 * 60 * 1000, maxTentativas: 5 });

// Login do admin (dono da loja)
router.post('/login-admin', async (req, res) => {
  try {
    const { usuario, senha } = req.body;
    if (!usuario || !senha) {
      return res.status(400).json({ erro: 'Informe o usuário e a senha' });
    }

    const chaveLimitador = `admin:${usuario.toLowerCase()}`;
    if (limitadorLogin.bloqueado(chaveLimitador)) {
      return res.status(429).json({ erro: 'Muitas tentativas erradas. Aguarde alguns minutos e tente de novo.' });
    }

    const empresa = await prisma.empresa.findFirst({
  where: { OR: [{ usuario }, { email: usuario }] },
});
    if (!empresa || !empresa.ativo) {
      limitadorLogin.registrarFalha(chaveLimitador);
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const senhaOk = await bcrypt.compare(senha, empresa.senha);
    if (!senhaOk) {
      limitadorLogin.registrarFalha(chaveLimitador);
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    limitadorLogin.limparTentativas(chaveLimitador);

    const token = jwt.sign(
      { empresaId: empresa.id, papel: 'ADMIN' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ token, empresa: { id: empresa.id, nome: empresa.nome, slug: empresa.slug, usuario: empresa.usuario } });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao autenticar', detalhe: erro.message });
  }
});

// Login do funcionário
router.post('/login-funcionario', async (req, res) => {
  try {
    const { empresaSlug, usuario, senha } = req.body;

    if (!empresaSlug || !usuario || !senha) {
      return res.status(400).json({ erro: 'Informe a empresa, o usuário e a senha' });
    }

    const chaveLimitador = `funcionario:${empresaSlug.toLowerCase()}:${usuario.toLowerCase()}`;
    if (limitadorLogin.bloqueado(chaveLimitador)) {
      return res.status(429).json({ erro: 'Muitas tentativas erradas. Aguarde alguns minutos e tente de novo.' });
    }

    const empresa = await prisma.empresa.findUnique({ where: { slug: empresaSlug } });
    if (!empresa || !empresa.ativo) {
      limitadorLogin.registrarFalha(chaveLimitador);
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const funcionario = await prisma.funcionario.findFirst({
      where: { empresaId: empresa.id, usuario },
    });
    if (!funcionario || !funcionario.ativo) {
      limitadorLogin.registrarFalha(chaveLimitador);
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const senhaOk = await bcrypt.compare(senha, funcionario.senha);
    if (!senhaOk) {
      limitadorLogin.registrarFalha(chaveLimitador);
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    limitadorLogin.limparTentativas(chaveLimitador);

    const token = jwt.sign(
      {
        empresaId: funcionario.empresaId,
        funcionarioId: funcionario.id,
        papel: funcionario.papel,
        permissoes: {
          podeVerCaixa: funcionario.podeVerCaixa,
          podeVerEstoque: funcionario.podeVerEstoque,
        },
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ token, funcionario: { id: funcionario.id, nome: funcionario.nome, papel: funcionario.papel } });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao autenticar', detalhe: erro.message });
  }
});

module.exports = router;