import { useState, useEffect } from 'react';
import { chamarApi } from '../api';

function BotaoCopiar({ texto }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // navegador sem suporte a clipboard - ignora silenciosamente
    }
  }

  return (
    <button
      type="button"
      className={`botao-primario pequeno ${copiado ? 'sucesso' : 'neutro'}`}
      onClick={copiar}
    >
      {copiado ? '✓ Copiado' : '📋 Copiar dados'}
    </button>
  );
}

export default function GerenciarFuncionarios() {
  const [funcionarios, setFuncionarios] = useState([]);
  const [empresa, setEmpresa] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [ultimoCriado, setUltimoCriado] = useState(null);

  const [novo, setNovo] = useState({
    nome: '', usuario: '', senha: '', papel: 'FUNCIONARIO',
    podeVerCaixa: false, podeVerEstoque: false,
  });

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      const [listaFuncionarios, dadosEmpresa] = await Promise.all([
        chamarApi('/funcionarios'),
        chamarApi('/empresa/me'),
      ]);
      setFuncionarios(listaFuncionarios);
      setEmpresa(dadosEmpresa);
    } catch {
      setErro('Não foi possível carregar os dados.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function criar(e) {
    e.preventDefault();
    setErro('');
    setSalvando(true);
    try {
      const criado = await chamarApi('/funcionarios', {
        method: 'POST',
        body: JSON.stringify(novo),
      });
      setFuncionarios((lista) => [...lista, criado].sort((a, b) => a.nome.localeCompare(b.nome)));
      setUltimoCriado({ ...criado, senha: novo.senha });
      setMostrarForm(false);
      setNovo({ nome: '', usuario: '', senha: '', papel: 'FUNCIONARIO', podeVerCaixa: false, podeVerEstoque: false });
    } catch (e) {
      setErro(e.message.includes('em uso') ? e.message : 'Erro ao criar funcionário.');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(funcionario) {
    try {
      const atualizado = await chamarApi(`/funcionarios/${funcionario.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ativo: !funcionario.ativo }),
      });
      setFuncionarios((lista) => lista.map((f) => (f.id === atualizado.id ? atualizado : f)));
    } catch {
      setErro('Não foi possível atualizar o status.');
    }
  }

  async function excluir(funcionario) {
    const confirmar = window.confirm(`Excluir ${funcionario.nome} definitivamente? Essa ação não pode ser desfeita.`);
    if (!confirmar) return;
    try {
      await chamarApi(`/funcionarios/${funcionario.id}`, { method: 'DELETE' });
      setFuncionarios((lista) => lista.filter((f) => f.id !== funcionario.id));
    } catch {
      setErro('Não foi possível excluir o funcionário.');
    }
  }

  async function alternarPermissao(funcionario, campo) {
    try {
      const atualizado = await chamarApi(`/funcionarios/${funcionario.id}`, {
        method: 'PUT',
        body: JSON.stringify({ [campo]: !funcionario[campo] }),
      });
      setFuncionarios((lista) => lista.map((f) => (f.id === atualizado.id ? atualizado : f)));
    } catch {
      setErro('Não foi possível atualizar a permissão.');
    }
  }

  const [resetandoSenhaDe, setResetandoSenhaDe] = useState(null); // id do funcionário
  const [novaSenha, setNovaSenha] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [senhaResetada, setSenhaResetada] = useState(null); // { usuario, senha }

  async function resetarSenha(funcionario) {
    if (!novaSenha || novaSenha.length < 6) {
      setErro('A nova senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    setSalvandoSenha(true);
    setErro('');
    try {
      await chamarApi(`/funcionarios/${funcionario.id}`, {
        method: 'PUT',
        body: JSON.stringify({ novaSenha }),
      });
      setSenhaResetada({ usuario: funcionario.usuario, senha: novaSenha });
      setResetandoSenhaDe(null);
      setNovaSenha('');
    } catch {
      setErro('Não foi possível trocar a senha.');
    } finally {
      setSalvandoSenha(false);
    }
  }

  const textoCredenciais = ultimoCriado && empresa
    ? `Empresa: ${empresa.slug}\nUsuário: ${ultimoCriado.usuario}\nSenha: ${ultimoCriado.senha}`
    : '';

  return (
    <div>
      <h2 className="titulo-secao">Funcionários</h2>

      {empresa && (
        <p className="subtexto" style={{ color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>
          Identificador da empresa (usado no login dos funcionários): <strong>{empresa.slug}</strong>
        </p>
      )}

      {ultimoCriado && (
        <div className="aviso-sucesso">
          <p className="titulo">Funcionário criado! Repasse esses dados pra ele:</p>
          <p className="credenciais">{textoCredenciais}</p>
          <div className="acoes">
            <BotaoCopiar texto={textoCredenciais} />
            <button
              type="button"
              className="botao-primario pequeno neutro"
              onClick={() => setUltimoCriado(null)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {senhaResetada && (
        <div className="aviso-sucesso">
          <p className="titulo">Senha alterada! Repasse pra ele:</p>
          <p className="credenciais">Usuário: {senhaResetada.usuario}{'\n'}Nova senha: {senhaResetada.senha}</p>
          <div className="acoes">
            <BotaoCopiar texto={`Usuário: ${senhaResetada.usuario}\nNova senha: ${senhaResetada.senha}`} />
            <button
              type="button"
              className="botao-primario pequeno neutro"
              onClick={() => setSenhaResetada(null)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      <button className="botao-primario" onClick={() => setMostrarForm((v) => !v)} style={{ marginBottom: 16 }}>
        {mostrarForm ? 'Cancelar' : '+ Novo funcionário'}
      </button>

      {mostrarForm && (
        <form onSubmit={criar} className="cartao" style={{ marginBottom: 24 }}>
          <label className="rotulo-campo">Nome</label>
          <input value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />

          <label className="rotulo-campo">Usuário (login)</label>
          <input value={novo.usuario} onChange={(e) => setNovo({ ...novo, usuario: e.target.value })} />

          <label className="rotulo-campo">Senha (mín. 6 caracteres)</label>
          <input type="password" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} />

          <label className="rotulo-campo">Papel</label>
          <select value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value })}>
            <option value="FUNCIONARIO">Funcionário</option>
            <option value="ADMIN">Admin</option>
          </select>

          <div className="lista-permissoes">
            <label className="linha-checkbox">
              <input
                type="checkbox"
                checked={novo.podeVerCaixa}
                onChange={(e) => setNovo({ ...novo, podeVerCaixa: e.target.checked })}
              />
              Pode ver o caixa
            </label>
            <label className="linha-checkbox">
              <input
                type="checkbox"
                checked={novo.podeVerEstoque}
                onChange={(e) => setNovo({ ...novo, podeVerEstoque: e.target.checked })}
              />
              Pode ver o estoque
            </label>
          </div>

          {erro && <p className="erro-texto">{erro}</p>}

          <button className="botao-primario" disabled={salvando} type="submit">
            {salvando ? 'Salvando...' : 'Criar funcionário'}
          </button>
        </form>
      )}

      {erro && !mostrarForm && <p className="erro-texto">{erro}</p>}
      {carregando && <p className="carregando-texto">Carregando...</p>}

      {!carregando && funcionarios.length === 0 && (
        <p className="vazio">Nenhum funcionário cadastrado ainda.</p>
      )}

      {funcionarios.map((f) => (
        <div key={f.id} className="cartao" style={{ opacity: f.ativo ? 1 : 0.6 }}>
          <div className="cartao-titulo-linha">
            <strong>{f.nome}</strong>
            {f.papel === 'ADMIN' && <span className="badge-papel">ADMIN</span>}
          </div>
          <p className="subtexto">@{f.usuario}</p>

          <div className="lista-permissoes">
            <label className="linha-checkbox">
              <input
                type="checkbox"
                checked={f.podeVerCaixa}
                onChange={() => alternarPermissao(f, 'podeVerCaixa')}
              />
              Vê o caixa
            </label>
            <label className="linha-checkbox">
              <input
                type="checkbox"
                checked={f.podeVerEstoque}
                onChange={() => alternarPermissao(f, 'podeVerEstoque')}
              />
              Vê o estoque
            </label>
          </div>

          <button
            className="botao-primario botao-bloco neutro"
            style={{ marginTop: 6 }}
            onClick={() => { setResetandoSenhaDe(resetandoSenhaDe === f.id ? null : f.id); setNovaSenha(''); setErro(''); }}
          >
            🔑 {resetandoSenhaDe === f.id ? 'Cancelar' : 'Resetar senha'}
          </button>

          {resetandoSenhaDe === f.id && (
            <div style={{ marginTop: 8 }}>
              <input
                type="password"
                placeholder="Nova senha (mín. 6 caracteres)"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
              />
              <button
                className="botao-primario botao-bloco"
                disabled={salvandoSenha}
                onClick={() => resetarSenha(f)}
              >
                {salvandoSenha ? 'Salvando...' : 'Confirmar nova senha'}
              </button>
            </div>
          )}

          <button
            className={`botao-primario botao-bloco ${f.ativo ? 'perigo' : 'sucesso'}`}
            onClick={() => alternarAtivo(f)}
          >
            {f.ativo ? 'Desativar' : 'Ativar'}
          </button>

          <button
            className="botao-primario botao-bloco perigo"
            style={{ marginTop: 6, opacity: 0.85 }}
            onClick={() => excluir(f)}
          >
            🗑️ Excluir definitivamente
          </button>
        </div>
      ))}
    </div>
  );
}