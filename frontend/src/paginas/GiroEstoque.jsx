import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { chamarApi } from '../api';

const CORES_CLASSE = { A: '#2ecc71', B: '#ffc107', C: '#ff6b6b' };
const OPCOES_PERIODO = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
];

export default function GiroEstoque() {
  const navigate = useNavigate();
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      setErro('');
      try {
        const resultado = await chamarApi(`/relatorios/giro-estoque?dias=${dias}`);
        setDados(resultado);
      } catch {
        setErro('Não foi possível carregar o relatório de giro de estoque.');
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, [dias]);

  return (
    <div>
      <div className="cartao-cabecalho" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
        <div>
          <h2 className="titulo-secao" style={{ margin: 0 }}>Giro de estoque</h2>
          <p className="subtexto" style={{ margin: '2px 0 0' }}>
            Curva ABC: quais produtos concentram o faturamento e quais estão parados.
          </p>
        </div>
        <button className="botao-primario pequeno neutro" onClick={() => navigate(-1)}>Voltar</button>
      </div>

      <div className="select-forma-pagamento" style={{ marginBottom: 12 }}>
        {OPCOES_PERIODO.map((o) => (
          <button
            key={o.dias}
            type="button"
            className={`botao-primario pequeno ${dias === o.dias ? '' : 'neutro'}`}
            onClick={() => setDias(o.dias)}
          >
            {o.rotulo}
          </button>
        ))}
      </div>

      {erro && <p className="erro-texto">{erro}</p>}
      {carregando && <p className="carregando-texto">Carregando...</p>}

      {!carregando && dados && (
        <>
          <div className="cartao" style={{ marginBottom: 12 }}>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
              Faturamento total no período (só produtos que venderam)
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 700 }}>
              R$ {dados.totalValorVendido.toFixed(2)}
            </p>
          </div>

          <div className="cartao" style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, opacity: 0.7, margin: '0 0 8px' }}>
              <strong style={{ color: CORES_CLASSE.A }}>A</strong> = ~80% do faturamento (prioridade máxima, nunca deixar faltar) ·{' '}
              <strong style={{ color: CORES_CLASSE.B }}>B</strong> = próximos ~15% ·{' '}
              <strong style={{ color: CORES_CLASSE.C }}>C</strong> = giro baixo
            </p>
          </div>

          {dados.produtos.length === 0 && (
            <p className="vazio">Nenhuma venda registrada nesse período.</p>
          )}

          {dados.produtos.map((p) => (
            <div key={p.produtoId} className="cartao" style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {p.nome}
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        color: CORES_CLASSE[p.classe],
                        border: `1px solid ${CORES_CLASSE[p.classe]}`,
                        borderRadius: 4,
                        padding: '1px 6px',
                      }}
                    >
                      {p.classe}
                    </span>
                  </p>
                  <p className="subtexto" style={{ margin: '2px 0 0' }}>
                    {p.quantidadeVendida} un. vendidas · {p.percentualDoTotal.toFixed(1)}% do faturamento
                  </p>
                </div>
                <strong>R$ {p.valorVendido.toFixed(2)}</strong>
              </div>
            </div>
          ))}

          {dados.semGiro.length > 0 && (
            <>
              <p style={{ fontSize: 13, fontWeight: 700, margin: '16px 0 8px', opacity: 0.85 }}>
                ⚠️ Parados no período ({dados.semGiro.length}) — têm estoque, mas não venderam nada
              </p>
              {dados.semGiro.map((p) => (
                <div key={p.produtoId} className="linha-forma-pagamento">
                  <span>{p.nome}</span>
                  <span style={{ opacity: 0.7 }}>{p.estoqueAtual} un. parada{p.estoqueAtual !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
