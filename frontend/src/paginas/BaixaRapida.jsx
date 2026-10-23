import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { API_URL, estaLogado, salvarToken, salvarNomeUsuario, salvarSlugEmpresa } from '../api';

export default function BaixaRapida() {
  const { slug, produtoId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const nomeProduto = searchParams.get('nome') || 'Produto';

  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);

  // Se esse aparelho já está logado, pula o PIN e vai direto pra baixa
  useEffect(() => {
    if (estaLogado()) {
      navigate('/venda-rapida', { state: { produtoIdParaAbrir: produtoId }, replace: true });
    }
  }, [produtoId, navigate]);

  async function entrarComPin(e) {
    e.preventDefault();
    if (pin.length !== 4) {
      setErro('Digite os 4 números do PIN.');
      return;
    }
    setErro('');
    setEntrando(true);
    try {
      const resposta = await fetch(`${API_URL}/baixa-rapida/${slug}/entrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro || 'Não foi possível entrar.');
        return;
      }
      salvarToken(dados.token);
      salvarNomeUsuario(dados.nomeResponsavel || 'Baixa rápida');
      salvarSlugEmpresa(slug);
      navigate('/venda-rapida', { state: { produtoIdParaAbrir: produtoId }, replace: true });
    } catch {
      setErro('Não foi possível conectar. Verifique sua internet.');
    } finally {
      setEntrando(false);
    }
  }

  if (estaLogado()) return null; // evita piscar o formulário enquanto o redirect acima roda

  return (
    <div>
      <h2 className="titulo-secao">Baixa rápida</h2>
      <p className="subtexto" style={{ marginBottom: 16 }}>{nomeProduto}</p>

      <form onSubmit={entrarComPin}>
        <label style={{ fontSize: 14, opacity: 0.8 }}>PIN da loja (4 números)</label>
        <input
          autoFocus
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="0000"
          style={{ textAlign: 'center', fontSize: 24, letterSpacing: 8 }}
        />

        {erro && <p style={{ color: '#ffb4b4', fontSize: 14 }}>{erro}</p>}

        <button className="botao-primario" disabled={entrando} type="submit">
          {entrando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}