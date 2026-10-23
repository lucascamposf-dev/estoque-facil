import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { chamarApi } from '../api';

export default function Fornecedores() {
  const navigate = useNavigate();
  const [fornecedores, setFornecedores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const lista = await chamarApi('/fornecedores');
      setFornecedores(lista);
    } catch {
      setErro('Não foi possível carregar os fornecedores.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  function abrirNovo() {
    setEditandoId(null);
    setNome('');
    setTelefone('');
    setObservacoes('');
    setMostrarForm(true);
  }

  function abrirEdicao(f) {
    setEditandoId(f.id);
    setNome(f.nome);
    setTelefone(f.telefone || '');
    setObservacoes(f.observacoes || '');
    setMostrarForm(true);
  }

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) return;
    setSalvando(true);
    setErro('');
    try {
      if (editandoId) {
        const atualizado = await chamarApi(`/fornecedores/${editandoId}`, {
          method: 'PUT',
          body: JSON.stringify({ nome, telefone, observacoes }),
        });
        setFornecedores((lista) => lista.map((f) => (f.id === editandoId ? atualizado : f)));
      } else {
        const criado = await chamarApi('/fornecedores', {
          method: 'POST',
          body: JSON.stringify({ nome, telefone, observacoes }),
        });
        setFornecedores((lista) => [...lista, criado].sort((a, b) => a.nome.localeCompare(b.nome)));
      }
      setMostrarForm(false);
    } catch {
      setErro('Não foi possível salvar o fornecedor.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(f) {
    if (!window.confirm(`Remover "${f.nome}"? Compras já registradas com esse fornecedor continuam no histórico.`)) return;
    try {
      await chamarApi(`/fornecedores/${f.id}`, { method: 'DELETE' });
      setFornecedores((lista) => lista.filter((x) => x.id !== f.id));
    } catch {
      setErro('Não foi possível remover o fornecedor.');
    }
  }

  return (
    <div>
      <div className="cartao-cabecalho" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
        <div>
          <h2 className="titulo-secao" style={{ margin: 0 }}>Fornecedores</h2>
          <p className="subtexto" style={{ margin: '2px 0 0' }}>
            Cadastre de quem você compra pra vincular nas entradas de estoque.
          </p>
        </div>
        <button className="botao-primario pequeno neutro" onClick={() => navigate(-1)}>Voltar</button>
      </div>

      {!mostrarForm && (
        <button className="botao-primario" style={{ marginBottom: 12 }} onClick={abrirNovo}>
          + Novo fornecedor
        </button>
      )}

      {mostrarForm && (
        <form onSubmit={salvar} className="cartao" style={{ marginBottom: 16 }}>
          <label className="rotulo-campo">Nome</label>
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex: Distribuidora Central" />

          <label className="rotulo-campo">Telefone (opcional)</label>
          <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(61) 90000-0000" />

          <label className="rotulo-campo">Observações (opcional)</label>
          <input value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="ex: entrega às terças" />

          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="botao-primario pequeno" style={{ flex: 1 }} disabled={salvando} type="submit">
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              type="button"
              className="botao-primario pequeno neutro"
              style={{ flex: 1 }}
              onClick={() => setMostrarForm(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {erro && <p className="erro-texto">{erro}</p>}
      {carregando && <p className="carregando-texto">Carregando...</p>}
      {!carregando && fornecedores.length === 0 && <p className="vazio">Nenhum fornecedor cadastrado ainda.</p>}

      {fornecedores.map((f) => (
        <div key={f.id} className="cartao" style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700 }}>{f.nome}</p>
              {f.telefone && <p className="subtexto" style={{ margin: '2px 0 0' }}>{f.telefone}</p>}
              {f.observacoes && <p className="subtexto" style={{ margin: '2px 0 0' }}>{f.observacoes}</p>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="botao-primario pequeno neutro" style={{ padding: '2px 8px' }} onClick={() => abrirEdicao(f)}>
                Editar
              </button>
              <button className="botao-primario pequeno neutro" style={{ padding: '2px 8px' }} onClick={() => remover(f)}>
                Remover
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
