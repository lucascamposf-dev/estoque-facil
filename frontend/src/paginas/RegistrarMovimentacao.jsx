import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db, gerarIdLocal } from '../db';
import { listarProdutosLocal, registrarMovimentacaoOffline, chamarApi, estaOnline } from '../api';
import LeitorCodigoBarras from '../componentes/LeitorCodigoBarras';

const FORMAS_PAGAMENTO = [
  { valor: 'DINHEIRO', rotulo: 'Dinheiro' },
  { valor: 'PIX', rotulo: 'Pix' },
  { valor: 'DEBITO', rotulo: 'Débito' },
  { valor: 'CREDITO', rotulo: 'Crédito' },
];

export default function RegistrarMovimentacao() {
  const { tipo } = useParams(); // "ENTRADA" ou "SAIDA"
  const navigate = useNavigate();

  const [produtos, setProdutos] = useState([]);
  const [busca, setBusca] = useState('');
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [quantidade, setQuantidade] = useState(1);
  const [mostrarLeitor, setMostrarLeitor] = useState(false);
  const [avisoLeitor, setAvisoLeitor] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('DINHEIRO');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const [unidades, setUnidades] = useState([]);
  const [unidadeSelecionada, setUnidadeSelecionada] = useState(null); // null = unidade base

  const [fornecedores, setFornecedores] = useState([]);
  const [fornecedorId, setFornecedorId] = useState('');
  const [custoUnitario, setCustoUnitario] = useState('');

  useEffect(() => {
    listarProdutosLocal().then(setProdutos);
    if (tipo === 'ENTRADA' && estaOnline()) {
      chamarApi('/fornecedores').then(setFornecedores).catch(() => {});
    }
  }, [tipo]);

  // Busca as formas de venda (fardo, caixa...) desse produto assim que ele é
  // selecionado - mesmo padrão usado na Venda Rápida
  useEffect(() => {
    setUnidades([]);
    setUnidadeSelecionada(null);
    if (!produtoSelecionado || !produtoSelecionado.servidorId || !estaOnline()) return;

    chamarApi(`/produtos/${produtoSelecionado.servidorId}/unidades`)
      .then(setUnidades)
      .catch(() => {
        // sem unidades cadastradas pra esse produto, ou sem internet - segue só com a unidade base
      });
  }, [produtoSelecionado]);

  async function aoLerCodigo(codigo) {
    setMostrarLeitor(false);
    const encontrado = await db.produtos.where('codigoBarras').equals(codigo).first();
    if (encontrado) {
      setProdutoSelecionado(encontrado);
      setAvisoLeitor('');
    } else {
      setAvisoLeitor('Nenhum produto cadastrado com esse código de barras.');
    }
  }

  const produtosFiltrados = produtos.filter((p) =>
    p.nome.toLowerCase().includes(busca.toLowerCase())
  );

  async function confirmar() {
    if (!produtoSelecionado) return;
    setSalvando(true);
    setErro('');

    try {
      const resultado = await registrarMovimentacaoOffline({
        produtoId: produtoSelecionado.servidorId,
        tipo,
        quantidade: Number(quantidade),
        motivo: tipo === 'SAIDA' ? 'venda' : 'compra',
        formaPagamento: tipo === 'SAIDA' ? formaPagamento : undefined,
        unidadeVendaId: unidadeSelecionada ? unidadeSelecionada.id : undefined,
        fornecedorId: tipo === 'ENTRADA' && fornecedorId ? fornecedorId : undefined,
        custoUnitario: tipo === 'ENTRADA' && custoUnitario ? Number(custoUnitario) : undefined,
        idLocal: await gerarIdLocal(),
      });

      // Atualiza o número exibido localmente na hora, sem esperar sincronizar.
      // Se a venda foi numa unidade diferente (fardo/caixa), converte pra
      // unidade-base antes de debitar, senão o número local fica errado.
      const multiplicador = unidadeSelecionada ? unidadeSelecionada.quantidadeEmUnidades : 1;
      const quantidadeBase = Number(quantidade) * multiplicador;
      const novoEstoque =
        tipo === 'ENTRADA'
          ? produtoSelecionado.estoqueAtual + quantidadeBase
          : produtoSelecionado.estoqueAtual - quantidadeBase;
      await db.produtos.update(produtoSelecionado.id, { estoqueAtual: novoEstoque });

      // Não bloqueia navegação por causa disso - só um aviso, igual na Venda Rápida.
      // Só dá pra saber se ficou negativo quando a venda foi online (registrada na
      // hora); vendas feitas offline só mostram isso depois, na sincronização.
      if (resultado?.avisoEstoqueNegativo) {
        alert(`Atenção: o estoque de "${produtoSelecionado.nome}" ficou negativo. Confira a contagem quando possível.`);
      }

      navigate('/');
    } catch {
      setErro('Não foi possível salvar. Verifique sua conexão e tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  const titulo = tipo === 'ENTRADA' ? 'Registrar entrada' : 'Venda simples (1 item)';

  return (
    <div>
      <h2 className="titulo-secao">{titulo}</h2>

      {!produtoSelecionado ? (
        <>
          <button
            type="button"
            className="botao-primario"
            style={{ background: 'var(--branco-giz)', marginBottom: 12 }}
            onClick={() => setMostrarLeitor(true)}
          >
            📷 Escanear código de barras
          </button>

          {avisoLeitor && (
            <p style={{ fontSize: 13, color: '#ffb4b4', marginTop: -6 }}>{avisoLeitor}</p>
          )}

          <input
            placeholder="Ou buscar produto pelo nome..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {produtosFiltrados.length === 0 && (
            <p className="vazio">
              Nenhum produto encontrado.
              <br />
              <a href="#/cadastrar-produto" style={{ color: 'var(--ambar)' }}>
                Cadastrar um produto novo
              </a>
            </p>
          )}
          {produtosFiltrados.map((p) => (
            <div key={p.id} className="cartao cartao-produto" onClick={() => setProdutoSelecionado(p)}>
              <div className="foto-produto">
                {p.fotoUrl ? (
                  <img src={p.fotoUrl} alt={p.nome} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
                ) : (
                  '🍾'
                )}
              </div>
              <div className="info-produto">
                <div className="nome">{p.nome}</div>
                <div className="detalhe">Estoque atual: {p.estoqueAtual}</div>
              </div>
            </div>
          ))}
        </>
      ) : (
        <>
          <div className="cartao cartao-produto">
            <div className="foto-produto">
              {produtoSelecionado.fotoUrl ? (
                <img src={produtoSelecionado.fotoUrl} alt={produtoSelecionado.nome} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
              ) : (
                '🍾'
              )}
            </div>
            <div className="info-produto">
              <div className="nome">{produtoSelecionado.nome}</div>
              <div className="detalhe">Estoque atual: {produtoSelecionado.estoqueAtual}</div>
            </div>
          </div>

          {unidades.length > 0 && (
            <>
              <label style={{ fontSize: 14, opacity: 0.8 }}>Forma de venda</label>
              <div className="select-forma-pagamento" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`chip-categoria ${!unidadeSelecionada ? 'ativo' : ''}`}
                  onClick={() => setUnidadeSelecionada(null)}
                >
                  Unidade
                </button>
                {unidades.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={`chip-categoria ${unidadeSelecionada?.id === u.id ? 'ativo' : ''}`}
                    onClick={() => setUnidadeSelecionada(u)}
                  >
                    {u.nome}
                  </button>
                ))}
              </div>
            </>
          )}

          <label style={{ fontSize: 14, opacity: 0.8 }}>
            Quantidade {unidadeSelecionada ? `(em ${unidadeSelecionada.nome})` : ''}
          </label>
          <input
            type="number"
            min="1"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
          />

          {tipo === 'ENTRADA' && (
            <>
              <label style={{ fontSize: 14, opacity: 0.8 }}>Fornecedor (opcional)</label>
              <select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                <option value="">Não informado</option>
                {fornecedores.map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
              </select>

              <label style={{ fontSize: 14, opacity: 0.8 }}>Custo pago por unidade (opcional)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="R$ 0,00"
                value={custoUnitario}
                onChange={(e) => setCustoUnitario(e.target.value)}
              />
              <p style={{ fontSize: 12, opacity: 0.6, marginTop: -6, marginBottom: 12 }}>
                Se informar, atualiza o custo médio do produto automaticamente.
              </p>
            </>
          )}

          {tipo === 'SAIDA' && (
            <>
              <label style={{ fontSize: 14, opacity: 0.8 }}>Forma de pagamento</label>
              <div className="select-forma-pagamento" style={{ marginBottom: 12 }}>
                {FORMAS_PAGAMENTO.map((f) => (
                  <button
                    key={f.valor}
                    type="button"
                    className={`chip-categoria ${formaPagamento === f.valor ? 'ativo' : ''}`}
                    onClick={() => setFormaPagamento(f.valor)}
                  >
                    {f.rotulo}
                  </button>
                ))}
              </div>
            </>
          )}

          {erro && <p style={{ color: '#ffb4b4', fontSize: 14 }}>{erro}</p>}

          <button className="botao-primario" disabled={salvando} onClick={confirmar}>
            {salvando ? 'Salvando...' : `Confirmar ${tipo === 'ENTRADA' ? 'entrada' : 'venda'}`}
          </button>

          <button
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', marginTop: 12 }}
            onClick={() => { setProdutoSelecionado(null); setUnidadeSelecionada(null); setFornecedorId(''); setCustoUnitario(''); }}
          >
            ← Trocar produto
          </button>
        </>
      )}

      {mostrarLeitor && (
        <LeitorCodigoBarras
          onLeitura={aoLerCodigo}
          onFechar={(mensagemErro) => {
            setMostrarLeitor(false);
            if (mensagemErro) setAvisoLeitor(mensagemErro);
          }}
        />
      )}
    </div>
  );
}