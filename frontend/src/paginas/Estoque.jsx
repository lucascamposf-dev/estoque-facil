import { useEffect, useState, useRef } from 'react';
import { listarProdutosLocal, sincronizarProdutos, chamarApi, estaOnline, obterSlugEmpresa, importarPlanilhaProdutos } from '../api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import QRCode from 'qrcode';

const CATEGORIAS = [
  { valor: '', rotulo: 'Todas' },
  { valor: 'CERVEJA', rotulo: 'Cerveja' },
  { valor: 'REFRIGERANTE', rotulo: 'Refrigerante' },
  { valor: 'AGUA', rotulo: 'Água' },
  { valor: 'ENERGETICO', rotulo: 'Energético' },
  { valor: 'DESTILADO', rotulo: 'Destilado' },
  { valor: 'OUTROS', rotulo: 'Outros' },
];

function alertaValidade(p) {
  if (!p.dataValidade) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validade = new Date(p.dataValidade);
  validade.setHours(0, 0, 0, 0);
  const dias = Math.floor((validade - hoje) / 86400000);
  const janela = p.diasAlertaValidade ?? 7;

  if (dias < 0) return { nivel: 'vencido', texto: `Vencido há ${Math.abs(dias)}d` };
  if (dias <= janela) return { nivel: 'vencendo', texto: dias === 0 ? 'Vence hoje' : `Vence em ${dias}d` };
  return null;
}

