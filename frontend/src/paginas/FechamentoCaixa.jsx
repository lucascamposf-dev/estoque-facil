import { useEffect, useState } from 'react';
import { db } from '../db';
import { chamarApi, estaOnline, obterPapel, registrarSangria, registrarSuprimento } from '../api';

const ROTULOS_FORMA = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  DEBITO: 'Débito',
  CREDITO: 'Crédito',
  FIADO: 'Fiado',
  SEM_REGISTRO: 'Sem forma registrada',
};

export default function FechamentoCaixa() {
  const ehAdmin = obterPapel() === 'ADMIN';

  const [carregando, setCarregando] = useState(true);
  const [offline, setOffline] = useState(false);
  const [erro, setErro] = useState('');

  // Dados "de verdade" (todos os aparelhos/funcionários), vindos do servidor
  const [fechamentoServidor, setFechamentoServidor] = useState(null);

  // Fallback só deste aparelho, usado quando offline ou se a chamada online falhar
  const [movimentacoesHoje, setMovimentacoesHoje] = useState([]);
  const [produtosPorId, setProdutosPorId] = useState({});

  const [vendasPorFuncionario, setVendasPorFuncionario] = useState(null);

  // Formulário de sangria/suprimento - antes o backend já sabia fazer isso,
  // só não existia nenhuma tela que chamasse a rota
  const [formAberto, setFormAberto] = useState(null); // 'sangria' | 'suprimento' | null
  const [valorForm, setValorForm] = useState('');
  const [motivoForm, setMotivoForm] = useState('');
  const [enviandoForm, setEnviandoForm] = useState(false);
  const [erroForm, setErroForm] = useState('');

  async function recarregarFechamento() {
    if (!estaOnline()) return;
    try {
      const dados = await chamarApi('/relatorios/fechamento-dia');
      setFechamentoServidor(dados);
    } catch {
      // Se falhar, mantém o que já estava na tela - o valor só não atualiza agora
    }
  }

  function abrirForm(tipo) {
    setFormAberto(tipo);
    setValorForm('');
    setMotivoForm('');
    setErroForm('');
  }

  async function enviarForm() {
    const valor = Number(valorForm.replace(',', '.'));
    if (!valor || valor <= 0) {
      setErroForm('Informe um valor válido.');
      return;
    }
    setEnviandoForm(true);
    setErroForm('');
    try {
      if (formAberto === 'sangria') {
        await registrarSangria({ valor, motivo: motivoForm || undefined });
      } else {
        await registrarSuprimento({ valor, motivo: motivoForm || undefined });
      }
      setFormAberto(null);
      await recarregarFechamento();
    } catch (e) {
      setErroForm(e.message || 'Não foi possível registrar. Tente de novo.');
    } finally {
      setEnviandoForm(false);
    }
  }

  async function carregarVendasPorFuncionario() {
    if (!ehAdmin || !estaOnline()) return;
    try {
      const dados = await chamarApi('/relatorios/resumo-dia');
      setVendasPorFuncionario(dados.vendasPorFuncionarioHoje || []);
    } catch {
      // Sem esse resumo, a tela segue funcionando normalmente com o resto
    }
  }

  async function carregarFallbackLocal() {
    const hoje = new Date().toISOString().slice(0, 10);

    // Entradas/saídas avulsas (fora do carrinho) continuam na tabela "movimentacoes"
    const todas = await db.movimentacoes.toArray();
    const avulsasDoDia = todas.filter((m) => m.criadoEm.slice(0, 10) === hoje);

    // Vendas do carrinho agora ficam na tabela "vendas", cada uma com vários
    // itens dentro - explode em linhas soltas pra reaproveitar a mesma exibição
    // "uma linha por produto" que a tela já usava.
    const vendas = await db.vendas.toArray();
    const vendasDoDiaExplodidas = vendas
      .filter((v) => v.criadoEm.slice(0, 10) === hoje)
      .flatMap((v) =>
        (v.itens || []).map((item, indice) => ({
          id: `${v.id}-${indice}`,
          tipo: 'SAIDA',
          produtoId: item.produtoId,
          quantidade: item.quantidade,
          sincronizado: v.sincronizado,
          criadoEm: v.criadoEm,
        }))
      );

    setMovimentacoesHoje([...avulsasDoDia, ...vendasDoDiaExplodidas]);

    const produtos = await db.produtos.toArray();
    const mapa = {};
    produtos.forEach((p) => (mapa[p.servidorId] = p));
    setProdutosPorId(mapa);
  }

  useEffect(() => {
    async function carregar() {
      setCarregando(true);
      setErro('');

      if (estaOnline()) {
        try {
          const dados = await chamarApi('/relatorios/fechamento-dia');
          setFechamentoServidor(dados);
          setOffline(false);
          // Ainda carrega a lista de movimentações locais só pra exibir o
          // detalhe item a item (o servidor não devolve isso nessa rota)
          await carregarFallbackLocal();
          setCarregando(false);
          return;
        } catch {
          // Se a chamada online falhar, cai pro fallback 100% local abaixo
        }
      }

      try {
        await carregarFallbackLocal();
        setFechamentoServidor(null);
        setOffline(true);
      } catch {
        setErro('Não foi possível carregar o fechamento de caixa.');
      } finally {
        setCarregando(false);
      }
    }
    carregar();
    carregarVendasPorFuncionario();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vendasLocais = movimentacoesHoje.filter((m) => m.tipo === 'SAIDA');
  const entradasLocais = movimentacoesHoje.filter((m) => m.tipo === 'ENTRADA');

  // Só usado no fallback offline - o total "de verdade" (todos os aparelhos)
  // vem de fechamentoServidor.totalVendido quando online
  const totalVendidoLocal = vendasLocais.reduce((soma, m) => {
    const produto = produtosPorId[m.produtoId];
    return soma + (produto ? Number(produto.precoVenda) * m.quantidade : 0);
  }, 0);

  return (
    <div>
      <h2 className="titulo-secao">Fechamento de hoje</h2>

      {offline && (
        <p className="subtexto" style={{ marginBottom: 12 }}>
          Sem internet — mostrando só as vendas registradas neste aparelho. O fechamento
          completo (todos os aparelhos, formas de pagamento e sangria) volta assim que a
          internet voltar.
        </p>
      )}
      {erro && <p className="erro-texto">{erro}</p>}

      <div className="cartao">
        <div style={{ fontSize: 13, opacity: 0.6 }}>Total vendido hoje</div>
        <div className="estoque-numero" style={{ fontSize: 32 }}>
          R$ {(fechamentoServidor ? fechamentoServidor.totalVendido : totalVendidoLocal).toFixed(2)}
        </div>
        {!offline && (
          <p className="subtexto" style={{ marginTop: 4 }}>
            Considera vendas de todos os aparelhos e funcionários.
            {fechamentoServidor?.quantidadeVendas != null &&
              ` · ${fechamentoServidor.quantidadeVendas} venda${fechamentoServidor.quantidadeVendas === 1 ? '' : 's'} hoje`}
          </p>
        )}
      </div>

      {fechamentoServidor && (
        <div className="cartao">
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Por forma de pagamento</p>
          {Object.entries(fechamentoServidor.porFormaPagamento)
            .filter(([, valor]) => valor > 0)
            .map(([forma, valor]) => (
              <div key={forma} className="linha-forma-pagamento">
                <span>{ROTULOS_FORMA[forma] || forma}</span>
                <strong>R$ {Number(valor).toFixed(2)}</strong>
              </div>
            ))}
          {Object.values(fechamentoServidor.porFormaPagamento).every((v) => v === 0) && (
            <p className="subtexto">Nenhuma venda registrada hoje ainda.</p>
          )}
        </div>
      )}

      {fechamentoServidor && (
        <div className="cartao">
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Caixa em dinheiro</p>
          <div className="linha-forma-pagamento">
            <span>Vendido em dinheiro</span>
            <strong>R$ {Number(fechamentoServidor.porFormaPagamento.DINHEIRO || 0).toFixed(2)}</strong>
          </div>
          <div className="linha-forma-pagamento">
            <span>Suprimentos de hoje ({fechamentoServidor.suprimentos.length})</span>
            <strong style={{ color: 'var(--verde-sucesso, #2ecc71)' }}>
              + R$ {Number(fechamentoServidor.totalSuprimentos).toFixed(2)}
            </strong>
          </div>
          <div className="linha-forma-pagamento">
            <span>Sangrias de hoje ({fechamentoServidor.sangrias.length})</span>
            <strong style={{ color: 'var(--vermelho-alerta)' }}>
              − R$ {Number(fechamentoServidor.totalSangrias).toFixed(2)}
            </strong>
          </div>
          <div className="linha-forma-pagamento" style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontWeight: 700 }}>Saldo esperado em dinheiro</span>
            <strong>R$ {Number(fechamentoServidor.saldoEsperadoDinheiro).toFixed(2)}</strong>
          </div>

          {!estaOnline() ? (
            <p className="subtexto" style={{ marginTop: 10 }}>Sangria e suprimento precisam de internet.</p>
          ) : formAberto ? (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontWeight: 600, marginBottom: 6 }}>
                {formAberto === 'sangria' ? 'Registrar sangria (retirada)' : 'Registrar suprimento (reforço)'}
              </p>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Valor (R$)"
                autoFocus
                value={valorForm}
                onChange={(e) => setValorForm(e.target.value)}
                style={{ width: '100%', marginBottom: 6 }}
              />
              <input
                type="text"
                placeholder="Motivo (opcional)"
                value={motivoForm}
                onChange={(e) => setMotivoForm(e.target.value)}
                style={{ width: '100%', marginBottom: 6 }}
              />
              {erroForm && <p className="erro-texto" style={{ marginBottom: 6 }}>{erroForm}</p>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="botao-primario"
                  style={{ flex: 1 }}
                  disabled={enviandoForm}
                  onClick={enviarForm}
                >
                  {enviandoForm ? 'Salvando...' : 'Confirmar'}
                </button>
                <button
                  className="botao-primario neutro"
                  style={{ flex: 1 }}
                  disabled={enviandoForm}
                  onClick={() => setFormAberto(null)}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="botao-primario neutro" style={{ flex: 1 }} onClick={() => abrirForm('sangria')}>
                🔻 Sangria
              </button>
              <button className="botao-primario neutro" style={{ flex: 1 }} onClick={() => abrirForm('suprimento')}>
                🔺 Suprimento
              </button>
            </div>
          )}
        </div>
      )}

      {ehAdmin && vendasPorFuncionario && vendasPorFuncionario.length > 0 && (
        <div className="cartao">
          <p style={{ fontWeight: 700, marginBottom: 8 }}>Vendas de hoje por funcionário</p>
          <p className="subtexto" style={{ marginBottom: 8 }}>
            Considera vendas feitas em qualquer aparelho, não só este.
          </p>
          {vendasPorFuncionario.map((f) => (
            <div key={f.nome} className="linha-forma-pagamento">
              <span>{f.nome} · {f.quantidade} venda{f.quantidade > 1 ? 's' : ''}</span>
              <strong>R$ {f.total.toFixed(2)}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="cartao">
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Vendas registradas (este aparelho)</span>
          <strong>{vendasLocais.length}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
          <span>Entradas registradas (este aparelho)</span>
          <strong>{entradasLocais.length}</strong>
        </div>
      </div>

      <p style={{ fontSize: 13, opacity: 0.7, fontWeight: 600, margin: '16px 0 8px' }}>
        Movimentações de hoje (este aparelho)
      </p>

      {carregando && <p className="vazio">Carregando...</p>}
      {!carregando && movimentacoesHoje.length === 0 && <p className="vazio">Nada registrado hoje ainda.</p>}

      {movimentacoesHoje
        .slice()
        .reverse()
        .map((m) => {
          const produto = produtosPorId[m.produtoId];
          return (
            <div key={m.id} className="cartao cartao-produto">
              <div className="foto-produto">{m.tipo === 'SAIDA' ? '⬆️' : '⬇️'}</div>
              <div className="info-produto">
                <div className="nome">{produto ? produto.nome : 'Produto'}</div>
                <div className="detalhe">
                  {m.tipo === 'SAIDA' ? 'Venda' : 'Entrada'} · {m.quantidade} un.
                  {!m.sincronizado && ' · pendente de sincronizar'}
                </div>
              </div>
            </div>
          );
        })}
    </div>
  );
}
