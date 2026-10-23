const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');

async function autenticar(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ erro: 'Não autenticado' });

  const token = authHeader.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Confere no banco se a empresa e (se for funcionário) o funcionário ainda
    // estão ativos - assim, desativar alguém corta o acesso na hora, mesmo que
    // o token dele ainda seja válido por dias no celular pessoal.
    const empresa = await prisma.empresa.findUnique({ where: { id: payload.empresaId } });
    if (!empresa || !empresa.ativo) {
      return res.status(401).json({ erro: 'Acesso desativado' });
    }

    if (payload.funcionarioId) {
      const funcionario = await prisma.funcionario.findUnique({ where: { id: payload.funcionarioId } });
      if (!funcionario || !funcionario.ativo) {
        return res.status(401).json({ erro: 'Acesso desativado' });
      }
      req.nomeResponsavel = funcionario.nome;
    } else if (payload.nomeResponsavelForcado) {
      // Token de acesso rápido via PIN (QR code na prateleira) - não é admin
      // nem funcionário cadastrado, grava um nome fixo pra identificar essas
      // movimentações no histórico
      req.nomeResponsavel = payload.nomeResponsavelForcado;
    } else {
      req.nomeResponsavel = 'Admin';
    }

    req.empresaId = payload.empresaId;
    req.funcionarioId = payload.funcionarioId || null;
    req.papel = payload.papel; // 'ADMIN' ou 'FUNCIONARIO'
    req.permissoes = payload.permissoes || {};
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}

function exigirAdmin(req, res, next) {
  if (req.papel !== 'ADMIN') return res.status(403).json({ erro: 'Acesso restrito ao admin' });
  next();
}

module.exports = { autenticar, exigirAdmin };