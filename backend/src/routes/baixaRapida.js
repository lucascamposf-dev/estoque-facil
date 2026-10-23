const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../prismaClient');
const { autenticar, exigirAdmin } = require('../middleware/auth');
const { criarLimitadorTentativas } = require('../utils/rateLimiter');

const router = express.Router();

// Rate limiting simples em memória - reseta se o servidor reiniciar, mas já
// trava tentativa de força bruta de PIN de 4 dígitos na prática
const { bloqueado: bloqueadoPorTentativas, registrarFalha: registrarTentativaFalha, limparTentativas } =
  criarLimitadorTentativas({ janelaMs: 15 * 60 * 1000, maxTentativas: 5 });

// Admin define/troca o PIN de 4 dígitos usado na baixa rápida via QR code
router.put('/definir-pin', autenticar, exigirAdmin, async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ erro: 'O PIN precisa ter exatamente 4 números' });
    }
    const hash = await bcrypt.hash(pin, 10);
    await prisma.empresa.update({ where: { id: req.empresaId }, data: { pinBaixaRapida: hash } });
    res.json({ ok: true });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao salvar PIN', detalhe: erro.message });
  }
});

// Valida o PIN escaneado na prateleira e devolve um token de acesso rápido -
// rota pública (sem autenticar), protegida só pelo PIN + rate limiting
router.post('/:slug/entrar', async (req, res) => {
  try {
    const { slug } = req.params;
    const { pin } = req.body;

    if (bloqueadoPorTentativas(slug)) {
      return res.status(429).json({ erro: 'Muitas tentativas erradas. Aguarde alguns minutos e tente de novo.' });
    }

    const empresa = await prisma.empresa.findUnique({ where: { slug } });
    if (!empresa || !empresa.ativo) {
      return res.status(404).json({ erro: 'Empresa não encontrada' });
    }
    if (!empresa.pinBaixaRapida) {
      return res.status(400).json({ erro: 'O PIN de baixa rápida ainda não foi configurado pelo admin.' });
    }

    const confere = await bcrypt.compare(String(pin || ''), empresa.pinBaixaRapida);
    if (!confere) {
      registrarTentativaFalha(slug);
      return res.status(401).json({ erro: 'PIN incorreto' });
    }

    limparTentativas(slug);

    const token = jwt.sign(
      {
        empresaId: empresa.id,
        papel: 'FUNCIONARIO',
        funcionarioId: null,
        permissoes: { podeVerEstoque: true, podeVerCaixa: false },
        nomeResponsavelForcado: 'Baixa Rápida (QR)',
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ token, nomeResponsavel: 'Baixa Rápida (QR)' });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao validar PIN', detalhe: erro.message });
  }
});

module.exports = router;