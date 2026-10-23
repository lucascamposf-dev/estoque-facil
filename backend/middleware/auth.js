// ⚠️ ARQUIVO RECONSTRUÍDO - LEIA ANTES DE USAR ⚠️
//
// Este arquivo NÃO estava no seu backup. O zip original tinha todos os
// arquivos soltos numa pasta só (sem estrutura de pastas), e existiam DOIS
// arquivos chamados "auth.js" no seu projeto original:
//   - backend/routes/auth.js       (rotas de login - esse veio no backup)
//   - backend/middleware/auth.js   (o middleware "autenticar" - esse SUMIU,
//     porque ao zipar tudo achatado, um "auth.js" sobrescreveu o outro)
//
// Reconstruí esse arquivo com base em como "autenticar" e "exigirAdmin" são
// usados em produtos.js, movimentacoes.js, funcionarios.js, baixaRapida.js
// etc. (ex: req.empresaId, req.nomeResponsavel, req.papel) e em como o token
// é gerado em routes/auth.js. Funcionalmente deve se comportar como o
// original, mas comparte com a versão real do seu projeto (git, ou o código
// já publicado no Railway) antes de subir pra produção - principalmente a
// forma exata de resolver "nomeResponsavel", que eu tive que inferir.

const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');

// Lê o token "Bearer ..." do header Authorization, valida e injeta no req:
// req.empresaId, req.papel ('ADMIN' | 'FUNCIONARIO'), req.funcionarioId,
// req.permissoes e req.nomeResponsavel (usado pra gravar quem fez cada
// movimentação, sem depender do funcionário existir/ter o mesmo nome depois).
async function autenticar(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ erro: 'Token não informado' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.empresaId = payload.empresaId;
    req.papel = payload.papel;
    req.funcionarioId = payload.funcionarioId || null;
    req.permissoes = payload.permissoes || null;

    if (payload.papel === 'ADMIN') {
      req.nomeResponsavel = 'Admin';
    } else if (payload.funcionarioId) {
      const funcionario = await prisma.funcionario.findUnique({ where: { id: payload.funcionarioId } });
      req.nomeResponsavel = funcionario?.nome || 'Funcionário';
    } else {
      req.nomeResponsavel = 'Desconhecido';
    }

    next();
  } catch (erro) {
    return res.status(401).json({ erro: 'Sessão expirada. Faça login de novo.' });
  }
}

// Bloqueia rotas que só o dono (ADMIN) pode usar - ex: gerenciar funcionários,
// definir PIN da baixa rápida. Precisa rodar depois de `autenticar`.
function exigirAdmin(req, res, next) {
  if (req.papel !== 'ADMIN') {
    return res.status(403).json({ erro: 'Apenas o administrador pode fazer isso' });
  }
  next();
}

module.exports = { autenticar, exigirAdmin };
