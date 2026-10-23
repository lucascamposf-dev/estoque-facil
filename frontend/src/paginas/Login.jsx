import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_URL, salvarToken, salvarNomeUsuario, salvarSlugEmpresa, obterSlugEmpresa, obterPapel } from '../api';

export default function Login() {
  const navigate = useNavigate();
  const [tipo, setTipo] = useState('funcionario'); // 'admin' ou 'funcionario'
  // Pré-preenche com o identificador da empresa já salvo de um login anterior
  // nesse aparelho - evita ter que redigitar toda vez que o token expira
  const [empresaSlug, setEmpresaSlug] = useState(obterSlugEmpresa() || '');
  const [identificador, setIdentificador] = useState(''); // usuário (admin ou funcionário)
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [entrando, setEntrando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro('');
    setEntrando(true);

    const caminho = tipo === 'admin' ? '/auth/login-admin' : '/auth/login-funcionario';
    const corpo = tipo === 'admin'
      ? { usuario: identificador, senha }
      : { empresaSlug, usuario: identificador, senha };

    try {
      const resposta = await fetch(`${API_URL}${caminho}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      });
      const dados = await resposta.json();

      if (!resposta.ok) {
        setErro(dados.erro || 'Credenciais inválidas');
        return;
      }

      salvarToken(dados.token);
      salvarNomeUsuario(tipo === 'admin' ? `${dados.empresa?.nome || 'Admin'} (Admin)` : dados.funcionario?.nome || 'Funcionário');
      // Guarda o identificador da empresa pra gerar os QR codes de baixa
      // rápida depois, sem precisar pedir de novo em outra tela
      salvarSlugEmpresa(tipo === 'admin' ? dados.empresa?.slug : empresaSlug);
      const papel = obterPapel();
      navigate(papel === 'ADMIN' ? '/admin' : '/funcionario');
    } catch {
      setErro('Não foi possível conectar. Verifique sua internet.');
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 12, marginBottom: 28 }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'var(--ambar)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 34,
            boxShadow: 'var(--sombra-tampinha)',
            marginBottom: 12,
          }}
        >
          🍾
        </div>
        <h1
          style={{
            fontFamily: 'var(--fonte-display)',
            fontSize: 24,
            fontWeight: 700,
            margin: 0,
            color: 'var(--texto-claro)',
          }}
        >
          Estoque Fácil
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '4px 0 0' }}>
          Entre para continuar
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          className="botao-primario"
          style={{ background: tipo === 'funcionario' ? undefined : 'var(--branco-giz)' }}
          onClick={() => setTipo('funcionario')}
        >
          Sou funcionário
        </button>
        <button
          type="button"
          className="botao-primario"
          style={{ background: tipo === 'admin' ? undefined : 'var(--branco-giz)' }}
          onClick={() => setTipo('admin')}
        >
          Sou admin/dono
        </button>
      </div>

      <form onSubmit={entrar}>
        {tipo === 'funcionario' && (
          <>
            <label style={{ fontSize: 14, opacity: 0.8 }}>Identificador da empresa</label>
            <input
              value={empresaSlug}
              onChange={(e) => setEmpresaSlug(e.target.value)}
              placeholder="ex: mercado-do-joao"
            />
          </>
        )}

        <label style={{ fontSize: 14, opacity: 0.8 }}>Usuário</label>
        <input
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          placeholder="seu usuário"
        />

        <label style={{ fontSize: 14, opacity: 0.8 }}>Senha</label>
        <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />

        {erro && <p style={{ color: '#ffb4b4', fontSize: 14 }}>{erro}</p>}

        <button className="botao-primario" disabled={entrando} type="submit">
          {entrando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}