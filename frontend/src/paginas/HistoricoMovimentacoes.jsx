import { useEffect, useState } from 'react';
import { chamarApi, estaOnline, obterPapel } from '../api';
import { db } from '../db';

export default function HistoricoMovimentacoes() {
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [offline, setOffline] = useState(false);
  const [funcionarios, setFuncionarios] = useState([]);
  const [filtroFuncionario, setFiltroFuncionario] = useState('');
  const ehAdmin = obterPapel() === 'ADMIN';

  useEffect(() => {
    if (ehAdmin && estaOnline()) {
      chamarApi('/funcionarios').then(setFuncionarios).catch(() => {});
    }
  }, [ehAdmin]);

  useEffect(() => {
    async function carregar() {
      if (estaOnline()) {
        try {
          const query = filtroFuncionario ? `&funcionario=${encodeURIComponent(filtroFuncionario)}` : '';
          const dados = await chamarApi(`/movimentacoes?limite=100${query}`);
          setMovimentacoes(dados);
          setOffline(false);
          setCarregando(false);
          return;
        } catch {
          // Se a chamada online falhar por qualquer motivo, cai pro fallback local abaixo
        }
      }

      // Sem internet (ou a chamada falhou): mostra o que já está salvo no aparelho.
      // Não tem os dados de produto/cliente-fiado prontos como o servidor manda,
      // então monta uma versão simplificada a partir do IndexedDB local.
      try {
        const produtos = await db.produtos.toArray();
        const mapaProdutos = {};
        produtos.forEach((p) => { if (p.servidorId) mapaProdutos[p.servidorId] = p; });

        const locais = await db.movimentacoes.orderBy('criadoEm').reverse().limit(100).toArray();
        const avulsas = locais.map((m) => ({
          id: m.id,
          tipo: m.tipo,
          quantidade: m.quantidade,
          formaPagamento: m.formaPagamento,
          criadoEm: m.criadoEm,
          produto: mapaProdutos[m.produtoId] || null,
          clienteFiado: null,
          pendente: !m.sincronizado,
        }));

        // Vendas do carrinho (tabela "vendas") - explode cada item numa linha,
        // igual já fazia com "movimentacoes", pra manter a mesma exibição
        const vendas = await db.vendas.orderBy('criadoEm').reverse().limit(100).toArray();
        const itensDeVendas = vendas.flatMap((v) =>
          (v.itens || []).map((item, indice) => ({
            id: `${v.id}-${indice}`,
            tipo: 'SAIDA',
            quantidade: item.quantidade,
            formaPagamento: v.formaPagamento,
            criadoEm: v.criadoEm,
            produto: mapaProdutos[item.produtoId] || null,
            clienteFiado: null,
            pendente: !v.sincronizado,
          }))
        );

        const montadas = [...avulsas, ...itensDeVendas].sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
        setMovimentacoes(montadas);
        setOffline(true);
      } catch {
        setErro('Não foi possível carregar o histórico.');
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, [filtroFuncionario]);

  return (
    <div>
      <h2 className="titulo-secao">Histórico de movimentações</h2>

      {ehAdmin && !offline && funcionarios.length > 0 && (
        <select
          value={filtroFuncionario}
          onChange={(e) => setFiltroFuncionario(e.target.value)}
          style={{ marginBottom: 12 }}
        >
          <option value="">Todos os funcionários</option>
          <option value="Admin">Admin</option>
          {funcionarios.map((f) => (
            <option key={f.id} value={f.nome}>{f.nome}</option>
          ))}
        </select>
      )}

      {offline && (
        <p className="subtexto" style={{ marginBottom: 12 }}>
          Sem internet — mostrando o que está salvo neste aparelho.
        </p>
      )}

      {carregando && <p className="vazio">Carregando...</p>}
      {erro && <p className="erro-texto">{erro}</p>}

      {!carregando && !erro && movimentacoes.length === 0 && (
        <p className="vazio">Nenhuma movimentação registrada ainda.</p>
      )}

      {movimentacoes.map((m) => (
        <div key={m.id} className="cartao cartao-produto">
          <div className="foto-produto">{m.tipo === 'ENTRADA' ? '⬆️' : '⬇️'}</div>
          <div className="info-produto">
            <div className="nome">{m.produto?.nome || 'Produto removido'}</div>
            <div className="detalhe">
              {m.tipo === 'ENTRADA' ? 'Entrada' : 'Venda'} · {m.quantidade} un.
              {m.formaPagamento ? ` · ${m.formaPagamento}` : ''}
              {m.clienteFiado ? ` · Fiado: ${m.clienteFiado.nome}` : ''}
              {m.pendente ? ' · pendente de sincronizar' : ''}
            </div>
            {m.responsavelNome && (
              <div className="detalhe" style={{ opacity: 0.7 }}>
                Por: {m.responsavelNome}
              </div>
            )}
            <div className="detalhe" style={{ opacity: 0.6 }}>
              {new Date(m.criadoEm).toLocaleString('pt-BR')}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}