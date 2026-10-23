const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const prisma = require('../prismaClient');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
router.use(autenticar);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

function normalizarCabecalho(texto) {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const MAPA_COLUNAS = {
  nome: ['nome', 'produto', 'descricao', 'item', 'mercadoria'],
  quantidade: ['quantidade', 'qtd', 'qtde', 'estoque', 'estoque atual'],
  precoUnitario: ['preco unitario', 'valor unitario', 'preco venda', 'valor venda', 'preco', 'valor'],
};

function detectarColuna(cabecalhos, candidatos) {
  const normalizados = cabecalhos.map(normalizarCabecalho);
  for (const candidato of candidatos) {
    const idx = normalizados.findIndex((c) => c === candidato);
    if (idx !== -1) return idx;
  }
  for (const candidato of candidatos) {
    const idx = normalizados.findIndex((c) => c.includes(candidato));
    if (idx !== -1) return idx;
  }
  return -1;
}

function paraNumeroBr(valor) {
  if (valor === undefined || valor === null || valor === '') return 0;
  const texto = String(valor).trim().replace(/\./g, '').replace(',', '.');
  const numero = Number(texto);
  return Number.isNaN(numero) ? 0 : numero;
}

// Listar todos os produtos ativos, com destaque pra quem está com estoque baixo
router.get('/', async (req, res) => {
  try {
    const { categoria } = req.query;
    const produtos = await prisma.produto.findMany({
       where: { ativo: true, empresaId: req.empresaId, ...(categoria ? { categoria } : {}) },
      orderBy: { nome: 'asc' },
    });
    res.json(produtos);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar produtos', detalhe: erro.message });
  }
});

// Buscar um produto por código de barras (usado no scanner de câmera)
router.get('/codigo-barras/:codigo', async (req, res) => {
  try {
    const produto = await prisma.produto.findFirst({
      where: { codigoBarras: req.params.codigo, empresaId: req.empresaId },
    });
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json(produto);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar produto', detalhe: erro.message });
  }
});

// Buscar um produto específico pelo id (usado na baixa rápida via QR code)
router.get('/:id', async (req, res) => {
  try {
    const produto = await prisma.produto.findFirst({
      where: { id: req.params.id, empresaId: req.empresaId, ativo: true },
    });
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });
    res.json(produto);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar produto', detalhe: erro.message });
  }
});

// Criar produto novo
router.post('/', async (req, res) => {
  try {
    const { nome, fotoUrl, codigoBarras, precoVenda, precoCusto, precoCartao, estoqueAtual, estoqueMinimo, categoria } = req.body;

    if (!nome || precoVenda === undefined) {
      return res.status(400).json({ erro: 'Nome e preço de venda são obrigatórios' });
    }

    const produto = await prisma.produto.create({
      data: {
        empresaId: req.empresaId,
        nome,
        fotoUrl,
        codigoBarras: codigoBarras || undefined,
        precoVenda,
        precoCusto,
        precoCartao: precoCartao || null,
        estoqueAtual: estoqueAtual ?? 0,
        estoqueMinimo: estoqueMinimo ?? 5,
        categoria: categoria || 'OUTROS',
      },
    });
    res.status(201).json(produto);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao criar produto', detalhe: erro.message });
  }
});

