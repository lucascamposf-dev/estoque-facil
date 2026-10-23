import { db } from './db';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';

// --- Gestão do token de autenticação ---
export function salvarToken(token) {
  localStorage.setItem('token', token);
}

export function obterToken() {
  return localStorage.getItem('token');
}

export function removerToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('nomeUsuario');
  localStorage.removeItem('slugEmpresa');
}

export function salvarNomeUsuario(nome) {
  localStorage.setItem('nomeUsuario', nome);
}

export function obterNomeUsuario() {
  return localStorage.getItem('nomeUsuario') || '';
}

export function salvarSlugEmpresa(slug) {
  if (slug) localStorage.setItem('slugEmpresa', slug);
}

export function obterSlugEmpresa() {
  return localStorage.getItem('slugEmpresa') || '';
}

export function estaLogado() {
  return !!obterToken();
}

export function obterPapel() {
  const token = obterToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.papel || null; // 'ADMIN' ou 'FUNCIONARIO'
  } catch {
    return null;
  }
}

export function obterPermissoes() {
  const token = obterToken();
  if (!token) return { podeVerCaixa: false, podeVerEstoque: false };
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.papel === 'ADMIN') return { podeVerCaixa: true, podeVerEstoque: true };
    // As permissões vêm aninhadas em payload.permissoes (ver backend/src/routes/auth.js).
    // Se por algum motivo o token antigo não tiver esse campo, libera por padrão
    // (não trava ninguém até o funcionário fazer login de novo com o token certo)
    return {
      podeVerCaixa: payload.permissoes?.podeVerCaixa ?? true,
      podeVerEstoque: payload.permissoes?.podeVerEstoque ?? true,
    };
  } catch {
    return { podeVerCaixa: false, podeVerEstoque: false };
  }
}

async function chamarApi(caminho, opcoes = {}) {
  const token = obterToken();
  const resposta = await fetch(`${API_URL}${caminho}`, {
    ...opcoes,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opcoes.headers || {}),
    },
  });

  if (resposta.status === 401) {
    removerToken();
    if (!window.location.hash.includes('/login')) {
      window.location.href = '/#/login';
    }
    throw new Error('Sessão expirada');
  }

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    const erro = new Error(corpo.erro || `Erro na API: ${resposta.status}`);
    erro.status = resposta.status;
    throw erro;
  }

  if (resposta.status === 204) return null;
  return resposta.json();
}

export function estaOnline() {
  return navigator.onLine;
}

// Registra uma movimentação: grava local imediatamente e tenta mandar pro
// servidor na hora. Se não conseguir (offline), fica marcada como pendente
// e vai junto na próxima sincronização.
export async function registrarMovimentacaoOffline(movimentacao) {
  const registro = {
    ...movimentacao,
    sincronizado: 0,
    criadoEm: new Date().toISOString(),
  };
  const idLocal = await db.movimentacoes.add(registro);

  if (estaOnline()) {
    try {
      const resultado = await chamarApi('/movimentacoes', {
        method: 'POST',
        body: JSON.stringify(movimentacao),
      });
      await db.movimentacoes.update(idLocal, { sincronizado: 1 });
      return resultado;
    } catch {
      // Sem problema - fica pendente e a sincronização em lote pega depois
    }
  }

  return { idLocal };
}

// Registra uma venda inteira (carrinho): grava local imediatamente com todos
// os itens dentro do mesmo registro e tenta mandar pro servidor na hora como
// UMA chamada só (POST /vendas), em vez de uma chamada por item como era
// antes. Se não conseguir (offline), fica pendente e vai na sincronização.
export async function registrarVendaOffline(venda) {
  const registro = {
    ...venda,
    sincronizado: 0,
    criadoEm: new Date().toISOString(),
  };
  const idLocal = await db.vendas.add(registro);

  if (estaOnline()) {
    try {
      const resultado = await chamarApi('/vendas', {
        method: 'POST',
        body: JSON.stringify(venda),
      });
      await db.vendas.update(idLocal, { sincronizado: 1 });
      return resultado;
    } catch {
      // Sem problema - fica pendente e a sincronização em lote pega depois
    }
  }

  return { idLocal };
}

