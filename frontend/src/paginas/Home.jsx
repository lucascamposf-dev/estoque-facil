import { useNavigate } from 'react-router-dom';
import { obterPapel } from '../api';

export default function Home() {
  const navigate = useNavigate();
  const ehAdmin = obterPapel() === 'ADMIN';

  return (
    <div>
      <p style={{ color: 'rgba(255,255,255,0.75)', marginBottom: 4 }}>
        O que você quer fazer agora?
      </p>

      <div className="grade-acoes">
        <button className="botao-tampinha" onClick={() => navigate('/movimentar/ENTRADA')}>
          <span style={{ fontSize: 28 }}>⬇️</span>
          Entrada
        </button>

        <button className="botao-tampinha" onClick={() => navigate('/venda-rapida')} title="1 item ou carrinho com vários, aceita fiado">
          <span style={{ fontSize: 28 }}>🛒</span>
          Vender
          <span style={{ fontSize: 10, fontWeight: 600, opacity: 0.75 }}>carrinho · fiado</span>
        </button>

        <button className="botao-tampinha secundario" onClick={() => navigate('/estoque')}>
          <span style={{ fontSize: 28 }}>📦</span>
          Ver estoque
        </button>

        <button className="botao-tampinha secundario" onClick={() => navigate('/cadastrar-produto')}>
          <span style={{ fontSize: 28 }}>➕</span>
          Novo produto
        </button>

        <button className="botao-tampinha secundario" onClick={() => navigate('/fiado')}>
          <span style={{ fontSize: 28 }}>📒</span>
          Fiado
        </button>

        <button className="botao-tampinha secundario" onClick={() => navigate('/vasilhames')}>
          <span style={{ fontSize: 28 }}>🧊</span>
          Vasilhame
        </button>

        <button className="botao-tampinha secundario" onClick={() => navigate('/inventario')}>
          <span style={{ fontSize: 28 }}>📋</span>
          Inventário
        </button>

        <button className="botao-tampinha secundario" onClick={() => navigate('/giro-estoque')}>
          <span style={{ fontSize: 28 }}>📊</span>
          Giro de estoque
        </button>

        <button className="botao-tampinha secundario" onClick={() => navigate('/fornecedores')}>
          <span style={{ fontSize: 28 }}>🚚</span>
          Fornecedores
        </button>

        {ehAdmin && (
          <button className="botao-tampinha secundario" onClick={() => navigate('/funcionarios')}>
            <span style={{ fontSize: 28 }}>👥</span>
            Funcionários
          </button>
        )}

        {ehAdmin && (
          <button className="botao-tampinha secundario" onClick={() => navigate('/configurar-pin')}>
            <span style={{ fontSize: 28 }}>🔳</span>
            PIN da Baixa Rápida
          </button>
        )}
      </div>

      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
        Toque em "Vender" tanto pra vender 1 produto rápido quanto pra montar
        um carrinho com vários itens e fiado.
      </p>

      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center' }}>
        Tudo o que você registrar aqui é salvo no celular na hora,
        mesmo sem internet.
      </p>
    </div>
  );
}