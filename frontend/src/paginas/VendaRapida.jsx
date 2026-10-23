import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { listarProdutosLocal, sincronizarProdutos, registrarVendaOffline, estaOnline, chamarApi } from '../api';
import { db, gerarIdLocal } from '../db';
import LeitorCodigoBarras from '../componentes/LeitorCodigoBarras';

const FORMAS = [
  { valor: 'DINHEIRO', rotulo: 'Dinheiro' },
  { valor: 'PIX', rotulo: 'Pix' },
  { valor: 'DEBITO', rotulo: 'Débito' },
  { valor: 'CREDITO', rotulo: 'Crédito' },
  { valor: 'FIADO', rotulo: 'Fiado' },
];

// Se a forma de pagamento for crédito ou débito e o item tiver um preço de
// cartão cadastrado, usa ele. Senão, cai no preço normal - sem erro no caixa.
// O QR code gerado na tela de Estoque codifica uma URL tipo
// ".../#/baixa-rapida/{slug}/{produtoId}?nome=...". Se o texto lido bater
// com esse padrão, extrai o produtoId; senão, é um código de barras normal.
function extrairProdutoIdDoQr(textoLido) {
  const match = textoLido.match(/\/baixa-rapida\/[^/]+\/([^/?]+)/);
  return match ? match[1] : null;
}

function precoEfetivo(produto, unidadeVenda, formaPagamento, ehDose) {
  const usaCartao = formaPagamento === 'CREDITO' || formaPagamento === 'DEBITO';
  if (ehDose) {
    if (usaCartao && produto.precoDoseCartao) return Number(produto.precoDoseCartao);
    return Number(produto.precoDose);
  }
  const base = unidadeVenda || produto;
  if (usaCartao && base.precoCartao) return Number(base.precoCartao);
  return Number(unidadeVenda ? unidadeVenda.precoVenda : produto.precoVenda);
}

function vibrar(ms = 25) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

function tocarBip() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const ganho = ctx.createGain();
    osc.connect(ganho);
    ganho.connect(ctx.destination);
    osc.frequency.value = 880;
    ganho.gain.setValueAtTime(0.15, ctx.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // Sem suporte a áudio no navegador - segue sem som, sem quebrar nada
  }
}

