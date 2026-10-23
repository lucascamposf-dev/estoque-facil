import { useEffect, useState } from 'react';
import { chamarApi, estaOnline } from '../api';

function iniciais(nome) {
  return nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export default function ClientesFiado() {
  const [clientes, setClientes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [mostrarNovo, setMostrarNovo] = useState(false);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [limiteCredito, setLimiteCredito] = useState('');
  const [salvando, setSalvando] = useState(false);

  const [painelAberto, setPainelAberto] = useState(null); // { id, tipo: 'AUMENTO' | 'PAGAMENTO' }
  const [valorAjuste, setValorAjuste] = useState('');
  const [registrandoAjuste, setRegistrandoAjuste] = useState(false);

  const [historicoAbertoId, setHistoricoAbertoId] = useState(null);
  const [historico, setHistorico] = useState(null);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [erroHistorico, setErroHistorico] = useState('');

  async function carregar() {
    if (!estaOnline()) {
      setErro('Gestão de fiado precisa de internet.');
      setCarregando(false);
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      const dados = await chamarApi('/clientes-fiado');
      setClientes(dados);
    } catch {
      setErro('Não foi possível carregar os clientes.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function criarCliente(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    setSalvando(true);
    try {
      await chamarApi('/clientes-fiado', {
        method: 'POST',
        body: JSON.stringify({
          nome,
          telefone: telefone || undefined,
          limiteCredito: limiteCredito ? Number(limiteCredito) : undefined,
        }),
      });
      setNome('');
      setTelefone('');
      setLimiteCredito('');
      setMostrarNovo(false);
      await carregar();
    } catch {
      setErro('Não foi possível cadastrar o cliente.');
    } finally {
      setSalvando(false);
    }
  }

  function abrirPainel(id, tipo) {
    const mesmoPainel = painelAberto?.id === id && painelAberto?.tipo === tipo;
    setPainelAberto(mesmoPainel ? null : { id, tipo });
    setValorAjuste('');
  }

  async function alternarHistorico(id) {
    if (historicoAbertoId === id) {
      setHistoricoAbertoId(null);
      setHistorico(null);
      setErroHistorico('');
      return;
    }
    setHistoricoAbertoId(id);
    setHistorico(null);
    setErroHistorico('');
    setCarregandoHistorico(true);
    try {
      const dados = await chamarApi(`/clientes-fiado/${id}/historico`);
      setHistorico(dados);
    } catch {
      setErroHistorico('Não foi possível carregar o histórico.');
    } finally {
      setCarregandoHistorico(false);
    }
  }

  async function confirmarAjuste() {
    if (!valorAjuste || Number(valorAjuste) <= 0) return;
    setRegistrandoAjuste(true);
    try {
      await chamarApi(`/clientes-fiado/${painelAberto.id}/ajuste`, {
        method: 'POST',
        body: JSON.stringify({ valor: Number(valorAjuste), tipo: painelAberto.tipo }),
      });
      setValorAjuste('');
      setPainelAberto(null);
      await carregar();
      if (historicoAbertoId === painelAberto.id) {
        chamarApi(`/clientes-fiado/${painelAberto.id}/historico`).then(setHistorico).catch(() => {});
      }
    } catch {
      setErro('Não foi possível registrar o ajuste.');
    } finally {
      setRegistrandoAjuste(false);
    }
  }

  return (
    <div>
      <div className="cartao-cabecalho" style={{ marginBottom: 14 }}>
        <h2 className="titulo-secao" style={{ margin: 0 }}>Fiado</h2>
        <button className="botao-primario pequeno neutro" onClick={() => setMostrarNovo((v) => !v)}>
          {mostrarNovo ? 'Cancelar' : 'Novo cliente'}
        </button>
      </div>

      {erro && <p className="erro-texto">{erro}</p>}

      {mostrarNovo && (
        <form onSubmit={criarCliente} className="cartao" style={{ marginBottom: 16 }}>
          <label className="rotulo-campo">Nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do cliente" />
          <label className="rotulo-campo">Telefone (opcional)</label>
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(00) 00000-0000" />
          <label className="rotulo-campo">Limite de crédito (opcional)</label>
          <input
            type="number"
            step="0.01"
            value={limiteCredito}
            onChange={(e) => setLimiteCredito(e.target.value)}
            placeholder="Ex: 100.00"
          />
          <button className="botao-primario" disabled={salvando} type="submit" style={{ marginTop: 8 }}>
            {salvando ? 'Salvando...' : 'Cadastrar cliente'}
          </button>
        </form>
      )}

      {carregando && <p className="vazio">Carregando...</p>}
      {!carregando && clientes.length === 0 && !erro && (
        <p className="vazio">Nenhum cliente fiado cadastrado ainda.</p>
      )}

      {clientes.map((c) => {
        const saldo = Number(c.saldoDevedor);
        const limite = c.limiteCredito ? Number(c.limiteCredito) : null;
        const passouLimite = limite && saldo > limite;
        const semDivida = saldo <= 0;
        const percentualLimite = limite ? Math.min((saldo / limite) * 100, 100) : null;
        const painelAumento = painelAberto?.id === c.id && painelAberto?.tipo === 'AUMENTO';
        const painelPagamento = painelAberto?.id === c.id && painelAberto?.tipo === 'PAGAMENTO';

        return (
          <div key={c.id} className={`cartao ${passouLimite ? 'cartao-alerta' : ''}`} style={{ marginBottom: 12 }}>
            <div className="cartao-produto" style={{ marginBottom: 0, alignItems: 'flex-start' }}>
              <div className="avatar-cliente">{iniciais(c.nome)}</div>
              <div className="info-produto">
                <div className="nome">{c.nome}</div>
                <div className="detalhe">{c.telefone || 'Sem telefone'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className={`valor-saldo ${semDivida ? 'em-dia' : passouLimite ? 'estourado' : 'devendo'}`}>
                  R$ {Math.max(saldo, 0).toFixed(2)}
                </div>
                <div className="status-saldo">
                  {semDivida ? 'Em dia' : passouLimite ? 'Acima do limite' : 'Devendo'}
                </div>
              </div>
            </div>

            {limite && (
              <div style={{ marginTop: 10 }}>
                <div className="barra-limite">
                  <div
                    className={`barra-limite-preenchida ${passouLimite ? 'estourado' : ''}`}
                    style={{ width: `${percentualLimite}%` }}
                  />
                </div>
                <div className="subtexto" style={{ marginTop: 4, fontSize: 12 }}>
                  R$ {Math.max(saldo, 0).toFixed(2)} de R$ {limite.toFixed(2)} usados
                </div>
              </div>
            )}

            <div className="linha-acoes-cartao" style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                className="botao-primario pequeno neutro"
                style={{ flex: 1 }}
                onClick={() => abrirPainel(c.id, 'AUMENTO')}
              >
                {painelAumento ? 'Cancelar' : '+ Dívida'}
              </button>
              {saldo > 0 && (
                <button
                  className="botao-primario pequeno"
                  style={{ flex: 1 }}
                  onClick={() => abrirPainel(c.id, 'PAGAMENTO')}
                >
                  {painelPagamento ? 'Cancelar' : '💰 Baixar dívida'}
                </button>
              )}
            </div>

            <button
              className="botao-primario pequeno neutro"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => alternarHistorico(c.id)}
            >
              {historicoAbertoId === c.id ? 'Ocultar histórico' : '📋 Ver histórico'}
            </button>

            {historicoAbertoId === c.id && (
              <div className="painel-inline">
                {carregandoHistorico && <p className="subtexto">Carregando histórico...</p>}
                {erroHistorico && <p className="erro-texto">{erroHistorico}</p>}

                {historico && (
                  <>
                    {historico.movimentacoes.length === 0 && historico.pagamentos.length === 0 && (
                      <p className="subtexto">Nenhuma compra ou pagamento registrado ainda.</p>
                    )}

                    {historico.movimentacoes.length > 0 && (
                      <>
                        <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Compras fiado</p>
                        {historico.movimentacoes.map((m) => (
                          <div key={m.id} className="linha-forma-pagamento">
                            <span>
                              {m.produto?.nome || 'Produto removido'} · {m.quantidade} un.
                              <br />
                              <span style={{ fontSize: 12, opacity: 0.7 }}>
                                {new Date(m.criadoEm).toLocaleString('pt-BR')}
                              </span>
                            </span>
                            <strong>
                              {m.valorTotal ? `R$ ${Number(m.valorTotal).toFixed(2)}` : '—'}
                            </strong>
                          </div>
                        ))}
                      </>
                    )}

                    {historico.pagamentos.length > 0 && (
                      <>
                        <p style={{ fontWeight: 700, fontSize: 13, margin: '10px 0 6px' }}>Pagamentos</p>
                        {historico.pagamentos.map((pg) => (
                          <div key={pg.id} className="linha-forma-pagamento">
                            <span style={{ fontSize: 12, opacity: 0.7 }}>
                              {new Date(pg.criadoEm).toLocaleString('pt-BR')}
                            </span>
                            <strong style={{ color: 'var(--verde, #2ecc71)' }}>
                              R$ {Number(pg.valor).toFixed(2)}
                            </strong>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {painelAberto?.id === c.id && (
              <div className="painel-inline">
                <label className="rotulo-campo" style={{ marginTop: 0 }}>
                  {painelAberto.tipo === 'AUMENTO' ? 'Valor da dívida (R$)' : 'Valor recebido (R$)'}
                </label>
                <div className="linha-valor-confirmar">
                  <div>
                    <input
                      type="number"
                      step="0.01"
                      autoFocus
                      value={valorAjuste}
                      onChange={(e) => setValorAjuste(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <button className="botao-primario" disabled={registrandoAjuste} onClick={confirmarAjuste}>
                    {registrandoAjuste ? '...' : 'Confirmar'}
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