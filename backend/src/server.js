require('dotenv').config();
const express = require('express');
const cors = require('cors');

const produtosRouter = require('./routes/produtos');
const movimentacoesRouter = require('./routes/movimentacoes');
const clientesFiadoRouter = require('./routes/clientesFiado');
const superAdminRouter = require('./routes/superAdmin');
const authRouter = require('./routes/auth');
const funcionariosRouter = require('./routes/funcionarios');
const empresaRouter = require('./routes/empresa');
const relatoriosRouter = require('./routes/relatorios');
const sangriasRouter = require('./routes/sangrias');
const vasilhamesRouter = require('./routes/vasilhames');
const baixaRapidaRouter = require('./routes/baixaRapida');
const inventarioRouter = require('./routes/inventario');
const fornecedoresRouter = require('./routes/fornecedores');
const { desativarEmpresasVencidas } = require('./utils/vencimentos');
const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Rota de saúde - útil pra testar se o servidor está de pé (inclusive no Railway)
app.get('/', (req, res) => {
  res.json({ status: 'ok', mensagem: 'API do sistema de estoque rodando' });
});

app.use('/produtos', produtosRouter);
app.use('/movimentacoes', movimentacoesRouter);
app.use('/clientes-fiado', clientesFiadoRouter);
app.use('/super-admin', superAdminRouter);
app.use('/auth', authRouter);
app.use('/funcionarios', funcionariosRouter);
app.use('/empresa', empresaRouter);
app.use('/relatorios', relatoriosRouter);
app.use('/sangrias', sangriasRouter);
app.use('/vasilhames', vasilhamesRouter);
app.use('/baixa-rapida', baixaRapidaRouter);
app.use('/inventario', inventarioRouter);
app.use('/fornecedores', fornecedoresRouter);

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// Verifica empresas com plano vencido ao subir o servidor e depois 1x por dia.
// Roda em memória do processo - funciona bem com uma única instância (mesmo
// modelo já usado pro rate limiter); se um dia rodar múltiplas réplicas, isso
// deveria virar um cron job externo (ex: Railway Cron) chamando a rota
// POST /super-admin/empresas/verificar-vencimentos em vez de rodar aqui dentro.
desativarEmpresasVencidas()
  .then(({ desativadas }) => {
    if (desativadas.length > 0) {
      console.log(`Vencimento: ${desativadas.length} empresa(s) desativada(s) automaticamente.`);
    }
  })
  .catch((erro) => console.error('Erro ao verificar vencimentos no startup:', erro.message));

setInterval(() => {
  desativarEmpresasVencidas().catch((erro) => console.error('Erro ao verificar vencimentos:', erro.message));
}, 24 * 60 * 60 * 1000);
