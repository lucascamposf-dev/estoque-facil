import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { chamarApi } from '../api';

export default function InventarioDetalhe() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [inventario, setInventario] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [salvandoItemId, setSalvandoItemId] = useState(null);
  const [finalizando, setFinalizando] = useState(false);
  const [resultadoFinalizacao, setResultadoFinalizacao] = useState(null);
  const [confirmandoFinalizacao, setConfirmandoFinalizacao] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const dados = await chamarApi(`/inventario/${id}`);
      setInventario(dados);
    } catch {
      setErro('Não foi possível carregar esse inventário.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [id]);

  async function salvarContagem(item, valor) {
    if (valor === '' || valor === null) return;
    const numero = Math.max(0, Math.round(Number(valor)));
    setSalvandoItemId(item.id);
    try {
      const atualizado = await chamarApi(`/inventario/${id}/itens/${item.id}`, {
        method: 'PUT',
        body: JSON.stringify({ estoqueContado: numero }),
      });
      setInventario((inv) => ({
        ...inv,
        itens: inv.itens.map((i) => (i.id === item.id ? { ...i, ...atualizado } : i)),
      }));
    } catch {
      setErro('Não foi possível salvar essa contagem. Tente de novo.');
    } finally {
      setSalvandoItemId(null);
    }
  }

  async function finalizar() {
    setFinalizando(true);
    setErro('');
    try {
      const resultado = await chamarApi(`/inventario/${id}/finalizar`, { method: 'POST' });
      setResultadoFinalizacao(resultado);
      setConfirmandoFinalizacao(false);
    } catch (e) {
      setErro(e.message || 'Não foi possível finalizar o inventário.');
    } finally {
      setFinalizando(false);
    }
  }

  async function cancelar() {
    if (!window.confirm('Cancelar essa contagem? Nenhum ajuste de estoque será feito.')) return;
    try {
      await chamarApi(`/inventario/${id}/cancelar`, { method: 'POST' });
      navigate('/inventario');
    } catch {
      setErro('Não foi possível cancelar o inventário.');
    }
  }

  const itensFiltrados = useMemo(() => {
    if (!inventario) return [];
    const termo = busca.trim().toLowerCase();
    if (!termo) return inventario.itens;
    return inventario.itens.filter((i) => i.produto.nome.toLowerCase().includes(termo));
  }, [inventario, busca]);

  const resumoContagem = useMemo(() => {
    if (!inventario) return { contados: 0, total: 0, comDiferenca: 0 };
    const contados = inventario.itens.filter((i) => i.estoqueContado !== null);
    const comDiferenca = contados.filter((i) => i.estoqueContado !== i.estoqueSistema);
    return { contados: contados.length, total: inventario.itens.length, comDiferenca: comDiferenca.length };
  }, [inventario]);

  if (carregando) return <p className="carregando-texto">Carregando...</p>;
  if (!inventario) return <p className="erro-texto">{erro || 'Inventário não encontrado.'}</p>;

  if (resultadoFinalizacao) {
    return (
      <div>
        <h2 className="titulo-secao">Inventário finalizado ✅</h2>
        <div className="cartao">
          <p style={{ margin: 0 }}>
            <strong>{resultadoFinalizacao.itensAjustados}</strong> produto{resultadoFinalizacao.itensAjustados !== 1 ? 's' : ''} teve o estoque ajustado.
          </p>
          <p className="subtexto" style={{ margin: '4px 0 0' }}>
            {resultadoFinalizacao.itensContadosSemDiferenca} produto{resultadoFinalizacao.itensContadosSemDiferenca !== 1 ? 's' : ''} contado{resultadoFinalizacao.itensContadosSemDiferenca !== 1 ? 's' : ''} já estava{resultadoFinalizacao.itensContadosSemDiferenca !== 1 ? 'm' : ''} certo{resultadoFinalizacao.itensContadosSemDiferenca !== 1 ? 's' : ''}.
          </p>
        </div>
        <p className="subtexto" style={{ margin: '12px 0' }}>
          Os ajustes já aparecem no histórico de movimentações, marcados como "Ajuste de inventário".
        </p>
        <button className="botao-primario" onClick={() => navigate('/inventario')}>Voltar pros inventários</button>
      </div>
    );
  }

  const finalizado = inventario.status !== 'EM_ANDAMENTO';

  return (
    <div>
      <div className="cartao-cabecalho" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
        <div>
          <h2 className="titulo-secao" style={{ margin: 0 }}>
            Contagem de {new Date(inventario.criadoEm).toLocaleDateString('pt-BR')}
          </h2>
          <p className="subtexto" style={{ margin: '2px 0 0' }}>
            {resumoContagem.contados} de {resumoContagem.total} produtos contados
            {resumoContagem.comDiferenca > 0 && ` · ${resumoContagem.comDiferenca} com diferença`}
          </p>
        </div>
        <button className="botao-primario pequeno neutro" onClick={() => navigate('/inventario')}>Voltar</button>
      </div>

      {finalizado && (
        <p className="subtexto" style={{ marginBottom: 12 }}>
          Esse inventário já foi {inventario.status === 'FINALIZADO' ? 'finalizado' : 'cancelado'} — só visualização.
        </p>
      )}

      {erro && <p className="erro-texto">{erro}</p>}

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar produto..."
        style={{ marginBottom: 12 }}
      />

      {itensFiltrados.map((item) => {
        const diferenca = item.estoqueContado !== null ? item.estoqueContado - item.estoqueSistema : null;
        return (
          <div key={item.id} className="cartao cartao-produto" style={{ marginBottom: 8 }}>
            <div className="info-produto" style={{ flex: 1 }}>
              <div className="nome">{item.produto.nome}</div>
              <div className="detalhe">Sistema: {item.estoqueSistema} un.</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="number"
                min="0"
                disabled={finalizado}
                defaultValue={item.estoqueContado ?? ''}
                placeholder="Contar"
                style={{ width: 72, textAlign: 'center' }}
                onBlur={(e) => salvarContagem(item, e.target.value)}
              />
              {salvandoItemId === item.id && <span style={{ fontSize: 11, opacity: 0.6 }}>salvando...</span>}
              {diferenca !== null && diferenca !== 0 && (
                <strong style={{ color: diferenca > 0 ? '#2ecc71' : '#ff6b6b', fontSize: 13 }}>
                  {diferenca > 0 ? '+' : ''}{diferenca}
                </strong>
              )}
            </div>
          </div>
        );
      })}

      {!finalizado && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, position: 'sticky', bottom: 12 }}>
          {!confirmandoFinalizacao ? (
            <>
              <button
                className="botao-primario"
                style={{ flex: 1 }}
                disabled={resumoContagem.contados === 0}
                onClick={() => setConfirmandoFinalizacao(true)}
              >
                Finalizar contagem
              </button>
              <button className="botao-primario neutro" style={{ flex: 1 }} onClick={cancelar}>
                Cancelar
              </button>
            </>
          ) : (
            <div className="cartao" style={{ width: '100%', background: 'rgba(255,193,7,0.15)' }}>
              <p style={{ margin: 0, fontWeight: 700 }}>Confirmar finalização?</p>
              <p className="subtexto" style={{ margin: '4px 0 10px' }}>
                {resumoContagem.comDiferenca} produto{resumoContagem.comDiferenca !== 1 ? 's' : ''} vai{resumoContagem.comDiferenca !== 1 ? 'ão' : ''} ter o estoque ajustado
                pro número contado. Produtos não contados não são alterados.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="botao-primario pequeno" style={{ flex: 1 }} disabled={finalizando} onClick={finalizar}>
                  {finalizando ? 'Finalizando...' : 'Sim, finalizar'}
                </button>
                <button
                  className="botao-primario pequeno neutro"
                  style={{ flex: 1 }}
                  onClick={() => setConfirmandoFinalizacao(false)}
                  disabled={finalizando}
                >
                  Voltar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
