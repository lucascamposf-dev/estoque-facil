import { useEffect, useState } from 'react';
import { chamarApi, estaOnline } from '../api';

export default function Vasilhames() {
  const [vasilhames, setVasilhames] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [mostrarNovoTipo, setMostrarNovoTipo] = useState(false);
  const [nomeTipo, setNomeTipo] = useState('');
  const [salvandoTipo, setSalvandoTipo] = useState(false);

  const [painelAberto, setPainelAberto] = useState(null); // { id, acao }
  const [detalhe, setDetalhe] = useState(null);
  const [clientesFiado, setClientesFiado] = useState([]);

  const [clienteSelecionado, setClienteSelecionado] = useState('');
  const [nomeAvulso, setNomeAvulso] = useState('');
  const [quantidadeMov, setQuantidadeMov] = useState(1);
  const [registrando, setRegistrando] = useState(false);

  async function carregar() {
    if (!estaOnline()) {
      setErro('Controle de vasilhame precisa de internet.');
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      const [lista, clientes] = await Promise.all([
        chamarApi('/vasilhames'),
        chamarApi('/clientes-fiado').catch(() => []),
      ]);
      setVasilhames(lista);
      setClientesFiado(clientes);
    } catch {
      setErro('Não foi possível carregar os vasilhames.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function criarTipo(e) {
    e.preventDefault();
    if (!nomeTipo.trim()) return;
    setSalvandoTipo(true);
    try {
      await chamarApi('/vasilhames', { method: 'POST', body: JSON.stringify({ nome: nomeTipo }) });
      setNomeTipo('');
      setMostrarNovoTipo(false);
      await carregar();
    } catch {
      setErro('Não foi possível cadastrar o tipo de vasilhame.');
    } finally {
      setSalvandoTipo(false);
    }
  }

  async function carregarDetalhe(id) {
    const dados = await chamarApi(`/vasilhames/${id}/emprestimos`);
    setDetalhe(dados);
  }

  function abrirPainel(id, acao) {
    const mesmoPainel = painelAberto?.id === id && painelAberto?.acao === acao;
    if (mesmoPainel) {
      setPainelAberto(null);
      setDetalhe(null);
      return;
    }
    setPainelAberto({ id, acao });
    setClienteSelecionado('');
    setNomeAvulso('');
    setQuantidadeMov(1);
    carregarDetalhe(id).catch(() => setErro('Não foi possível carregar os empréstimos.'));
  }

  async function registrarMovimento(vasilhameId) {
    if (!quantidadeMov || quantidadeMov <= 0) return;
    if (!clienteSelecionado && !nomeAvulso.trim()) return;
    setRegistrando(true);
    try {
      await chamarApi(`/vasilhames/${vasilhameId}/movimentar`, {
        method: 'POST',
        body: JSON.stringify({
          clienteFiadoId: clienteSelecionado || undefined,
          clienteNomeAvulso: clienteSelecionado ? undefined : nomeAvulso,
          quantidade: Number(quantidadeMov),
          tipo: painelAberto.acao,
        }),
      });
      setQuantidadeMov(1);
      setNomeAvulso('');
      setClienteSelecionado('');
      setPainelAberto(null);
      await carregar();
    } catch {
      setErro('Não foi possível registrar o movimento.');
    } finally {
      setRegistrando(false);
    }
  }

  return (
    <div>
      <div className="cartao-cabecalho" style={{ marginBottom: 14 }}>
        <h2 className="titulo-secao" style={{ margin: 0 }}>Vasilhame</h2>
        <button className="botao-primario pequeno neutro" onClick={() => setMostrarNovoTipo((v) => !v)}>
          {mostrarNovoTipo ? 'Cancelar' : '+ Tipo'}
        </button>
      </div>

      {erro && <p className="erro-texto">{erro}</p>}

      {mostrarNovoTipo && (
        <form onSubmit={criarTipo} className="cartao">
          <label className="rotulo-campo">Nome do vasilhame</label>
          <input value={nomeTipo} onChange={(e) => setNomeTipo(e.target.value)} placeholder="Ex: Casco Skol 600ml" />
          <button className="botao-primario" disabled={salvandoTipo} type="submit">
            {salvandoTipo ? 'Salvando...' : 'Cadastrar tipo'}
          </button>
        </form>
      )}

      {carregando && <p className="vazio">Carregando...</p>}
      {!carregando && vasilhames.length === 0 && !erro && (
        <p className="vazio">Nenhum tipo de vasilhame cadastrado ainda.</p>
      )}

      {vasilhames.map((v) => {
        const painelEmprestar = painelAberto?.id === v.id && painelAberto?.acao === 'EMPRESTADO';
        const painelDevolver = painelAberto?.id === v.id && painelAberto?.acao === 'DEVOLVIDO';

        return (
          <div key={v.id} className="cartao">
            <div className="cartao-produto" style={{ marginBottom: 0 }}>
              <div className="icone-vasilhame">🧴</div>
              <div className="info-produto">
                <div className="nome">{v.nome}</div>
                <div className="detalhe">Emprestados com clientes</div>
              </div>
              <div className="estoque-numero" style={{ color: v.totalEmprestado > 0 ? 'var(--ambar-escuro)' : '#4a9c53' }}>
                {v.totalEmprestado}
              </div>
            </div>

            <div className="linha-acoes-cartao">
              <button className="botao-primario pequeno neutro" onClick={() => abrirPainel(v.id, 'EMPRESTADO')}>
                📤 {painelEmprestar ? 'Cancelar' : 'Emprestar'}
              </button>
              <button className="botao-primario pequeno" onClick={() => abrirPainel(v.id, 'DEVOLVIDO')}>
                📥 {painelDevolver ? 'Cancelar' : 'Devolver'}
              </button>
            </div>

            {(painelEmprestar || painelDevolver) && (
              <div className="painel-inline">
                {painelDevolver && detalhe && (
                  <div className="saldo-lista-clientes">
                    {detalhe.saldosPorCliente.length > 0 ? (
                      detalhe.saldosPorCliente.map((s, i) => (
                        <div key={i} className="linha-forma-pagamento">
                          <span>{s.nome}</span>
                          <strong>{s.saldo} un.</strong>
                        </div>
                      ))
                    ) : (
                      <p className="subtexto">Nenhum saldo emprestado no momento.</p>
                    )}
                  </div>
                )}

                <label className="rotulo-campo" style={{ marginTop: 0 }}>Cliente cadastrado</label>
                <select
                  value={clienteSelecionado}
                  onChange={(e) => { setClienteSelecionado(e.target.value); setNomeAvulso(''); }}
                >
                  <option value="">— Selecionar —</option>
                  {clientesFiado.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>

                <label className="rotulo-campo">Ou nome avulso</label>
                <input
                  value={nomeAvulso}
                  onChange={(e) => { setNomeAvulso(e.target.value); setClienteSelecionado(''); }}
                  placeholder="Cliente sem cadastro"
                  disabled={!!clienteSelecionado}
                />

                <label className="rotulo-campo">Quantidade</label>
                <div className="linha-valor-confirmar">
                  <div>
                    <input type="number" min="1" value={quantidadeMov} onChange={(e) => setQuantidadeMov(e.target.value)} />
                  </div>
                  <button className="botao-primario" disabled={registrando} onClick={() => registrarMovimento(v.id)}>
                    {registrando ? '...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}