async function sincronizarMovimentacoesPendentes() {
  const pendentes = await db.movimentacoes.where('sincronizado').equals(0).toArray();
  if (pendentes.length === 0) return 0;

  const { resultados } = await chamarApi('/movimentacoes/sincronizar', {
    method: 'POST',
    body: JSON.stringify({ movimentacoes: pendentes }),
  });

  for (const r of resultados) {
    const registro = pendentes.find((p) => p.idLocal === r.idLocal);
    if (!registro) continue;

    if (r.status === 'sincronizado' || r.status === 'ja_existia') {
      await db.movimentacoes.update(registro.id, { sincronizado: 1 });
    } else if (r.status === 'erro') {
      // Erro permanente (ex: produto ou empresa foi excluída) - marca como
      // "falha" (2) em vez de deixar em loop infinito tentando sincronizar
      // um registro que nunca vai conseguir. Fica fora da contagem de pendentes.
      await db.movimentacoes.update(registro.id, { sincronizado: 2, erroSincronizacao: r.detalhe });
    }
  }

  return resultados.length;
}

async function sincronizarVendasPendentes() {
  const pendentes = await db.vendas.where('sincronizado').equals(0).toArray();
  if (pendentes.length === 0) return 0;

  const { resultados } = await chamarApi('/vendas/sincronizar', {
    method: 'POST',
    body: JSON.stringify({ vendas: pendentes }),
  });

  for (const r of resultados) {
    const registro = pendentes.find((p) => p.idLocal === r.idLocal);
    if (!registro) continue;

    if (r.status === 'sincronizado' || r.status === 'ja_existia') {
      await db.vendas.update(registro.id, { sincronizado: 1 });
    } else if (r.status === 'erro') {
      await db.vendas.update(registro.id, { sincronizado: 2, erroSincronizacao: r.detalhe });
    }
  }

  return resultados.length;
}

export async function sincronizarPendentes() {
  if (!estaOnline()) return { sincronizadas: 0 };

  const [movimentacoes, vendas] = await Promise.all([
    sincronizarMovimentacoesPendentes(),
    sincronizarVendasPendentes(),
  ]);

  return { sincronizadas: movimentacoes + vendas };
}

// Envia pro servidor os produtos criados offline (pendenteEnvio) antes de puxar
// a lista atualizada - senão eles ficam presos no aparelho pra sempre.
export async function importarPlanilhaProdutos(arquivo) {
  const token = obterToken();
  const formData = new FormData();
  formData.append('planilha', arquivo);

  const resposta = await fetch(`${API_URL}/produtos/importar`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    const erro = new Error(corpo.erro || `Erro na API: ${resposta.status}`);
    erro.status = resposta.status;
    throw erro;
  }

  return resposta.json();
}

export async function enviarProdutosPendentes() {
  if (!estaOnline()) return;
  const pendentes = await db.produtos.filter((p) => p.pendenteEnvio === true).toArray();

  for (const p of pendentes) {
    try {
      const { pendenteEnvio, id, ...dadosProduto } = p;
      const criado = await chamarApi('/produtos', {
        method: 'POST',
        body: JSON.stringify(dadosProduto),
      });
      await db.produtos.update(id, { ...criado, servidorId: criado.id, pendenteEnvio: false });
    } catch {
      // Sem problema - continua pendente e tenta de novo na próxima sincronização
    }
  }
}

export async function sincronizarProdutos() {
  if (!estaOnline()) return;
  await enviarProdutosPendentes();
  const produtosServidor = await chamarApi('/produtos');
  const idsAtivosNoServidor = new Set(produtosServidor.map((p) => p.id));

  for (const p of produtosServidor) {
    const existente = await db.produtos.where('servidorId').equals(p.id).first();
    const dados = { ...p, servidorId: p.id };
    if (existente) {
      await db.produtos.update(existente.id, dados);
    } else {
      await db.produtos.add(dados);
    }
  }

  // Remove do IndexedDB os produtos que já vieram do servidor antes mas foram
  // desativados/excluídos lá - senão ficam "fantasmas" pra sempre no app offline.
  const todosLocais = await db.produtos.toArray();
  for (const local of todosLocais) {
    if (local.servidorId && !idsAtivosNoServidor.has(local.servidorId)) {
      await db.produtos.delete(local.id);
    }
  }
}

export async function listarProdutosLocal() {
  return db.produtos.orderBy('nome').toArray();
}

export async function contarPendentes() {
  return db.movimentacoes.where('sincronizado').equals(0).count();
}

export async function registrarSangria({ valor, motivo }) {
  return chamarApi('/sangrias', { method: 'POST', body: JSON.stringify({ valor, motivo }) });
}

export async function registrarSuprimento({ valor, motivo }) {
  return chamarApi('/suprimentos', { method: 'POST', body: JSON.stringify({ valor, motivo }) });
}

// Admin define/troca o PIN de 4 dígitos usado na Baixa Rápida (QR code na prateleira)
export async function definirPinBaixaRapida(pin) {
  return chamarApi('/baixa-rapida/definir-pin', {
    method: 'PUT',
    body: JSON.stringify({ pin }),
  });
}

export { chamarApi };