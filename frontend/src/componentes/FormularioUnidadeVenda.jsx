import { useState } from 'react';

// Formulário de "outras formas de venda" (fardo, caixa, etc.) - mesmos campos
// usados tanto no cadastro quanto na edição de produto.
//
// onAdicionar(dados) faz o trabalho de salvar (local, no cadastro; via API,
// na edição) e deve retornar `true` em caso de sucesso (o formulário limpa
// os campos) ou `false` em caso de erro (os campos ficam como estavam, pra
// o usuário poder corrigir e tentar de novo).
//
// onErro(mensagem) é chamado tanto pra erro de validação quanto pra limpar
// o erro (mensagem === '') antes de tentar salvar.
export default function FormularioUnidadeVenda({ onAdicionar, onErro }) {
  const [nome, setNome] = useState('');
  const [qtd, setQtd] = useState('');
  const [preco, setPreco] = useState('');
  const [precoCartao, setPrecoCartao] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function aoClicarAdicionar() {
    if (!nome || !qtd || !preco) {
      onErro('Preencha nome, quantidade e preço da forma de venda antes de adicionar.');
      return;
    }
    onErro('');
    setEnviando(true);
    const sucesso = await onAdicionar({
      nome,
      quantidadeEmUnidades: Number(qtd),
      precoVenda: Number(preco),
      precoCartao: precoCartao ? Number(precoCartao) : null,
    });
    setEnviando(false);

    if (sucesso !== false) {
      setNome('');
      setQtd('');
      setPreco('');
      setPrecoCartao('');
    }
  }

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <input
        placeholder="Ex: Fardo (12 un)"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        style={{ flex: '2 1 140px' }}
      />
      <input
        type="number"
        placeholder="Qtd. un."
        value={qtd}
        onChange={(e) => setQtd(e.target.value)}
        style={{ flex: '1 1 70px' }}
      />
      <input
        type="number"
        step="0.01"
        placeholder="Preço R$"
        value={preco}
        onChange={(e) => setPreco(e.target.value)}
        style={{ flex: '1 1 90px' }}
      />
      <input
        type="number"
        step="0.01"
        placeholder="Preço no cartão (opcional)"
        value={precoCartao}
        onChange={(e) => setPrecoCartao(e.target.value)}
        style={{ flex: '1 1 140px' }}
      />
      <button type="button" className="botao-primario pequeno neutro" disabled={enviando} onClick={aoClicarAdicionar}>
        {enviando ? 'Salvando...' : '+ Adicionar'}
      </button>
    </div>
  );
}