// Atualizar produto
router.put('/:id', async (req, res) => {
  try {
    const existente = await prisma.produto.findFirst({ where: { id: req.params.id, empresaId: req.empresaId } });
    if (!existente) return res.status(404).json({ erro: 'Produto não encontrado' });

    const { nome, fotoUrl, codigoBarras, precoVenda, precoCusto, precoCartao, estoqueAtual, estoqueMinimo, categoria, ativo, dataValidade, diasAlertaValidade } = req.body;

    // Só registra histórico se o preço de venda realmente mudou pra um valor
    // diferente - evita entulhar a tabela com "trocas" que não trocaram nada
    // (ex: salvar o formulário de novo sem mexer no preço)
    const precoMudou = precoVenda !== undefined && Number(precoVenda) !== Number(existente.precoVenda);

    const produto = await prisma.$transaction(async (tx) => {
      const atualizado = await tx.produto.update({
        where: { id: req.params.id },
        data: {
          ...(nome !== undefined && { nome }),
          ...(fotoUrl !== undefined && { fotoUrl }),
          ...(codigoBarras !== undefined && { codigoBarras }),
          ...(precoVenda !== undefined && { precoVenda }),
          ...(precoCusto !== undefined && { precoCusto }),
          ...(precoCartao !== undefined && { precoCartao: precoCartao || null }),
          ...(estoqueAtual !== undefined && { estoqueAtual }),
          ...(estoqueMinimo !== undefined && { estoqueMinimo }),
          ...(categoria !== undefined && { categoria }),
          ...(ativo !== undefined && { ativo }),
          ...(dataValidade !== undefined && { dataValidade }),
          ...(diasAlertaValidade !== undefined && { diasAlertaValidade }),
          revisado: true,
        },
      });

      if (precoMudou) {
        await tx.historicoPreco.create({
          data: {
            produtoId: req.params.id,
            empresaId: req.empresaId,
            precoAntigo: existente.precoVenda,
            precoNovo: Number(precoVenda),
          },
        });
      }

      return atualizado;
    });

    res.json(produto);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao atualizar produto', detalhe: erro.message });
  }
});

// Histórico de alteração de preço de venda de um produto
router.get('/:id/historico-preco', async (req, res) => {
  try {
    const produto = await prisma.produto.findFirst({ where: { id: req.params.id, empresaId: req.empresaId } });
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });

    const historico = await prisma.historicoPreco.findMany({
      where: { produtoId: req.params.id, empresaId: req.empresaId },
      orderBy: { criadoEm: 'desc' },
    });
    res.json(historico);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar histórico de preço', detalhe: erro.message });
  }
});

// Desativar produto (não apagamos de verdade, pra manter histórico de movimentações)
router.delete('/:id', async (req, res) => {
  try {
    const existente = await prisma.produto.findFirst({ where: { id: req.params.id, empresaId: req.empresaId } });
    if (!existente) return res.status(404).json({ erro: 'Produto não encontrado' });

    await prisma.produto.update({
      where: { id: req.params.id },
      data: { ativo: false },
    });
    res.status(204).send();
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao remover produto', detalhe: erro.message });
  }
});

// Listar as unidades de venda de um produto (ex: fardo, caixa)
router.get('/:id/unidades', async (req, res) => {
  try {
    const produto = await prisma.produto.findFirst({ where: { id: req.params.id, empresaId: req.empresaId } });
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });

    const unidades = await prisma.unidadeVenda.findMany({
      where: { produtoId: req.params.id },
      orderBy: { criadoEm: 'asc' },
    });
    res.json(unidades);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao buscar unidades de venda', detalhe: erro.message });
  }
});

// Criar uma unidade de venda pra um produto (ex: "Fardo (12 un)")
router.post('/:id/unidades', async (req, res) => {
  try {
    const { nome, quantidadeEmUnidades, precoVenda, precoCartao } = req.body;
    if (!nome || !quantidadeEmUnidades || precoVenda === undefined) {
      return res.status(400).json({ erro: 'Nome, quantidade e preço são obrigatórios' });
    }

    const produto = await prisma.produto.findFirst({ where: { id: req.params.id, empresaId: req.empresaId } });
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado' });

    const unidade = await prisma.unidadeVenda.create({
      data: {
        produtoId: req.params.id,
        nome,
        quantidadeEmUnidades: Number(quantidadeEmUnidades),
        precoVenda: Number(precoVenda),
        precoCartao: precoCartao ? Number(precoCartao) : null,
      },
    });
    res.status(201).json(unidade);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao criar unidade de venda', detalhe: erro.message });
  }
});

