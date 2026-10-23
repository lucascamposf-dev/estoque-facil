// Calcula o preço unitário efetivo de um item de venda, no servidor.
//
// Antes, esse cálculo só existia no frontend (VendaRapida.jsx, função
// precoEfetivo). O backend sempre recalculava do zero usando só
// produto.precoVenda / unidade.precoVenda, ignorando completamente:
//   - precoCartao (preço diferente pra crédito/débito, quando cadastrado)
//   - precoManual (preço editado à mão pelo operador na hora da venda)
// Resultado prático: uma venda no crédito com preço de cartão cadastrado
// era GRAVADA pelo preço normal (mais barato) mesmo cobrando o preço de
// cartão do cliente - o caixa fechava com menos dinheiro do que deveria,
// silenciosamente. Esse helper agora é a fonte única de verdade, usada
// tanto pela rota antiga de movimentação avulsa quanto pela nova de venda.
function calcularPrecoUnitario({ produto, unidade, formaPagamento, ehDose, precoManual }) {
  if (precoManual !== undefined && precoManual !== null && Number(precoManual) > 0) {
    return Number(precoManual);
  }

  const usaCartao = formaPagamento === 'CREDITO' || formaPagamento === 'DEBITO';

  if (ehDose) {
    if (usaCartao && produto.precoDoseCartao) return Number(produto.precoDoseCartao);
    return Number(produto.precoDose);
  }

  const base = unidade || produto;
  if (usaCartao && base.precoCartao) return Number(base.precoCartao);
  return Number(unidade ? unidade.precoVenda : produto.precoVenda);
}

module.exports = { calcularPrecoUnitario };
