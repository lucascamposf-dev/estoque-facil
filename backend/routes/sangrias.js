const express = require('express');
const prisma = require('../prismaClient');
const { autenticar } = require('../middleware/auth');
const { inicioDoDiaBrasil } = require('../utils/data');

const router = express.Router();
router.use(autenticar);

// Sangria mexe com dinheiro do caixa - antes só exigia estar logado, o que
// deixava qualquer funcionário (mesmo sem permissão de ver caixa) registrar
// sangria direto pela API, ainda que a tela ficasse escondida dele.
function exigirPermissaoCaixa(req, res, next) {
  if (req.papel === 'ADMIN' || req.permissoes?.podeVerCaixa) return next();
  return res.status(403).json({ erro: 'Você não tem permissão para mexer no caixa' });
}
router.use(exigirPermissaoCaixa);

router.get('/', async (req, res) => {
  try {
    const inicioDoDia = inicioDoDiaBrasil();

    const sangrias = await prisma.sangria.findMany({
      where: { empresaId: req.empresaId, criadoEm: { gte: inicioDoDia } },
      orderBy: { criadoEm: 'desc' },
    });
    res.json(sangrias);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar sangrias', detalhe: erro.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { valor, motivo } = req.body;
    if (!valor || Number(valor) <= 0) {
      return res.status(400).json({ erro: 'Informe um valor válido' });
    }
    const sangria = await prisma.sangria.create({
      data: {
        empresaId: req.empresaId,
        valor,
        motivo: motivo || null,
        responsavelNome: req.nomeResponsavel,
      },
    });
    res.status(201).json(sangria);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao registrar sangria', detalhe: erro.message });
  }
});

module.exports = router;