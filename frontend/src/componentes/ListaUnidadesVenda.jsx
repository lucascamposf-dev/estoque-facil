// Lista as formas de venda extras (fardo, caixa, etc.) já adicionadas, com
// botão de remover - mesma exibição usada no cadastro e na edição de produto.
//
// chaveDe(u, indice): chave do React pra cada linha (id no servidor, ou o
// índice quando a unidade ainda não foi salva). Por padrão usa o índice.
// estaRemovendo(u): se essa unidade está sendo removida agora (mostra
// "Removendo..." e desabilita o botão). Opcional.
// desabilitado: desabilita o botão de remover em todas as linhas. Opcional.
export default function ListaUnidadesVenda({ unidades, onRemover, chaveDe, estaRemovendo, desabilitado }) {
  if (unidades.length === 0) return null;

  return (
    <div style={{ marginBottom: 8 }}>
      {unidades.map((u, indice) => {
        const chave = chaveDe ? chaveDe(u, indice) : indice;
        const removendo = estaRemovendo ? estaRemovendo(u) : false;
        return (
          <div key={chave} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
            <span>
              {u.nome} — {u.quantidadeEmUnidades} un. — R$ {Number(u.precoVenda).toFixed(2)}
              {u.precoCartao && ` (cartão: R$ ${Number(u.precoCartao).toFixed(2)})`}
            </span>
            <button
              type="button"
              style={{ background: 'none', border: 'none', color: '#ffb4b4' }}
              disabled={desabilitado || removendo}
              onClick={() => onRemover(u, indice)}
            >
              {removendo ? 'Removendo...' : 'Remover'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
