import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { chamarApi } from '../api';

const ROTULOS_STATUS = {
  EM_ANDAMENTO: { texto: 'Em andamento', cor: '#ffc107' },
  FINALIZADO: { texto: 'Finalizado', cor: '#2ecc71' },
  CANCELADO: { texto: 'Cancelado', cor: 'rgba(255,255,255,0.5)' },
};

export default function Inventario() {
  const navigate = useNavigate();
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [iniciando, setIniciando] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const dados = await chamarApi('/inventario');
      setLista(dados);
    } catch {
      setErro('Não foi possível carregar os inventários.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function iniciarNovo() {
    setIniciando(true);
    setErro('');
    try {
      const criado = await chamarApi('/inventario', { method: 'POST' });
      navigate(`/inventario/${criado.id}`);
    } catch (e) {
      if (e.status === 409) {
        // Já existe um em andamento - o backend manda o id dele, então já leva pra lá
        try {
          const corpo = JSON.parse(e.message.startsWith('{') ? e.message : '{}');
          if (corpo.inventarioId) return navigate(`/inventario/${corpo.inventarioId}`);
        } catch {
          // segue pro erro genérico abaixo
        }
        setErro('Já existe um inventário em andamento. Abra ele na lista abaixo.');
      } else {
        setErro('Não foi possível iniciar um novo inventário.');
      }
    } finally {
      setIniciando(false);
    }
  }

  const emAndamento = lista.find((i) => i.status === 'EM_ANDAMENTO');

  return (
    <div>
      <div className="cartao-cabecalho" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
        <div>
          <h2 className="titulo-secao" style={{ margin: 0 }}>Inventário</h2>
          <p className="subtexto" style={{ margin: '2px 0 0' }}>
            Contagem física do estoque, com ajuste automático das diferenças.
          </p>
        </div>
        <button className="botao-primario pequeno neutro" onClick={() => navigate(-1)}>Voltar</button>
      </div>

      {!emAndamento && (
        <button className="botao-primario" style={{ marginBottom: 16 }} disabled={iniciando} onClick={iniciarNovo}>
          {iniciando ? 'Iniciando...' : '+ Iniciar nova contagem'}
        </button>
      )}

      {emAndamento && (
        <div className="cartao" style={{ background: 'rgba(255,193,7,0.12)', marginBottom: 16 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>Você já tem uma contagem em andamento</p>
          <p className="subtexto" style={{ margin: '4px 0 10px' }}>
            Continue de onde parou antes de iniciar uma nova.
          </p>
          <button className="botao-primario pequeno" onClick={() => navigate(`/inventario/${emAndamento.id}`)}>
            Continuar contagem
          </button>
        </div>
      )}

      {erro && <p className="erro-texto">{erro}</p>}
      {carregando && <p className="carregando-texto">Carregando...</p>}
      {!carregando && lista.length === 0 && <p className="vazio">Nenhum inventário registrado ainda.</p>}

      <p style={{ fontSize: 13, fontWeight: 700, opacity: 0.7, margin: '8px 0' }}>Histórico</p>
      {lista.map((inv) => {
        const status = ROTULOS_STATUS[inv.status];
        return (
          <div
            key={inv.id}
            className="cartao"
            style={{ marginBottom: 8, cursor: 'pointer' }}
            onClick={() => navigate(`/inventario/${inv.id}`)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>
                  {new Date(inv.criadoEm).toLocaleDateString('pt-BR')} às {new Date(inv.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="subtexto" style={{ margin: '2px 0 0' }}>
                  {inv._count?.itens ?? 0} produto{(inv._count?.itens ?? 0) !== 1 ? 's' : ''}
                  {inv.responsavelNome && ` · ${inv.responsavelNome}`}
                </p>
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: status.cor }}>{status.texto}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
