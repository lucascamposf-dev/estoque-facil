const express = require('express');
const prisma = require('../prismaClient');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

// Dados básicos da empresa do usuário logado (usado pra exibir o slug, por exemplo)
router.get('/me', async (req, res) => {
  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: req.empresaId },
      select: { id: true, nome: true, slug: true, pinBaixaRapida: true },
    });
    if (!empresa) return res.status(404).json({ erro: 'Empresa não encontrada' });
    // Nunca devolve o hash do PIN pro frontend - só se já foi configurado ou não
    const { pinBaixaRapida, ...resto } = empresa;
    res.json({ ...resto, pinBaixaRapidaConfigurado: !!pinBaixaRapida });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar empresa', detalhe: erro.message });
  }
});

module.exports = router;