router.post('/importar', upload.single('planilha'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
    }

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const primeiraAba = workbook.SheetNames[0];
    const linhas = XLSX.utils.sheet_to_json(workbook.Sheets[primeiraAba], { header: 1, raw: false });

    if (!linhas || linhas.length < 2) {
      return res.status(400).json({ erro: 'Planilha vazia ou sem dados' });
    }

    const cabecalhos = linhas[0];
    const idxNome = detectarColuna(cabecalhos, MAPA_COLUNAS.nome);
    const idxQtd = detectarColuna(cabecalhos, MAPA_COLUNAS.quantidade);
    const idxPreco = detectarColuna(cabecalhos, MAPA_COLUNAS.precoUnitario);

    if (idxNome === -1) {
      return res.status(400).json({ erro: 'Não encontramos uma coluna de nome do produto na planilha. Verifique se a primeira linha tem os cabeçalhos.' });
    }

    // Linha do Excel = índice no array + 2 (1 pra header, 1 porque planilha
    // começa em 1, não em 0) - usado só pra reportar o número que a pessoa vê
    // se abrir o arquivo no Excel/Sheets
    const linhasComNumero = linhas.slice(1).map((linha, i) => ({ linha, numeroExcel: i + 2 }));

    const semNome = linhasComNumero.filter(({ linha }) => !linha[idxNome] || !String(linha[idxNome]).trim());
    const comNome = linhasComNumero.filter(({ linha }) => linha[idxNome] && String(linha[idxNome]).trim());

    if (comNome.length === 0) {
      return res.status(400).json({ erro: 'Nenhuma linha com nome de produto foi encontrada.' });
    }

    // Não cria produto duplicado se a planilha for importada duas vezes (ou
    // se já existir um produto com esse nome cadastrado manualmente)
    const produtosExistentes = await prisma.produto.findMany({
      where: { empresaId: req.empresaId, ativo: true },
      select: { nome: true },
    });
    const nomesExistentes = new Set(produtosExistentes.map((p) => p.nome.trim().toLowerCase()));
    const nomesVistosNestaImportacao = new Set();

    const paraCriar = [];
    const duplicados = [];
    const avisos = []; // linhas criadas, mas com preço/quantidade que não bateu com nenhum formato reconhecido

    for (const { linha, numeroExcel } of comNome) {
      const nome = String(linha[idxNome]).trim();
      const chave = nome.toLowerCase();

      if (nomesExistentes.has(chave) || nomesVistosNestaImportacao.has(chave)) {
        duplicados.push({ linha: numeroExcel, nome });
        continue;
      }
      nomesVistosNestaImportacao.add(chave);

      const precoTexto = idxPreco !== -1 ? linha[idxPreco] : undefined;
      const qtdTexto = idxQtd !== -1 ? linha[idxQtd] : undefined;
      const precoNumero = idxPreco !== -1 ? paraNumeroBr(precoTexto) : 0;
      const qtdNumero = idxQtd !== -1 ? Math.round(paraNumeroBr(qtdTexto)) : 0;

      // Se a coluna existe e tinha algo escrito, mas paraNumeroBr não
      // conseguiu extrair um número válido (voltou 0 de um texto não-vazio
      // que não parece "0"), avisa em vez de simplesmente gravar 0 calado
      const precoTextoVazio = precoTexto === undefined || precoTexto === null || String(precoTexto).trim() === '';
      const qtdTextoVazio = qtdTexto === undefined || qtdTexto === null || String(qtdTexto).trim() === '';
      const precoSuspeito = !precoTextoVazio && precoNumero === 0 && !/^0([.,]0+)?$/.test(String(precoTexto).trim());
      const qtdSuspeita = !qtdTextoVazio && qtdNumero === 0 && !/^0$/.test(String(qtdTexto).trim());

      if (precoSuspeito || qtdSuspeita) {
        avisos.push({
          linha: numeroExcel,
          nome,
          motivo: [
            precoSuspeito ? `preço "${precoTexto}" não reconhecido, gravado como R$ 0,00` : null,
            qtdSuspeita ? `quantidade "${qtdTexto}" não reconhecida, gravada como 0` : null,
          ].filter(Boolean).join(' · '),
        });
      }

      paraCriar.push({
        empresaId: req.empresaId,
        nome,
        precoVenda: precoNumero,
        estoqueAtual: qtdNumero,
        categoria: 'OUTROS',
        revisado: false,
      });
    }

    // Roda tudo dentro de uma transação: se qualquer criação falhar no meio
    // (ex: erro de conexão com o banco), desfaz tudo em vez de deixar metade
    // dos produtos importados e metade não, sem ninguém saber quais faltaram
    let importados = 0;
    if (paraCriar.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const dados of paraCriar) {
          await tx.produto.create({ data: dados });
          importados += 1;
        }
      }, { timeout: 30000 });
    }

    res.status(201).json({
      importados,
      duplicadosIgnorados: duplicados.length,
      linhasSemNome: semNome.length,
      avisos, // preço/quantidade não reconhecidos - produto foi criado, mas vale revisar
      duplicados, // pra quem quiser conferir quais linhas foram ignoradas por já existir
      colunasDetectadas: {
        nome: cabecalhos[idxNome],
        quantidade: idxQtd !== -1 ? cabecalhos[idxQtd] : null,
        precoUnitario: idxPreco !== -1 ? cabecalhos[idxPreco] : null,
      },
    });
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao importar planilha. Nenhum produto foi criado (a importação inteira foi desfeita).', detalhe: erro.message });
  }
});

