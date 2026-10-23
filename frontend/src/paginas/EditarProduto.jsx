import { useState, useEffect } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { chamarApi, estaOnline } from '../api';
import { db } from '../db';
import LeitorCodigoBarras from '../componentes/LeitorCodigoBarras';
import FormularioUnidadeVenda from '../componentes/FormularioUnidadeVenda';
import ListaUnidadesVenda from '../componentes/ListaUnidadesVenda';
import { redimensionarFoto } from '../utils/redimensionarFoto';

const CATEGORIAS = [
  { valor: 'CERVEJA', rotulo: 'Cerveja' },
  { valor: 'REFRIGERANTE', rotulo: 'Refrigerante' },
  { valor: 'AGUA', rotulo: 'Água' },
  { valor: 'ENERGETICO', rotulo: 'Energético' },
  { valor: 'DESTILADO', rotulo: 'Destilado' },
  { valor: 'OUTROS', rotulo: 'Outros' },
];

// Formata uma data ISO (vinda do servidor) pro formato que o <input type="date"> espera
function paraInputData(dataIso) {
  if (!dataIso) return '';
  return String(dataIso).slice(0, 10);
}

export default function EditarProduto() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: idDaRota } = useParams();

  // Busca o produto em 3 etapas, da mais rápida pra mais lenta:
  // 1) veio pela navegação (state) - mostra na hora, sem esperar nada
  // 2) já está salvo no IndexedDB local - funciona offline
  // 3) busca na API pelo id da rota - cobre F5, link direto, ou voltar pelo navegador
  // Isso resolve o bug de "não encontramos os dados desse produto" ao recarregar a página.
  const [produtoOriginal, setProdutoOriginal] = useState(location.state?.produto || null);
  const [carregandoProduto, setCarregandoProduto] = useState(!location.state?.produto);
  const [erroCarregarProduto, setErroCarregarProduto] = useState('');

  useEffect(() => {
    let ativo = true;

    async function carregarProduto() {
      if (location.state?.produto) {
        // Já temos o produto (veio da tela de Estoque) - nada a fazer
        return;
      }
      if (!idDaRota) {
        setCarregandoProduto(false);
        return;
      }

      setCarregandoProduto(true);
      setErroCarregarProduto('');

      try {
        const local = await db.produtos.where('servidorId').equals(idDaRota).first();
        if (local && ativo) {
          setProdutoOriginal(local);
          setCarregandoProduto(false);
          return;
        }
      } catch {
        // sem produto local pra esse id ainda - segue tentando pela API
      }

      if (!estaOnline()) {
        if (ativo) {
          setErroCarregarProduto('Este produto ainda não está salvo neste aparelho e editar precisa de internet.');
          setCarregandoProduto(false);
        }
        return;
      }

      try {
        const produtoApi = await chamarApi(`/produtos/${idDaRota}`);
        if (ativo) setProdutoOriginal({ ...produtoApi, servidorId: produtoApi.id });
      } catch {
        if (ativo) setErroCarregarProduto('Não encontramos os dados desse produto pra editar.');
      } finally {
        if (ativo) setCarregandoProduto(false);
      }
    }

    carregarProduto();
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idDaRota]);

  const [nome, setNome] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [precoVenda, setPrecoVenda] = useState('');
  const [precoCartao, setPrecoCartao] = useState('');
  const [estoqueAtual, setEstoqueAtual] = useState('');
  const [estoqueMinimo, setEstoqueMinimo] = useState('5');
  const [fotoUrl, setFotoUrl] = useState('');
  const [categoria, setCategoria] = useState('OUTROS');
  const [dataValidade, setDataValidade] = useState('');
  const [diasAlertaValidade, setDiasAlertaValidade] = useState('7');

  const [vendeDose, setVendeDose] = useState(false);
  const [dosesPorUnidade, setDosesPorUnidade] = useState('');
  const [precoDose, setPrecoDose] = useState('');
  const [precoDoseCartao, setPrecoDoseCartao] = useState('');

  // Assim que o produto for resolvido (por qualquer uma das 3 fontes acima),
  // preenche o formulário com os dados dele
  useEffect(() => {
    if (!produtoOriginal) return;
    setNome(produtoOriginal.nome || '');
    setCodigoBarras(produtoOriginal.codigoBarras || '');
    setPrecoVenda(produtoOriginal.precoVenda !== undefined ? String(produtoOriginal.precoVenda) : '');
    setPrecoCartao(produtoOriginal.precoCartao ? String(produtoOriginal.precoCartao) : '');
    setEstoqueAtual(produtoOriginal.estoqueAtual !== undefined ? String(produtoOriginal.estoqueAtual) : '');
    setEstoqueMinimo(produtoOriginal.estoqueMinimo !== undefined ? String(produtoOriginal.estoqueMinimo) : '5');
    setFotoUrl(produtoOriginal.fotoUrl || '');
    setCategoria(produtoOriginal.categoria || 'OUTROS');
    setDataValidade(paraInputData(produtoOriginal.dataValidade));
    setDiasAlertaValidade(String(produtoOriginal.diasAlertaValidade || '7'));
    setVendeDose(!!produtoOriginal.vendeDose);
    setDosesPorUnidade(produtoOriginal.dosesPorUnidade ? String(produtoOriginal.dosesPorUnidade) : '');
    setPrecoDose(produtoOriginal.precoDose ? String(produtoOriginal.precoDose) : '');
    setPrecoDoseCartao(produtoOriginal.precoDoseCartao ? String(produtoOriginal.precoDoseCartao) : '');
  }, [produtoOriginal]);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [mostrarLeitor, setMostrarLeitor] = useState(false);

  const [unidadesVenda, setUnidadesVenda] = useState([]); // formas extras já salvas: fardo, caixa, etc.
  const [carregandoUnidades, setCarregandoUnidades] = useState(false);
  const [removendoUnidadeId, setRemovendoUnidadeId] = useState(null);

  const [historicoPreco, setHistoricoPreco] = useState([]);
  const [mostrarHistoricoPreco, setMostrarHistoricoPreco] = useState(false);
  const [carregandoHistoricoPreco, setCarregandoHistoricoPreco] = useState(false);

  useEffect(() => {
    async function carregarHistoricoPreco() {
      if (!produtoOriginal?.servidorId || !estaOnline()) return;
      setCarregandoHistoricoPreco(true);
      try {
        const lista = await chamarApi(`/produtos/${produtoOriginal.servidorId}/historico-preco`);
        setHistoricoPreco(lista);
      } catch {
        // sem histórico de preço ainda, ou falha ao buscar - segue normal
      } finally {
        setCarregandoHistoricoPreco(false);
      }
    }
    carregarHistoricoPreco();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoOriginal?.servidorId]);

  useEffect(() => {
    async function carregarUnidades() {
      if (!produtoOriginal?.servidorId || !estaOnline()) return;
      setCarregandoUnidades(true);
      try {
        const lista = await chamarApi(`/produtos/${produtoOriginal.servidorId}/unidades`);
        setUnidadesVenda(lista);
      } catch {
        // sem formas de venda extras cadastradas, ou falha ao buscar - segue normal
      } finally {
        setCarregandoUnidades(false);
      }
    }
    carregarUnidades();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtoOriginal?.servidorId]);

  async function adicionarUnidade(dados) {
    try {
      const criada = await chamarApi(`/produtos/${produtoOriginal.servidorId}/unidades`, {
        method: 'POST',
        body: JSON.stringify(dados),
      });
      setUnidadesVenda((lista) => [...lista, criada]);
      return true;
    } catch {
      setErro('Não foi possível salvar essa forma de venda. Tente novamente.');
      return false;
    }
  }

  async function removerUnidade(unidade) {
    setRemovendoUnidadeId(unidade.id);
    setErro('');
    try {
      await chamarApi(`/produtos/unidades/${unidade.id}`, { method: 'DELETE' });
      setUnidadesVenda((lista) => lista.filter((u) => u.id !== unidade.id));
    } catch {
      setErro('Não foi possível remover essa forma de venda. Tente novamente.');
    } finally {
      setRemovendoUnidadeId(null);
    }
  }

  // Enquanto ainda está tentando resolver o produto (local ou pela API), mostra
  // carregando em vez de já cravar "não encontramos" - evita o flash de erro
  // que existia antes toda vez que a página recarregava (F5, link direto, etc.)
  if (carregandoProduto) {
    return (
      <div>
        <h2 className="titulo-secao">Editar produto</h2>
        <p className="carregando-texto">Carregando dados do produto...</p>
      </div>
    );
  }

  if (!produtoOriginal) {
    return (
      <div>
        <h2 className="titulo-secao">Editar produto</h2>
        <p className="vazio">
          {erroCarregarProduto || 'Não encontramos os dados desse produto pra editar.'}
          <br />
          Volte pro estoque e toque em "Editar" no produto de novo.
        </p>
        <button className="botao-primario" onClick={() => navigate('/estoque')}>
          Voltar pro estoque
        </button>
      </div>
    );
  }

  const podeEditar = !!produtoOriginal.servidorId;

  // Editar exige internet hoje, então isso sempre cai no caminho "online" do
  // util compartilhado - mantido simétrico ao cadastro caso a edição offline
  // seja liberada no futuro.
  async function aoEscolherFoto(e) {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro('');

    try {
      setFotoUrl(await redimensionarFoto(arquivo));
    } catch {
      setErro('Não foi possível carregar essa foto. Tente novamente.');
    }
  }

  function aoLerCodigo(codigo) {
    setMostrarLeitor(false);
    setCodigoBarras(codigo);
  }

  function aoFecharLeitor(mensagemErro) {
    setMostrarLeitor(false);
    if (mensagemErro) setErro(mensagemErro);
  }

  async function salvar() {
    if (!nome || !precoVenda) {
      setErro('Preencha ao menos o nome e o preço de venda');
      return;
    }
    if (vendeDose && (!dosesPorUnidade || Number(dosesPorUnidade) <= 0 || !precoDose)) {
      setErro('Pra vender por dose, informe quantas doses saem de 1 unidade e o preço da dose');
      return;
    }
    if (!estaOnline()) {
      setErro('Editar um produto precisa de internet.');
      return;
    }
    setErro('');
    setSalvando(true);

    const dadosProduto = {
      nome,
      codigoBarras: codigoBarras || null,
      fotoUrl: fotoUrl || null,
      precoVenda: Number(precoVenda),
      precoCartao: precoCartao ? Number(precoCartao) : null,
      estoqueAtual: Number(estoqueAtual) || 0,
      estoqueMinimo: Number(estoqueMinimo) || 5,
      categoria,
      dataValidade: dataValidade || null,
      diasAlertaValidade: dataValidade ? Number(diasAlertaValidade) || 7 : null,
      vendeDose,
      dosesPorUnidade: vendeDose ? Number(dosesPorUnidade) : null,
      precoDose: vendeDose ? Number(precoDose) : null,
      precoDoseCartao: vendeDose && precoDoseCartao ? Number(precoDoseCartao) : null,
    };

    try {
      const atualizado = await chamarApi(`/produtos/${produtoOriginal.servidorId}`, {
        method: 'PUT',
        body: JSON.stringify(dadosProduto),
      });
      if (produtoOriginal.id !== undefined) {
        await db.produtos.update(produtoOriginal.id, { ...atualizado, servidorId: atualizado.id });
      } else {
        const existenteLocal = await db.produtos.where('servidorId').equals(atualizado.id).first();
        if (existenteLocal) {
          await db.produtos.update(existenteLocal.id, { ...atualizado, servidorId: atualizado.id });
        } else {
          await db.produtos.add({ ...atualizado, servidorId: atualizado.id });
        }
      }
      navigate(`/estoque?abrir=${atualizado.id}`);
    } catch {
      setErro('Não foi possível salvar as alterações. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <h2 className="titulo-secao">Editar produto</h2>

      {!podeEditar && (
        <p className="erro-texto">
          Este produto ainda não sincronizou com o servidor. Aguarde a sincronização automática
          (acontece sozinha quando há internet) e tente editar de novo.
        </p>
      )}

      <button
        type="button"
        className="botao-primario"
        style={{ background: 'var(--branco-giz)', marginBottom: 16 }}
        onClick={() => setMostrarLeitor(true)}
        disabled={!podeEditar}
      >
        📷 {codigoBarras ? 'Reescanear código de barras' : 'Escanear código de barras'}
      </button>

      {codigoBarras && (
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: -8 }}>
          Código atual: {codigoBarras}
        </p>
      )}

      <label style={{ fontSize: 14, opacity: 0.8 }}>Foto do produto</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="botao-primario pequeno neutro"
          style={{ flex: 1 }}
          onClick={() => document.getElementById('input-camera-editar').click()}
          disabled={!podeEditar}
        >
          📷 Tirar foto
        </button>
        <button
          type="button"
          className="botao-primario pequeno neutro"
          style={{ flex: 1 }}
          onClick={() => document.getElementById('input-galeria-editar').click()}
          disabled={!podeEditar}
        >
          🖼️ Galeria
        </button>
      </div>
      <input
        id="input-camera-editar"
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={aoEscolherFoto}
      />
      <input
        id="input-galeria-editar"
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={aoEscolherFoto}
      />
      {fotoUrl && (
        <img
          src={fotoUrl}
          alt="Prévia do produto"
          style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, marginTop: 8 }}
        />
      )}

      <label style={{ fontSize: 14, opacity: 0.8 }}>Nome do produto</label>
      <input value={nome} onChange={(e) => setNome(e.target.value)} disabled={!podeEditar} />

      <label style={{ fontSize: 14, opacity: 0.8 }}>Categoria</label>
      <select value={categoria} onChange={(e) => setCategoria(e.target.value)} disabled={!podeEditar}>
        {CATEGORIAS.map((c) => (
          <option key={c.valor} value={c.valor}>{c.rotulo}</option>
        ))}
      </select>

      {produtoOriginal.precoCustoMedio && (
        <div className="cartao" style={{ marginBottom: 12, padding: '10px 14px' }}>
          <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>Custo médio (calculado automaticamente pelas entradas)</p>
          <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700 }}>
            R$ {Number(produtoOriginal.precoCustoMedio).toFixed(2)}
          </p>
          {precoVenda && Number(precoVenda) > 0 && (
            <p style={{ margin: '2px 0 0', fontSize: 12, opacity: 0.6 }}>
              Margem: {(((Number(precoVenda) - Number(produtoOriginal.precoCustoMedio)) / Number(precoVenda)) * 100).toFixed(1)}%
            </p>
          )}
        </div>
      )}

      <label style={{ fontSize: 14, opacity: 0.8 }}>Preço de venda (R$)</label>
      <input
        type="number"
        step="0.01"
        value={precoVenda}
        onChange={(e) => setPrecoVenda(e.target.value)}
        disabled={!podeEditar}
      />

      {(carregandoHistoricoPreco || historicoPreco.length > 0) && (
        <div style={{ marginTop: -6, marginBottom: 12 }}>
          {carregandoHistoricoPreco ? (
            <p style={{ fontSize: 12, opacity: 0.6 }}>Carregando histórico de preço...</p>
          ) : (
            <>
              <button
                type="button"
                style={{ background: 'none', border: 'none', color: 'var(--ambar, #ffc107)', fontSize: 12, padding: 0, cursor: 'pointer' }}
                onClick={() => setMostrarHistoricoPreco((v) => !v)}
              >
                {mostrarHistoricoPreco ? 'Ocultar' : 'Ver'} histórico de preço ({historicoPreco.length})
              </button>
              {mostrarHistoricoPreco && (
                <div style={{ marginTop: 6 }}>
                  {historicoPreco.map((h) => (
                    <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <span style={{ opacity: 0.7 }}>{new Date(h.criadoEm).toLocaleString('pt-BR')}</span>
                      <span>
                        R$ {Number(h.precoAntigo).toFixed(2)} → <strong>R$ {Number(h.precoNovo).toFixed(2)}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <label style={{ fontSize: 14, opacity: 0.8 }}>Preço no cartão (crédito/débito) — opcional</label>
      <input
        type="number"
        step="0.01"
        placeholder="Deixe em branco pra usar o preço normal"
        value={precoCartao}
        onChange={(e) => setPrecoCartao(e.target.value)}
        disabled={!podeEditar}
      />

      <label style={{ fontSize: 14, opacity: 0.8 }}>Quantidade em estoque</label>
      <input
        type="number"
        value={estoqueAtual}
        onChange={(e) => setEstoqueAtual(e.target.value)}
        disabled={!podeEditar}
      />

      <label style={{ fontSize: 14, opacity: 0.8 }}>Avisar quando restar menos de</label>
      <input
        type="number"
        value={estoqueMinimo}
        onChange={(e) => setEstoqueMinimo(e.target.value)}
        disabled={!podeEditar}
      />

      <label style={{ fontSize: 14, opacity: 0.8 }}>Data de validade (opcional)</label>
      <input
        type="date"
        value={dataValidade}
        onChange={(e) => setDataValidade(e.target.value)}
        disabled={!podeEditar}
      />

      {dataValidade && (
        <>
          <label style={{ fontSize: 14, opacity: 0.8 }}>Avisar quantos dias antes de vencer</label>
          <input
            type="number"
            min="1"
            value={diasAlertaValidade}
            onChange={(e) => setDiasAlertaValidade(e.target.value)}
            disabled={!podeEditar}
          />
        </>
      )}

      <div className="cartao" style={{ marginBottom: 12, padding: '10px 14px', flexDirection: 'column', alignItems: 'stretch' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={vendeDose}
            onChange={(e) => setVendeDose(e.target.checked)}
            disabled={!podeEditar}
            style={{ width: 'auto' }}
          />
          🥃 Vende por dose (ex: garrafa de destilado)
        </label>

        {vendeDose && (
          <>
            <p style={{ fontSize: 12, opacity: 0.7, margin: '4px 0 8px' }}>
              Ao ativar, aparece um botão "Dose" pra esse produto na Venda Rápida.
              Pra ter doses disponíveis, abra uma unidade do estoque em "Estoque" → produto → "Abrir garrafa p/ doses".
            </p>
            <label className="rotulo-campo">Quantas doses saem de 1 unidade/garrafa</label>
            <input
              type="number"
              min="1"
              placeholder="Ex: 40"
              value={dosesPorUnidade}
              onChange={(e) => setDosesPorUnidade(e.target.value)}
              disabled={!podeEditar}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="rotulo-campo">Preço da dose (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 8.00"
                  value={precoDose}
                  onChange={(e) => setPrecoDose(e.target.value)}
                  disabled={!podeEditar}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="rotulo-campo">Preço da dose no cartão (opcional)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Deixe em branco pra usar o normal"
                  value={precoDoseCartao}
                  onChange={(e) => setPrecoDoseCartao(e.target.value)}
                  disabled={!podeEditar}
                />
              </div>
            </div>
            {produtoOriginal.estoqueDoses !== undefined && (
              <p style={{ fontSize: 13, marginTop: 4 }}>
                Doses avulsas em estoque agora: <strong>{produtoOriginal.estoqueDoses}</strong>
              </p>
            )}
          </>
        )}
      </div>

      <label style={{ fontSize: 14, opacity: 0.8 }}>Outras formas de venda (fardo, caixa, etc.)</label>
      {!estaOnline() && (
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: -8, marginBottom: 8 }}>
          Editar formas de venda precisa de internet.
        </p>
      )}
      {carregandoUnidades && <p style={{ fontSize: 13, opacity: 0.7 }}>Carregando formas de venda...</p>}

      <ListaUnidadesVenda
        unidades={unidadesVenda}
        chaveDe={(u) => u.id}
        estaRemovendo={(u) => removendoUnidadeId === u.id}
        desabilitado={!podeEditar}
        onRemover={(u) => removerUnidade(u)}
      />

      {estaOnline() && podeEditar && (
        <FormularioUnidadeVenda onAdicionar={adicionarUnidade} onErro={setErro} />
      )}

      {erro && <p style={{ color: '#ffb4b4', fontSize: 14 }}>{erro}</p>}

      <button className="botao-primario" disabled={salvando || !podeEditar} onClick={salvar}>
        {salvando ? 'Salvando...' : 'Salvar alterações'}
      </button>

      <button
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', marginTop: 12, width: '100%', padding: 8 }}
        onClick={() => navigate('/estoque')}
      >
        Cancelar
      </button>

      {mostrarLeitor && <LeitorCodigoBarras onLeitura={aoLerCodigo} onFechar={aoFecharLeitor} />}
    </div>
  );
}
