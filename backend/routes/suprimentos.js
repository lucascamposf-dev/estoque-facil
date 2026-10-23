const express = require('express');
const prisma = require('../prismaClient');
const { autenticar } = require('../middleware/auth');
const { inicioDoDiaBrasil } = require('../utils/data');

const router = express.Router();
router.use(autenticar);

// Mesma regra da sangria: mexe com dinheiro do caixa, exige permissão de caixa
// (admin ou funcionário com podeVerCaixa), não só estar logado.
function exigirPermissaoCaixa(req, res, next) {
  if (req.papel === 'ADMIN' || req.permissoes?.podeVerCaixa) return next();
  return res.status(403).json({ erro: 'Você não tem permissão para mexer no caixa' });
}
router.use(exigirPermissaoCaixa);

router.get('/', async (req, res) => {
  try {
    const inicioDoDia = inicioDoDiaBrasil();

    const suprimentos = await prisma.suprimento.findMany({
      where: { empresaId: req.empresaId, criadoEm: { gte: inicioDoDia } },
      orderBy: { criadoEm: 'desc' },
    });
    res.json(suprimentos);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar suprimentos', detalhe: erro.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { valor, motivo } = req.body;
    if (!valor || Number(valor) <= 0) {
      return res.status(400).json({ erro: 'Informe um valor válido' });
    }
    const suprimento = await prisma.suprimento.create({
      data: {
        empresaId: req.empresaId,
        valor,
        motivo: motivo || null,
        responsavelNome: req.nomeResponsavel,
      },
    });
    res.status(201).json(suprimento);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao registrar suprimento', detalhe: erro.message });
  }
});

module.exports = router;