export default function VendaRapida() {
  const navigate = useNavigate();
  const location = useLocation();
  const [produtos, setProdutos] = useState([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(true);
  const [erroSincronizacao, setErroSincronizacao] = useState('');
  const [busca, setBusca] = useState('');
  const [carrinho, setCarrinho] = useState({}); // chave -> { produto, unidadeVenda, qtd }
  const [formaPagamento, setFormaPagamento] = useState('DINHEIRO');
  const [finalizando, setFinalizando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [mostrarLeitor, setMostrarLeitor] = useState(false);

  const [clientesFiado, setClientesFiado] = useState([]);
  const [clienteFiadoId, setClienteFiadoId] = useState('');

  const [unidadesPorProduto, setUnidadesPorProduto] = useState({});
  const [seletorUnidade, setSeletorUnidade] = useState(null);

  const [editandoPrecoChave, setEditandoPrecoChave] = useState(null);
  const [precoEditado, setPrecoEditado] = useState('');

  async function carregarProdutos() {
    setCarregandoProdutos(true);
    setErroSincronizacao('');

    try {
      if (estaOnline()) {
        try {
          await sincronizarProdutos();
        } catch {
          setErroSincronizacao('Não foi possível atualizar os produtos com o servidor agora. Mostrando o que está salvo neste aparelho.');
        }
      }

      const lista = await listarProdutosLocal();
      const disponiveis = lista.filter((p) => p.servidorId);

      // Coloca os mais vendidos hoje no topo da grade, pra funcionário achar rápido.
      // Best-effort: se essa consulta falhar por qualquer motivo, não deve travar a tela.
      let contagem = {};
      try {
        const hoje = new Date().toISOString().slice(0, 10);
        const vendasHoje = await db.movimentacoes.where('tipo').equals('SAIDA').toArray();
        for (const v of vendasHoje) {
          if (v.criadoEm?.slice(0, 10) === hoje) {
            contagem[v.produtoId] = (contagem[v.produtoId] || 0) + v.quantidade;
          }
        }
      } catch {
        // sem ranking de mais vendidos hoje - segue com a lista em ordem alfabética
      }

      disponiveis.sort(
        (a, b) => (contagem[b.servidorId] || 0) - (contagem[a.servidorId] || 0) || a.nome.localeCompare(b.nome)
      );

      setProdutos(disponiveis);
    } finally {
      setCarregandoProdutos(false);
    }
  }

  useEffect(() => {
    carregarProdutos();
  }, []);

  // Veio de um QR code escaneado na prateleira (baixa rápida) - abre direto
  // as opções de venda desse produto assim que a lista terminar de carregar
  useEffect(() => {
    const idParaAbrir = location.state?.produtoIdParaAbrir;
    if (!idParaAbrir || carregandoProdutos || produtos.length === 0) return;
    const produto = produtos.find((p) => p.servidorId === idParaAbrir);
    if (produto) {
      setSeletorUnidade(produto);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [carregandoProdutos, produtos, location.state, location.pathname, navigate]);

  useEffect(() => {
    if (estaOnline()) {
      chamarApi('/clientes-fiado').then(setClientesFiado).catch(() => {});
    }
  }, []);

  // Busca (best-effort) quais produtos têm fardo/caixa cadastrado, pra mostrar o atalho na grade
  useEffect(() => {
    async function carregarUnidades() {
      if (!estaOnline() || produtos.length === 0) return;
      const mapa = {};
      await Promise.all(
        produtos.map(async (p) => {
          try {
            const lista = await chamarApi(`/produtos/${p.servidorId}/unidades`);
            if (lista.length > 0) mapa[p.servidorId] = lista;
          } catch {
            // sem unidades cadastradas pra esse produto, segue normal
          }
        })
      );
      setUnidadesPorProduto(mapa);
    }
    carregarUnidades();
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return produtos;
    return produtos.filter(
      (p) =>
        p.nome.toLowerCase().includes(termo) ||
        (p.codigoBarras && p.codigoBarras.toLowerCase().includes(termo))
    );
  }, [produtos, busca]);

  function adicionar(produto, unidadeVenda = null, ehDose = false) {
    vibrar();
    const chave = ehDose ? `${produto.id}_dose` : (unidadeVenda ? `${produto.id}_${unidadeVenda.id}` : `${produto.id}_base`);
    setCarrinho((c) => {
      const atual = c[chave];
      return {
        ...c,
        [chave]: { produto, unidadeVenda, ehDose, qtd: (atual?.qtd || 0) + 1 },
      };
    });
  }

  function alterarQtd(chave, delta) {
    setCarrinho((c) => {
      const item = c[chave];
      if (!item) return c;
      const novaQtd = item.qtd + delta;
      if (novaQtd <= 0) {
        // Item com quantidade alta sendo zerado de uma vez (ex: toque sem querer) -
        // confirma antes de tirar do carrinho pra evitar retrabalho
        if (item.qtd >= 5 && !window.confirm(`Remover "${item.produto.nome}" (${item.qtd} un.) do carrinho?`)) {
          return c;
        }
        const novo = { ...c };
        delete novo[chave];
        return novo;
      }
      return { ...c, [chave]: { ...item, qtd: novaQtd } };
    });
  }

  function removerItem(chave) {
    setCarrinho((c) => {
      const item = c[chave];
      if (!item) return c;
      if (item.qtd >= 2 && !window.confirm(`Remover "${item.produto.nome}" (${item.qtd} un.) do carrinho?`)) {
        return c;
      }
      const novo = { ...c };
      delete novo[chave];
      return novo;
    });
  }

  function iniciarEdicaoPreco(chave, precoAtual) {
    setEditandoPrecoChave(chave);
    setPrecoEditado(String(precoAtual));
  }

  function cancelarEdicaoPreco() {
    setEditandoPrecoChave(null);
    setPrecoEditado('');
  }

  function confirmarPrecoEditado(chave) {
    const valor = Number(precoEditado);
    if (!precoEditado || Number.isNaN(valor) || valor <= 0) {
      cancelarEdicaoPreco();
      return;
    }
    setCarrinho((c) => ({
      ...c,
      [chave]: { ...c[chave], precoManual: valor },
    }));
    cancelarEdicaoPreco();
  }

  // Preço manual (editado na hora da venda) tem prioridade sobre o preço de cartão cadastrado
  function precoItem(item, formaPagamentoAtual) {
    if (item.precoManual !== undefined && item.precoManual !== null) return item.precoManual;
    return precoEfetivo(item.produto, item.unidadeVenda, formaPagamentoAtual, item.ehDose);
  }

  function totalNoCarrinho(produto) {
    return Object.values(carrinho)
      .filter((i) => i.produto.id === produto.id)
      .reduce((s, i) => s + i.qtd, 0);
  }

  function aoLerCodigo(codigo) {
    setMostrarLeitor(false);

    const produtoIdDoQr = extrairProdutoIdDoQr(codigo);
    const produto = produtoIdDoQr
      ? produtos.find((p) => p.servidorId === produtoIdDoQr)
      : produtos.find((p) => p.codigoBarras === codigo);

    if (produto) {
      adicionar(produto);
    } else {
      setMensagem(
        produtoIdDoQr
          ? 'Esse QR code é de um produto que não está mais disponível.'
          : 'Produto não encontrado para esse código.'
      );
      setTimeout(() => setMensagem(''), 2500);
    }
  }

  const itensCarrinho = Object.entries(carrinho).map(([chave, item]) => ({ chave, ...item }));
  const quantidadeItens = itensCarrinho.reduce((s, i) => s + i.qtd, 0);
  const total = itensCarrinho.reduce((soma, i) => {
    const preco = precoItem(i, formaPagamento);
    return soma + i.qtd * preco;
  }, 0);
  const usandoPrecoCartao = (formaPagamento === 'CREDITO' || formaPagamento === 'DEBITO')
    && itensCarrinho.some((i) => i.precoManual || (i.unidadeVenda || i.produto).precoCartao);

  async function finalizarVenda() {
    if (itensCarrinho.length === 0) return;
    if (formaPagamento === 'FIADO' && !clienteFiadoId) {
      setMensagem('Selecione o cliente pra vender fiado.');
      return;
    }
    setFinalizando(true);
    setMensagem('');
    try {
      const itens = itensCarrinho.map((item) => ({
        produtoId: item.produto.servidorId,
        quantidade: item.qtd,
        unidadeVendaId: item.unidadeVenda ? item.unidadeVenda.id : undefined,
        ehDose: item.ehDose || undefined,
        // Só manda precoManual se o operador de fato editou o preço no carrinho -
        // o servidor recalcula o preço normal/de cartão sozinho quando isso vem vazio
        precoManual: item.precoManual != null ? item.precoManual : undefined,
      }));

      const resultado = await registrarVendaOffline({
        itens,
        formaPagamento,
        clienteFiadoId: formaPagamento === 'FIADO' ? clienteFiadoId : undefined,
        idLocal: await gerarIdLocal(),
      });

      // Só dá pra saber se algum item ficou negativo quando a venda foi online
      // (registrada na hora); vendas feitas offline só mostram isso depois, na sincronização
      const produtosComEstoqueNegativo = resultado?.avisoEstoqueNegativo || [];

      setCarrinho({});
      setClienteFiadoId('');
      cancelarEdicaoPreco();
      setMensagem(
        produtosComEstoqueNegativo.length > 0
          ? `Venda registrada! Atenção: estoque ficou negativo em ${produtosComEstoqueNegativo.join(', ')}.`
          : 'Venda registrada!'
      );
      vibrar(80);
      tocarBip();
      await carregarProdutos();
      setTimeout(() => setMensagem(''), 2500);
    } catch {
      setMensagem('Erro ao registrar a venda. Tente novamente.');
    } finally {
      setFinalizando(false);
    }
  }

  return (
    <div>
      <div className="cartao-cabecalho" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
        <div>
          <h2 className="titulo-secao" style={{ margin: 0 }}>Venda rápida</h2>
          <p className="subtexto" style={{ margin: '2px 0 0' }}>
            {carregandoProdutos ? 'Carregando produtos...' : `${produtos.length} produto(s) disponível(is)`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="botao-primario pequeno neutro" onClick={() => setMostrarLeitor(true)} title="Escanear código de barras">
            📷 Escanear
          </button>
          <button className="botao-primario pequeno neutro" onClick={() => navigate('/')}>Voltar</button>
        </div>
      </div>

      {mostrarLeitor && (
  <LeitorCodigoBarras
    onLeitura={aoLerCodigo}
    onFechar={(mensagemErro) => {
      setMostrarLeitor(false);
      if (mensagemErro) {
        setMensagem(mensagemErro);
        setTimeout(() => setMensagem(''), 3000);
      }
    }}
  />
)}

      {erroSincronizacao && <p className="erro-texto">{erroSincronizacao}</p>}
      {mensagem && <p className={mensagem.includes('Erro') || mensagem.includes('Selecione') ? 'erro-texto' : 'sucesso-texto'}>{mensagem}</p>}

      {!carregandoProdutos && produtos.length > 0 && (
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar produto por nome ou código de barras"
          style={{ marginBottom: 12 }}
        />
      )}

      {carregandoProdutos && <p className="carregando-texto">Carregando produtos...</p>}

      {!carregandoProdutos && produtos.length === 0 && (
        <div className="cartao" style={{ textAlign: 'center' }}>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>Nenhum produto disponível pra venda</p>
          <p className="subtexto" style={{ marginBottom: 12 }}>
            Cadastre produtos no Estoque pra que eles apareçam aqui.
          </p>
          <button className="botao-primario pequeno" onClick={() => navigate('/cadastrar-produto')}>
            Cadastrar produto
          </button>
        </div>
      )}

      {!carregandoProdutos && produtos.length > 0 && produtosFiltrados.length === 0 && (
        <p className="vazio">Nenhum produto encontrado pra "{busca}".</p>
      )}

      <div className="grade-pdv">
        {produtosFiltrados.map((produto) => (
          <div key={produto.id} className="botao-produto-pdv" style={{ cursor: 'default' }}>
            {totalNoCarrinho(produto) > 0 && (
              <span className="badge-qtd-carrinho">{totalNoCarrinho(produto)}</span>
            )}
            <div className="foto-produto-pdv">
              {produto.fotoUrl ? (
                <img src={produto.fotoUrl} alt={produto.nome} />
              ) : (
                '🍾'
              )}
            </div>
            <span className="nome">{produto.nome}</span>

            <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 8 }}>
              <button
                type="button"
                onClick={() => adicionar(produto)}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  padding: '8px 4px',
                  background: '#2d3436',
                  border: 'none',
                  borderRadius: 6,
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 11, fontWeight: 700 }}>Unidade</span>
                <span style={{ fontSize: 12, fontWeight: 800 }}>
                  {Number(produto.precoVenda).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </button>

              {unidadesPorProduto[produto.servidorId] && (
                <button
                  type="button"
                  onClick={() => setSeletorUnidade(produto)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    padding: '8px 4px',
                    background: '#ffc107',
                    border: 'none',
                    borderRadius: 6,
                    color: '#1a1a1a',
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800 }}>Fardo/caixa</span>
                  <span style={{ fontSize: 12, fontWeight: 800 }}>Ver opções</span>
                </button>
              )}

              {produto.vendeDose && (
                <button
                  type="button"
                  onClick={() => adicionar(produto, null, true)}
                  disabled={!produto.estoqueDoses || produto.estoqueDoses <= 0}
                  title={!produto.estoqueDoses || produto.estoqueDoses <= 0 ? 'Sem doses avulsas em estoque - abra uma garrafa no Estoque' : ''}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    padding: '8px 4px',
                    background: (!produto.estoqueDoses || produto.estoqueDoses <= 0) ? '#5a4a2f' : '#9c6b2e',
                    border: 'none',
                    borderRadius: 6,
                    color: '#fff',
                    cursor: (!produto.estoqueDoses || produto.estoqueDoses <= 0) ? 'not-allowed' : 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                    opacity: (!produto.estoqueDoses || produto.estoqueDoses <= 0) ? 0.6 : 1,
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800 }}>🥃 Dose</span>
                  <span style={{ fontSize: 12, fontWeight: 800 }}>
                    {produto.precoDose ? Number(produto.precoDose).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                  </span>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {seletorUnidade && (
        <div className="overlay-seletor" onClick={() => setSeletorUnidade(null)}>
          <div className="cartao-seletor" onClick={(e) => e.stopPropagation()}>
            <p style={{ fontWeight: 700, marginBottom: 10 }}>{seletorUnidade.nome}</p>
            <button
              className="botao-primario neutro"
              style={{ marginBottom: 8, width: '100%' }}
              onClick={() => { adicionar(seletorUnidade); setSeletorUnidade(null); }}
            >
              Unidade — {Number(seletorUnidade.precoVenda).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </button>
            {(unidadesPorProduto[seletorUnidade.servidorId] || []).map((u) => (
              <button
                key={u.id}
                className="botao-primario neutro"
                style={{ marginBottom: 8, width: '100%' }}
                onClick={() => { adicionar(seletorUnidade, u); setSeletorUnidade(null); }}
              >
                {u.nome} — {Number(u.precoVenda).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                {u.precoCartao && ` (cartão: ${Number(u.precoCartao).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`}
              </button>
            ))}
            <button className="botao-primario pequeno neutro" style={{ width: '100%' }} onClick={() => setSeletorUnidade(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {itensCarrinho.length > 0 && (
        <div className="carrinho-flutuante">
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Carrinho ({quantidadeItens})</p>
          <div style={{ maxHeight: 160, overflowY: 'auto' }}>
            {itensCarrinho.map((item) => {
              const precoAtual = precoItem(item, formaPagamento);
              const editando = editandoPrecoChave === item.chave;
              return (
                <div key={item.chave} className="item-carrinho" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{item.produto.nome}{item.ehDose ? ' · Dose' : (item.unidadeVenda ? ` · ${item.unidadeVenda.nome}` : '')}</span>
                    <div className="controles-qtd">
                      <button className="botao-qtd" onClick={() => alterarQtd(item.chave, -1)}>−</button>
                      <span>{item.qtd}</span>
                      <button className="botao-qtd" onClick={() => alterarQtd(item.chave, 1)}>+</button>
                      <button
                        className="botao-qtd"
                        style={{ background: 'transparent', color: 'var(--vermelho-alerta)' }}
                        onClick={() => removerItem(item.chave)}
                        title="Remover item"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {formaPagamento === 'CREDITO' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {editando ? (
                        <>
                          <input
                            type="number"
                            step="0.01"
                            autoFocus
                            value={precoEditado}
                            onChange={(e) => setPrecoEditado(e.target.value)}
                            style={{ width: 90, fontSize: 13, padding: '2px 6px' }}
                          />
                          <button
                            className="botao-qtd"
                            style={{ background: '#ffc107', color: '#1a1a1a' }}
                            onClick={() => confirmarPrecoEditado(item.chave)}
                          >
                            ✓
                          </button>
                          <button
                            className="botao-qtd"
                            style={{ background: 'transparent' }}
                            onClick={cancelarEdicaoPreco}
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 13, opacity: 0.85 }}>
                            Preço no crédito: {precoAtual.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            {item.precoManual != null && ' (editado)'}
                          </span>
                          <button
                            className="botao-qtd"
                            style={{ background: 'transparent' }}
                            onClick={() => iniciarEdicaoPreco(item.chave, precoAtual)}
                            title="Editar preço no crédito"
                          >
                            ✏️
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="carrinho-linha-resumo" style={{ marginTop: 10 }}>
            <span style={{ fontWeight: 700 }}>Total</span>
            <span className="carrinho-total">{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          </div>
          {usandoPrecoCartao && (
            <p style={{ fontSize: 12, color: 'var(--ambar, #ffc107)', marginTop: 4 }}>
              💳 Preço de cartão aplicado a um ou mais itens
            </p>
          )}

          <div className="select-forma-pagamento" style={{ marginTop: 8 }}>
            {FORMAS.map((f) => (
              <button
                key={f.valor}
                className={`chip-pagamento ${formaPagamento === f.valor ? 'ativo' : ''}`}
                disabled={f.valor === 'FIADO' && !estaOnline()}
                onClick={() => setFormaPagamento(f.valor)}
              >
                {f.rotulo}
              </button>
            ))}
          </div>

          {formaPagamento === 'FIADO' && (
            <div style={{ marginTop: 8 }}>
              {!estaOnline() ? (
                <p className="erro-texto">Fiado precisa de internet.</p>
              ) : (
                <select value={clienteFiadoId} onChange={(e) => setClienteFiadoId(e.target.value)}>
                  <option value="">— Selecionar cliente —</option>
                  {clientesFiado.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} (deve R$ {Number(c.saldoDevedor).toFixed(2)})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <button
            className="botao-primario"
            style={{ marginTop: 12, width: '100%' }}
            disabled={finalizando}
            onClick={finalizarVenda}
          >
            {finalizando ? 'Registrando...' : 'Finalizar venda'}
          </button>
        </div>
      )}
    </div>
  );
}