// Editar uma unidade de venda existente (ex: mudar o preço de um fardo) sem
// precisar apagar e recriar - apagar/recriar mudava o id e quebrava a
// referência em movimentações antigas que apontavam pra essa unidade
router.put('/unidades/:idUnidade', async (req, res) => {
  try {
    const unidade = await prisma.unidadeVenda.findFirst({
      where: { id: req.params.idUnidade },
      include: { produto: true },
    });
    if (!unidade || unidade.produto.empresaId !== req.empresaId) {
      return res.status(404).json({ erro: 'Forma de venda não encontrada' });
    }

    const { nome, quantidadeEmUnidades, precoVenda, precoCartao } = req.body;
    if (quantidadeEmUnidades !== undefined && Number(quantidadeEmUnidades) <= 0) {
      return res.status(400).json({ erro: 'A quantidade em unidades precisa ser maior que zero' });
    }
    if (precoVenda !== undefined && Number(precoVenda) <= 0) {
      return res.status(400).json({ erro: 'O preço de venda precisa ser maior que zero' });
    }

    const atualizada = await prisma.unidadeVenda.update({
      where: { id: req.params.idUnidade },
      data: {
        ...(nome !== undefined && { nome }),
        ...(quantidadeEmUnidades !== undefined && { quantidadeEmUnidades: Number(quantidadeEmUnidades) }),
        ...(precoVenda !== undefined && { precoVenda: Number(precoVenda) }),
        ...(precoCartao !== undefined && { precoCartao: precoCartao ? Number(precoCartao) : null }),
      },
    });
    res.json(atualizada);
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao atualizar unidade de venda', detalhe: erro.message });
  }
});

// Remover uma unidade de venda
router.delete('/unidades/:idUnidade', async (req, res) => {
  try {
    const unidade = await prisma.unidadeVenda.findFirst({
      where: { id: req.params.idUnidade },
      include: { produto: true },
    });
    if (!unidade || unidade.produto.empresaId !== req.empresaId) {
      return res.status(404).json({ erro: 'Forma de venda não encontrada' });
    }
    await prisma.unidadeVenda.delete({ where: { id: req.params.idUnidade } });
    res.status(204).send();
  } catch (erro) {
    res.status(500).json({ erro: 'Erro ao remover unidade de venda', detalhe: erro.message });
  }
});

module.exports = router;