export default function Estoque() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [produtos, setProdutos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [filtroCategoria, setFiltroCategoria] = useState('');

  const [produtoAberto, setProdutoAberto] = useState(null);
  const [unidades, setUnidades] = useState([]);
  const [carregandoUnidades, setCarregandoUnidades] = useState(false);
  const [erroUnidades, setErroUnidades] = useState('');

  const [novoNome, setNovoNome] = useState('');
  const [novaQtd, setNovaQtd] = useState('');
  const [novoPreco, setNovoPreco] = useState('');
  const [novoPrecoCartao, setNovoPrecoCartao] = useState('');
  const [salvandoUnidade, setSalvandoUnidade] = useState(false);

  const [editandoUnidadeId, setEditandoUnidadeId] = useState(null);
  const [edicaoUnidade, setEdicaoUnidade] = useState({ nome: '', quantidadeEmUnidades: '', precoVenda: '', precoCartao: '' });
  const [salvandoEdicaoUnidade, setSalvandoEdicaoUnidade] = useState(false);

  const [produtoQr, setProdutoQr] = useState(null);
  const canvasQrRef = useRef(null);

  const [abrindoDoseId, setAbrindoDoseId] = useState(null);
  const [erroDose, setErroDose] = useState('');

  const [relatorioValidade, setRelatorioValidade] = useState(null);
  const [mostrarRelatorioValidade, setMostrarRelatorioValidade] = useState(false);

  const [importando, setImportando] = useState(false);
  const [erroImportacao, setErroImportacao] = useState('');
  const [mensagemImportacao, setMensagemImportacao] = useState(null);
  const inputPlanilhaRef = useRef(null);

  async function aoSelecionarPlanilha(e) {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;

    setImportando(true);
    setErroImportacao('');
    setMensagemImportacao(null);
    try {
      const resultado = await importarPlanilhaProdutos(arquivo);
      setMensagemImportacao(resultado);
      await carregar();
    } catch (erro) {
      setErroImportacao(erro.status === 400 ? erro.message : 'Não foi possível importar a planilha. Tente novamente.');
    } finally {
      setImportando(false);
    }
  }

  useEffect(() => {
    if (!produtoQr || !canvasQrRef.current) return;
    const slug = obterSlugEmpresa();
    const url = `${window.location.origin}${window.location.pathname}#/baixa-rapida/${slug}/${produtoQr.servidorId}?nome=${encodeURIComponent(produtoQr.nome)}`;
    QRCode.toCanvas(canvasQrRef.current, url, { width: 220, margin: 1 }).catch(() => {});
  }, [produtoQr]);

  function baixarImagemQr() {
    if (!canvasQrRef.current || !produtoQr) return;
    const link = document.createElement('a');
    link.download = `qr-${produtoQr.nome.replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = canvasQrRef.current.toDataURL('image/png');
    link.click();
  }

  async function carregarRelatorioValidade() {
    if (!estaOnline()) return;
    try {
      const dados = await chamarApi('/relatorios/validade');
      setRelatorioValidade(dados);
    } catch {
      // Sem esse relatório, a tela segue funcionando normalmente com o resto
    }
  }

  async function carregar() {
    setCarregando(true);
    await sincronizarProdutos().catch(() => {});
    const lista = await listarProdutosLocal();
    setProdutos(lista);
    setCarregando(false);
    carregarRelatorioValidade();
  }

  useEffect(() => {
    carregar();
  }, []);

  // Se veio do cadastro de produto com ?abrir=ID, abre esse produto
  // automaticamente assim que a lista terminar de carregar
  useEffect(() => {
    const idParaAbrir = searchParams.get('abrir');
    if (!idParaAbrir || carregando || produtos.length === 0) return;
    const produto = produtos.find((p) => p.servidorId === idParaAbrir);
    if (produto) {
      abrirProduto(produto);
      setSearchParams({}, { replace: true });
    }
  }, [carregando, produtos, searchParams]);

  async function abrirProduto(produto) {
    if (produtoAberto === produto.id) {
      setProdutoAberto(null);
      setUnidades([]);
      setErroUnidades('');
      cancelarEdicaoUnidade();
      return;
    }
    setProdutoAberto(produto.id);
    setErroUnidades('');
    setUnidades([]);
    cancelarEdicaoUnidade();

    if (!estaOnline()) {
      setErroUnidades('Gerenciar formas de venda precisa de internet.');
      return;
    }
    if (!produto.servidorId) {
      setErroUnidades('Este produto ainda não sincronizou com o servidor. Aguarde a sincronização automática (acontece sozinha quando há internet) e tente de novo.');
      return;
    }
    setCarregandoUnidades(true);
    try {
      const lista = await chamarApi(`/produtos/${produto.servidorId}/unidades`);
      setUnidades(lista);
    } catch (erro) {
      setErroUnidades(erro.status === 401 ? 'Sua sessão expirou. Faça login de novo.' : 'Não foi possível carregar as formas de venda.');
    } finally {
      setCarregandoUnidades(false);
    }
  }

  async function adicionarUnidade(produto) {
    if (!novoNome.trim() || !novaQtd || !novoPreco) return;
    if (!produto.servidorId) {
      setErroUnidades('Este produto ainda não sincronizou com o servidor. Aguarde a sincronização automática e tente de novo.');
      return;
    }
    setSalvandoUnidade(true);
    try {
      await chamarApi(`/produtos/${produto.servidorId}/unidades`, {
        method: 'POST',
        body: JSON.stringify({
          nome: novoNome,
          quantidadeEmUnidades: Number(novaQtd),
          precoVenda: Number(novoPreco),
          precoCartao: novoPrecoCartao ? Number(novoPrecoCartao) : null,
        }),
      });
      setNovoNome('');
      setNovaQtd('');
      setNovoPreco('');
      setNovoPrecoCartao('');
      const lista = await chamarApi(`/produtos/${produto.servidorId}/unidades`);
      setUnidades(lista);
    } catch (erro) {
      if (erro.status === 401) setErroUnidades('Sua sessão expirou. Faça login de novo.');
      else if (erro.status === 400) setErroUnidades(erro.message);
      else setErroUnidades('Não foi possível salvar. Tente novamente.');
    } finally {
      setSalvandoUnidade(false);
    }
  }

  async function removerUnidade(unidadeId) {
    try {
      await chamarApi(`/produtos/unidades/${unidadeId}`, { method: 'DELETE' });
      setUnidades((u) => u.filter((x) => x.id !== unidadeId));
    } catch {
      setErroUnidades('Não foi possível remover.');
    }
  }

  async function abrirGarrafaParaDoses(produto) {
    if (!produto.servidorId) {
      setErroDose('Este produto ainda não sincronizou com o servidor. Aguarde e tente de novo.');
      return;
    }
    if (!window.confirm(`Abrir 1 unidade de "${produto.nome}" e transformar em ${produto.dosesPorUnidade} doses avulsas?`)) {
      return;
    }
    setAbrindoDoseId(produto.id);
    setErroDose('');
    try {
      await chamarApi(`/produtos/${produto.servidorId}/abrir-dose`, {
        method: 'POST',
        body: JSON.stringify({ quantidadeUnidades: 1 }),
      });
      await carregar();
    } catch (erro) {
      setErroDose(erro.status === 400 ? erro.message : 'Não foi possível abrir a garrafa pra doses. Tente novamente.');
    } finally {
      setAbrindoDoseId(null);
    }
  }

  function iniciarEdicaoUnidade(u) {
    setEditandoUnidadeId(u.id);
    setEdicaoUnidade({
      nome: u.nome,
      quantidadeEmUnidades: String(u.quantidadeEmUnidades),
      precoVenda: String(u.precoVenda),
      precoCartao: u.precoCartao ? String(u.precoCartao) : '',
    });
  }

  function cancelarEdicaoUnidade() {
    setEditandoUnidadeId(null);
    setEdicaoUnidade({ nome: '', quantidadeEmUnidades: '', precoVenda: '', precoCartao: '' });
  }

  async function salvarEdicaoUnidade(unidadeId) {
    if (!edicaoUnidade.nome.trim() || !edicaoUnidade.quantidadeEmUnidades || !edicaoUnidade.precoVenda) return;
    setSalvandoEdicaoUnidade(true);
    try {
      const atualizada = await chamarApi(`/produtos/unidades/${unidadeId}`, {
        method: 'PUT',
        body: JSON.stringify({
          nome: edicaoUnidade.nome,
          quantidadeEmUnidades: Number(edicaoUnidade.quantidadeEmUnidades),
          precoVenda: Number(edicaoUnidade.precoVenda),
          precoCartao: edicaoUnidade.precoCartao ? Number(edicaoUnidade.precoCartao) : null,
        }),
      });
      setUnidades((lista) => lista.map((u) => (u.id === unidadeId ? atualizada : u)));
      cancelarEdicaoUnidade();
    } catch (erro) {
      setErroUnidades(erro.status === 400 ? erro.message : 'Não foi possível salvar as alterações.');
    } finally {
      setSalvandoEdicaoUnidade(false);
    }
  }

  function abrirProdutoDoRelatorioValidade(servidorId) {
    const produto = produtos.find((p) => p.servidorId === servidorId);
    if (!produto) return;
    setMostrarRelatorioValidade(false);
    if (produtoAberto !== produto.id) abrirProduto(produto);
  }

  const produtosFiltrados = filtroCategoria
    ? produtos.filter((p) => (p.categoria || 'OUTROS') === filtroCategoria)
    : produtos;

  const zerados = produtosFiltrados.filter((p) => p.estoqueAtual <= 0);
  const acabando = produtosFiltrados.filter((p) => p.estoqueAtual > 0 && p.estoqueAtual <= p.estoqueMinimo);
  const resto = produtosFiltrados.filter((p) => p.estoqueAtual > p.estoqueMinimo);

  function renderProduto(p) {
    const aberto = produtoAberto === p.id;
    const zerado = p.estoqueAtual <= 0;
    const baixo = !zerado && p.estoqueAtual <= p.estoqueMinimo;
    const nivel = zerado ? 'estoque-zerado' : baixo ? 'estoque-baixo' : '';
    const alerta = alertaValidade(p);
    return (
      <div key={p.id} className="cartao cartao-produto" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', width: '100%', cursor: 'pointer' }}
          onClick={() => abrirProduto(p)}
        >
          <div className="foto-produto">
  {p.fotoUrl ? (
    <img src={p.fotoUrl} alt={p.nome} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
  ) : (
    '🍾'
  )}
</div>
          <div className="info-produto">
            <div className="nome">{p.nome}</div>
            <div className="detalhe">{baixo ? `Mínimo: ${p.estoqueMinimo}` : `R$ ${Number(p.precoVenda).toFixed(2)}`}</div>
            {alerta && (
              <div className={`badge-validade ${alerta.nivel === 'vencido' ? 'badge-vencido' : 'badge-vencendo'}`}>
                {alerta.texto}
              </div>
            )}
            {p.revisado === false && (
              <div className="badge-validade badge-vencendo">
                ⚠️ Revisar
              </div>
            )}
          </div>
          <div className={`estoque-numero ${baixo ? 'estoque-baixo' : ''}`}>{p.estoqueAtual}</div>
        </div>

        {aberto && (
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p className="subtexto" style={{ margin: 0 }}>
                {p.codigoBarras ? `Código de barras: ${p.codigoBarras}` : 'Sem código de barras cadastrado'}
              </p>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  className="botao-primario pequeno neutro"
                  style={{ width: 'auto' }}
                  onClick={(e) => { e.stopPropagation(); setProdutoQr(p); }}
                  disabled={!p.servidorId}
                  title={!p.servidorId ? 'Aguarde sincronizar pra gerar o QR code' : ''}
                >
                  🔳 QR Code
                </button>
                <button
                  className="botao-primario pequeno neutro"
                  style={{ width: 'auto' }}
                  onClick={(e) => { e.stopPropagation(); navigate(`/editar-produto/${p.servidorId}`, { state: { produto: p } }); }}
                  disabled={!p.servidorId}
                  title={!p.servidorId ? 'Aguarde sincronizar pra editar' : ''}
                >
                  ✏️ Editar
                </button>
              </div>
            </div>

            {p.vendeDose && (
              <div className="cartao" style={{ marginBottom: 12, padding: '10px 14px', flexDirection: 'column', alignItems: 'stretch', background: 'rgba(255,193,7,0.1)' }}>
                <p style={{ margin: 0, fontWeight: 700 }}>🥃 Doses</p>
                <p style={{ margin: '2px 0 8px', fontSize: 13, opacity: 0.85 }}>
                  {p.estoqueDoses || 0} dose(s) avulsa(s) em estoque · R$ {Number(p.precoDose || 0).toFixed(2)} cada
                </p>
                {erroDose && <p className="erro-texto" style={{ marginBottom: 8 }}>{erroDose}</p>}
                <button
                  className="botao-primario pequeno neutro"
                  style={{ width: 'auto' }}
                  onClick={(e) => { e.stopPropagation(); abrirGarrafaParaDoses(p); }}
                  disabled={abrindoDoseId === p.id || p.estoqueAtual <= 0}
                  title={p.estoqueAtual <= 0 ? 'Sem unidades fechadas no estoque pra abrir' : ''}
                >
                  {abrindoDoseId === p.id ? 'Abrindo...' : `🍾 Abrir garrafa (+${p.dosesPorUnidade || 0} doses)`}
                </button>
              </div>
            )}

            <p style={{ fontWeight: 700, marginBottom: 8 }}>Formas de venda (fardo, caixa...)</p>

            {erroUnidades && <p className="erro-texto">{erroUnidades}</p>}
            {carregandoUnidades && <p className="subtexto">Carregando...</p>}

            {!carregandoUnidades && !erroUnidades && unidades.length === 0 && (
              <p className="subtexto">Só vendido na unidade base por enquanto.</p>
            )}

            {unidades.map((u) => (
              <div key={u.id} className="linha-forma-pagamento" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                {editandoUnidadeId === u.id ? (
                  <div style={{ padding: '6px 0' }}>
                    <label className="rotulo-campo">Nome</label>
                    <input value={edicaoUnidade.nome} onChange={(e) => setEdicaoUnidade({ ...edicaoUnidade, nome: e.target.value })} />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <label className="rotulo-campo">Qtd. de unidades</label>
                        <input type="number" min="1" value={edicaoUnidade.quantidadeEmUnidades} onChange={(e) => setEdicaoUnidade({ ...edicaoUnidade, quantidadeEmUnidades: e.target.value })} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="rotulo-campo">Preço (R$)</label>
                        <input type="number" step="0.01" value={edicaoUnidade.precoVenda} onChange={(e) => setEdicaoUnidade({ ...edicaoUnidade, precoVenda: e.target.value })} />
                      </div>
                    </div>
                    <label className="rotulo-campo">Preço no cartão (opcional)</label>
                    <input type="number" step="0.01" placeholder="Deixe em branco pra usar o preço normal" value={edicaoUnidade.precoCartao} onChange={(e) => setEdicaoUnidade({ ...edicaoUnidade, precoCartao: e.target.value })} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <button className="botao-primario pequeno" style={{ flex: 1 }} disabled={salvandoEdicaoUnidade} onClick={() => salvarEdicaoUnidade(u.id)}>
                        {salvandoEdicaoUnidade ? 'Salvando...' : 'Salvar'}
                      </button>
                      <button className="botao-primario pequeno neutro" style={{ flex: 1 }} onClick={cancelarEdicaoUnidade}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                    <span>
                      {u.nome} · {u.quantidadeEmUnidades} un.
                      {u.precoCartao && <span style={{ opacity: 0.7, fontSize: 12 }}> (cartão: R$ {Number(u.precoCartao).toFixed(2)})</span>}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <strong>R$ {Number(u.precoVenda).toFixed(2)}</strong>
                      <button
                        className="botao-primario pequeno neutro"
                        style={{ padding: '2px 8px' }}
                        onClick={() => iniciarEdicaoUnidade(u)}
                      >
                        Editar
                      </button>
                      <button
                        className="botao-primario pequeno neutro"
                        style={{ padding: '2px 8px' }}
                        onClick={() => removerUnidade(u.id)}
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {!erroUnidades && (
              <div style={{ marginTop: 10 }}>
                <label className="rotulo-campo">Nome (ex: Fardo 12 un)</label>
                <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Fardo (12 un)" />
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label className="rotulo-campo">Qtd. de unidades</label>
                    <input type="number" min="1" value={novaQtd} onChange={(e) => setNovaQtd(e.target.value)} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label className="rotulo-campo">Preço (R$)</label>
                    <input type="number" step="0.01" value={novoPreco} onChange={(e) => setNovoPreco(e.target.value)} />
                  </div>
                </div>
                <label className="rotulo-campo">Preço no cartão (opcional)</label>
                <input type="number" step="0.01" placeholder="Deixe em branco pra usar o preço normal" value={novoPrecoCartao} onChange={(e) => setNovoPrecoCartao(e.target.value)} />
                <button className="botao-primario pequeno" disabled={salvandoUnidade} onClick={() => adicionarUnidade(p)}>
                  {salvandoUnidade ? 'Salvando...' : '+ Adicionar forma de venda'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="cartao-cabecalho" style={{ marginBottom: 12 }}>
        <h2 className="titulo-secao" style={{ margin: 0 }}>Estoque</h2>
        <button className="botao-primario pequeno" onClick={() => navigate('/cadastrar-produto')}>
          + Produto
        </button>
        <button
          className="botao-primario pequeno neutro"
          onClick={() => inputPlanilhaRef.current?.click()}
          disabled={importando}
        >
          {importando ? 'Importando...' : '📥 Importar planilha'}
        </button>
        <button className="botao-primario pequeno neutro" onClick={() => navigate('/historico')}>
        Histórico
      </button>
      <input
        ref={inputPlanilhaRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={aoSelecionarPlanilha}
      />

      </div>

      {erroImportacao && <p className="erro-texto">{erroImportacao}</p>}
      {mensagemImportacao && (
        <div className="cartao" style={{ background: 'rgba(255,193,7,0.15)', marginBottom: 12 }}>
          <p style={{ margin: 0, fontSize: 14 }}>
            ✅ {mensagemImportacao.importados} produto{mensagemImportacao.importados !== 1 ? 's' : ''} importado{mensagemImportacao.importados !== 1 ? 's' : ''}.
            {' '}Atualize a página, verifique os preços e edite foto, preço e quantidade dos fardos de cada item.
          </p>

          {mensagemImportacao.duplicadosIgnorados > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.85 }}>
              ⏭️ {mensagemImportacao.duplicadosIgnorados} linha{mensagemImportacao.duplicadosIgnorados !== 1 ? 's' : ''} ignorada{mensagemImportacao.duplicadosIgnorados !== 1 ? 's' : ''} por já existir produto com esse nome:
              {' '}{mensagemImportacao.duplicados.map((d) => d.nome).join(', ')}
            </p>
          )}

          {mensagemImportacao.linhasSemNome > 0 && (
            <p style={{ margin: '8px 0 0', fontSize: 13, opacity: 0.85 }}>
              ⏭️ {mensagemImportacao.linhasSemNome} linha{mensagemImportacao.linhasSemNome !== 1 ? 's' : ''} sem nome de produto foi{mensagemImportacao.linhasSemNome !== 1 ? 'ram' : ''} ignorada{mensagemImportacao.linhasSemNome !== 1 ? 's' : ''}.
            </p>
          )}

          {mensagemImportacao.avisos.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>
                ⚠️ {mensagemImportacao.avisos.length} produto{mensagemImportacao.avisos.length !== 1 ? 's' : ''} importado{mensagemImportacao.avisos.length !== 1 ? 's' : ''} com preço/quantidade não reconhecido — revise:
              </p>
              {mensagemImportacao.avisos.map((a) => (
                <p key={a.linha} style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.8 }}>
                  Linha {a.linha} ({a.nome}): {a.motivo}
                </p>
              ))}
            </div>
          )}

          <button
            className="botao-primario pequeno neutro"
            style={{ marginTop: 8, width: 'auto' }}
            onClick={() => setMensagemImportacao(null)}
          >
            Entendi
          </button>
        </div>
      )}

      {relatorioValidade && (relatorioValidade.vencidos.length > 0 || relatorioValidade.vencendo.length > 0) && (
        <div className="cartao" style={{ background: 'rgba(255,107,107,0.12)', marginBottom: 12 }}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
            onClick={() => setMostrarRelatorioValidade((v) => !v)}
          >
            <p style={{ margin: 0, fontWeight: 700 }}>
              ⏰ Validade: {relatorioValidade.vencidos.length} vencido{relatorioValidade.vencidos.length !== 1 ? 's' : ''}
              {relatorioValidade.vencendo.length > 0 && `, ${relatorioValidade.vencendo.length} vencendo`}
            </p>
            <span style={{ fontSize: 13, opacity: 0.75 }}>{mostrarRelatorioValidade ? 'Ocultar' : 'Ver'}</span>
          </div>

          {mostrarRelatorioValidade && (
            <div style={{ marginTop: 10 }}>
              {[...relatorioValidade.vencidos, ...relatorioValidade.vencendo].map((p) => (
                <div
                  key={p.id}
                  className="linha-forma-pagamento"
                  style={{ cursor: 'pointer' }}
                  onClick={() => abrirProdutoDoRelatorioValidade(p.id)}
                >
                  <span>{p.nome} · {p.estoqueAtual} un.</span>
                  <strong style={{ color: p.status === 'vencido' ? '#ff6b6b' : '#ffc107' }}>
                    {p.status === 'vencido'
                      ? `Vencido há ${Math.abs(p.diasRestantes)}d`
                      : p.diasRestantes === 0
                        ? 'Vence hoje'
                        : `Vence em ${p.diasRestantes}d`}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="select-forma-pagamento" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        {CATEGORIAS.map((c) => (
          <button
            key={c.valor}
            className={`chip-categoria ${filtroCategoria === c.valor ? 'ativo' : ''}`}
            onClick={() => setFiltroCategoria(c.valor)}
          >
            {c.rotulo}
          </button>
        ))}
      </div>

      {carregando && produtos.length === 0 && <p className="vazio">Carregando...</p>}

      {zerados.length > 0 && (
        <>
          <p style={{ fontSize: 13, color: '#ff6b6b', fontWeight: 700, marginBottom: 8 }}>
            🔴 Zerado ({zerados.length})
          </p>
          {zerados.map(renderProduto)}
        </>
      )}

      {acabando.length > 0 && (
        <>
          <p style={{ fontSize: 13, color: '#ffb4b4', fontWeight: 600, marginBottom: 8 }}>
            ⚠️ Acabando ({acabando.length})
          </p>
          {acabando.map(renderProduto)}
        </>
      )}

      {resto.length > 0 && (
        <>
          <p style={{ fontSize: 13, opacity: 0.7, fontWeight: 600, margin: '16px 0 8px' }}>
            Todos os produtos
          </p>
          {resto.map(renderProduto)}
        </>
      )}

      {!carregando && produtosFiltrados.length === 0 && (
        <p className="vazio">
          {filtroCategoria ? 'Nenhum produto nessa categoria.' : (
            <>
              Nenhum produto cadastrado ainda.
              <br />
              <a href="#/cadastrar-produto" style={{ color: 'var(--ambar)' }}>
                Cadastrar o primeiro produto
              </a>
            </>
          )}
        </p>
      )}

      {produtoQr && (
        <div className="overlay-seletor" onClick={() => setProdutoQr(null)}>
          <div className="cartao-seletor" style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <p style={{ fontWeight: 700, marginBottom: 4 }}>{produtoQr.nome}</p>
            <p className="subtexto" style={{ marginBottom: 12 }}>
              Cole essa etiqueta na prateleira. Ao escanear, abre direto a baixa rápida desse produto.
            </p>
            <canvas ref={canvasQrRef} style={{ background: '#fff', borderRadius: 8, padding: 8 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="botao-primario pequeno" style={{ flex: 1 }} onClick={baixarImagemQr}>
                Baixar imagem
              </button>
              <button className="botao-primario pequeno neutro" style={{ flex: 1 }} onClick={() => setProdutoQr(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}