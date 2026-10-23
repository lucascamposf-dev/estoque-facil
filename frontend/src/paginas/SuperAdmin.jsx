import { useState, useEffect, useMemo } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3333';

function BotaoCopiar({ texto, rotulo = '📋 Copiar' }) {
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
      {copiado ? '✓ Copiado' : rotulo}
    </button>
  );
}

export default function SuperAdmin() {
  const [senha, setSenha] = useState(sessionStorage.getItem('superAdminSenha') || '');
  const [autenticado, setAutenticado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [empresas, setEmpresas] = useState([]);
  const [busca, setBusca] = useState('');
  const [expandida, setExpandida] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [editando, setEditando] = useState(null);
  const [ultimaCriada, setUltimaCriada] = useState(null);

  const [metricasAssinatura, setMetricasAssinatura] = useState(null);
  const [verificandoVencimentos, setVerificandoVencimentos] = useState(false);
  const [ultimaVerificacaoVencimentos, setUltimaVerificacaoVencimentos] = useState(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [novaEmpresa, setNovaEmpresa] = useState({
    nome: '', slug: '', email: '', senha: '',
    adminNome: '', adminUsuario: '', adminSenha: '',
  });

  // --- exclusão definitiva ---
  const [excluindoId, setExcluindoId] = useState(null);
  const [confirmacaoTexto, setConfirmacaoTexto] = useState('');
  const [excluindoCarregando, setExcluindoCarregando] = useState(false);
  const [erroExclusao, setErroExclusao] = useState('');

  // --- reset de senha (dono da empresa ou funcionário) ---
  const [resetandoChave, setResetandoChave] = useState(null); // 'empresa' ou o id do funcionário
  const [senhaRevelada, setSenhaRevelada] = useState(null); // { escopo, usuario, senha }

  async function chamarSuperAdmin(caminho, opcoes = {}) {
    const resposta = await fetch(`${API_URL}/super-admin${caminho}`, {
      ...opcoes,
      headers: {
        'Content-Type': 'application/json',
        'x-super-admin-senha': senha,
        ...(opcoes.headers || {}),
      },
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || `Erro ${resposta.status}`);
    return dados;
  }

  async function carregarEmpresas() {
    setCarregando(true);
    setErro('');
    try {
      const dados = await chamarSuperAdmin('/empresas');
      setEmpresas(dados);
      setAutenticado(true);
      sessionStorage.setItem('superAdminSenha', senha);
      carregarMetricasAssinatura();
    } catch {
      setErro('Senha incorreta ou erro ao conectar.');
      setAutenticado(false);
      sessionStorage.removeItem('superAdminSenha');
    } finally {
      setCarregando(false);
    }
  }

  async function carregarMetricasAssinatura() {
    try {
      const dados = await chamarSuperAdmin('/metricas-assinatura');
      setMetricasAssinatura(dados);
    } catch {
      // sem essas métricas, o painel segue funcionando normalmente com o resto
    }
  }

  async function verificarVencimentosAgora() {
    setVerificandoVencimentos(true);
    setErro('');
    try {
      const resultado = await chamarSuperAdmin('/empresas/verificar-vencimentos', { method: 'POST' });
      if (resultado.desativadas.length > 0) {
        await carregarEmpresas();
      }
      setUltimaVerificacaoVencimentos(resultado);
    } catch {
      setErro('Não foi possível verificar os vencimentos agora.');
    } finally {
      setVerificandoVencimentos(false);
    }
  }

  useEffect(() => {
    if (senha) carregarEmpresas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function entrar(e) {
    e.preventDefault();
    await carregarEmpresas();
  }

  function sair() {
    sessionStorage.removeItem('superAdminSenha');
    setSenha('');
    setAutenticado(false);
    setEmpresas([]);
  }

  async function alternarAtivo(empresa) {
    try {
      const atualizada = await chamarSuperAdmin(`/empresas/${empresa.id}/ativo`, {
        method: 'PUT',
        body: JSON.stringify({ ativo: !empresa.ativo }),
      });
      setEmpresas((lista) => lista.map((e) => (e.id === atualizada.id ? { ...e, ...atualizada } : e)));
    } catch {
      setErro('Não foi possível atualizar o status da empresa.');
    }
  }

  async function criarEmpresa(e) {
    e.preventDefault();
    setErro('');
    try {
      const criada = await chamarSuperAdmin('/empresas', {
        method: 'POST',
        body: JSON.stringify(novaEmpresa),
      });
      setEmpresas((lista) => [{ ...criada, _count: { funcionarios: 1, produtos: 0 } }, ...lista]);
      setUltimaCriada({
        nome: novaEmpresa.nome,
        slug: novaEmpresa.slug,
        email: novaEmpresa.email,
        senha: novaEmpresa.senha,
        adminUsuario: novaEmpresa.adminUsuario,
        adminSenha: novaEmpresa.adminSenha,
      });
      setMostrarForm(false);
      setNovaEmpresa({ nome: '', slug: '', email: '', senha: '', adminNome: '', adminUsuario: '', adminSenha: '' });
    } catch (err) {
      setErro(err.message || 'Erro ao criar empresa.');
    }
  }

  async function abrirDetalhe(empresa) {
    if (expandida === empresa.id) {
      setExpandida(null);
      setDetalhe(null);
      setEditando(null);
      setSenhaRevelada(null);
      fecharExclusao();
      return;
    }
    setExpandida(empresa.id);
    setDetalhe(null);
    setEditando(null);
    setSenhaRevelada(null);
    fecharExclusao();
    try {
      const dados = await chamarSuperAdmin(`/empresas/${empresa.id}`);
      setDetalhe(dados);
    } catch {
      setErro('Não foi possível carregar os detalhes da empresa.');
    }
  }

  function iniciarEdicao() {
    setEditando({
      nome: detalhe.nome,
      email: detalhe.email,
      slug: detalhe.slug,
      novaSenha: '',
      plano: detalhe.plano || 'BASICO',
      valorMensalidade: detalhe.valorMensalidade !== null && detalhe.valorMensalidade !== undefined ? String(detalhe.valorMensalidade) : '',
      dataVencimento: detalhe.dataVencimento ? String(detalhe.dataVencimento).slice(0, 10) : '',
    });
  }

  async function salvarEdicao(empresaId) {
    setErro('');
    try {
      const corpo = {
        nome: editando.nome,
        email: editando.email,
        slug: editando.slug,
        plano: editando.plano,
        valorMensalidade: editando.valorMensalidade === '' ? null : Number(editando.valorMensalidade),
        dataVencimento: editando.dataVencimento || null,
        ...(editando.novaSenha ? { novaSenha: editando.novaSenha } : {}),
      };
      const atualizada = await chamarSuperAdmin(`/empresas/${empresaId}`, {
        method: 'PUT',
        body: JSON.stringify(corpo),
      });
      setDetalhe((d) => ({ ...d, ...atualizada }));
      setEmpresas((lista) => lista.map((e) => (e.id === empresaId ? { ...e, ...atualizada } : e)));
      setEditando(null);
    } catch (err) {
      setErro(err.message || 'Erro ao salvar edição.');
    }
  }

  // --- reset de senha ---
  async function resetarSenhaEmpresa(empresa) {
    const confirmar = window.confirm(
      `Gerar uma senha nova pro login do dono de "${empresa.nome}"? A senha atual deixa de funcionar imediatamente.`
    );
    if (!confirmar) return;
    setResetandoChave('empresa');
    setSenhaRevelada(null);
    try {
      const dados = await chamarSuperAdmin(`/empresas/${empresa.id}/resetar-senha`, { method: 'POST' });
      setSenhaRevelada({ escopo: 'empresa', usuario: dados.usuario, senha: dados.senha });
    } catch (err) {
      setErro(err.message || 'Não foi possível gerar a nova senha.');
    } finally {
      setResetandoChave(null);
    }
  }

  async function resetarSenhaFuncionario(empresa, funcionario) {
    const confirmar = window.confirm(
      `Gerar uma senha nova pro funcionário "${funcionario.nome}"? A senha atual deixa de funcionar imediatamente.`
    );
    if (!confirmar) return;
    setResetandoChave(funcionario.id);
    setSenhaRevelada(null);
    try {
      const dados = await chamarSuperAdmin(`/empresas/${empresa.id}/funcionarios/${funcionario.id}/resetar-senha`, {
        method: 'POST',
      });
      setSenhaRevelada({ escopo: funcionario.id, usuario: dados.usuario, senha: dados.senha, nome: funcionario.nome });
    } catch (err) {
      setErro(err.message || 'Não foi possível gerar a nova senha.');
    } finally {
      setResetandoChave(null);
    }
  }

  // --- exclusão definitiva ---
  function abrirExclusao(empresaId) {
    setExcluindoId(empresaId);
    setConfirmacaoTexto('');
    setErroExclusao('');
    setEditando(null);
  }

  function fecharExclusao() {
    setExcluindoId(null);
    setConfirmacaoTexto('');
    setErroExclusao('');
  }

  async function confirmarExclusao(empresa) {
    if (confirmacaoTexto !== empresa.nome) return;
    setErroExclusao('');
    setExcluindoCarregando(true);
    try {
      await chamarSuperAdmin(`/empresas/${empresa.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ confirmacaoNome: confirmacaoTexto }),
      });
      setEmpresas((lista) => lista.filter((e) => e.id !== empresa.id));
      setExpandida(null);
      setDetalhe(null);
      fecharExclusao();
    } catch (err) {
      setErroExclusao(err.message || 'Não foi possível excluir a empresa.');
    } finally {
      setExcluindoCarregando(false);
    }
  }

  const textoCredenciaisEmpresa = ultimaCriada
    ? `Empresa: ${ultimaCriada.nome}\nIdentificador (slug): ${ultimaCriada.slug}\n\n--- Login admin (via e-mail) ---\nE-mail: ${ultimaCriada.email}\nSenha: ${ultimaCriada.senha}\n\n--- Login admin (via usuário/funcionário) ---\nEmpresa: ${ultimaCriada.slug}\nUsuário: ${ultimaCriada.adminUsuario}\nSenha: ${ultimaCriada.adminSenha}`
    : '';

  const metricas = useMemo(() => {
    const ativas = empresas.filter((e) => e.ativo).length;
    const totalFuncionarios = empresas.reduce((s, e) => s + (e._count?.funcionarios ?? 0), 0);
    const totalProdutos = empresas.reduce((s, e) => s + (e._count?.produtos ?? 0), 0);
    return { total: empresas.length, ativas, inativas: empresas.length - ativas, totalFuncionarios, totalProdutos };
  }, [empresas]);

  const empresasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return empresas;
    return empresas.filter(
      (e) =>
        e.nome.toLowerCase().includes(termo) ||
        e.slug.toLowerCase().includes(termo) ||
        (e.email || '').toLowerCase().includes(termo)
    );
  }, [empresas, busca]);

  if (!autenticado) {
    return (
      <div style={{ maxWidth: 380, margin: '60px auto' }}>
        <h2 className="titulo-secao">Painel Super Admin</h2>
        <form onSubmit={entrar}>
          <label className="rotulo-campo">Senha mestra</label>
          <input
            type="password"
            placeholder="Digite a senha de super admin"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
          {erro && <p className="erro-texto">{erro}</p>}
          <button className="botao-primario" disabled={carregando} type="submit">
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <div className="painel-admin-topo">
        <div>
          <h1>Painel Super Admin</h1>
          <p className="subtitulo">Gestão de empresas clientes do Estoque Fácil</p>
        </div>
        <button className="botao-primario pequeno neutro" onClick={sair}>Sair</button>
      </div>

      <div className="grade-metricas-admin">
        <div className="metrica-admin">
          <div className="valor">{metricas.total}</div>
          <div className="rotulo">Empresas</div>
        </div>
        <div className="metrica-admin">
          <div className="valor">{metricas.ativas}</div>
          <div className="rotulo">Ativas</div>
        </div>
        <div className="metrica-admin">
          <div className="valor">{metricas.inativas}</div>
          <div className="rotulo">Inativas</div>
        </div>
        <div className="metrica-admin">
          <div className="valor">{metricas.totalFuncionarios}</div>
          <div className="rotulo">Funcionários</div>
        </div>
        <div className="metrica-admin">
          <div className="valor">{metricas.totalProdutos}</div>
          <div className="rotulo">Produtos cadastrados</div>
        </div>
        {metricasAssinatura && (
          <div className="metrica-admin">
            <div className="valor">R$ {metricasAssinatura.mrr.toFixed(2)}</div>
            <div className="rotulo">MRR (mensalidades ativas)</div>
          </div>
        )}
      </div>

      {metricasAssinatura && metricasAssinatura.empresasVencidas.length > 0 && (
        <div className="cartao" style={{ background: 'rgba(255,107,107,0.12)', marginBottom: 16 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>
            ⚠️ {metricasAssinatura.empresasVencidas.filter((e) => e.ativo).length} empresa(s) com plano vencido ainda ativa(s)
          </p>
          <p className="subtexto" style={{ margin: '4px 0 10px' }}>
            O sistema verifica isso sozinho 1x por dia, mas você pode forçar agora.
          </p>
          <button
            className="botao-primario pequeno neutro"
            disabled={verificandoVencimentos}
            onClick={verificarVencimentosAgora}
          >
            {verificandoVencimentos ? 'Verificando...' : 'Verificar vencimentos agora'}
          </button>
          {ultimaVerificacaoVencimentos && (
            <p className="subtexto" style={{ marginTop: 8 }}>
              Última checagem: {ultimaVerificacaoVencimentos.desativadas.length} empresa(s) desativada(s) agora.
            </p>
          )}
        </div>
      )}

      {ultimaCriada && (
        <div className="aviso-sucesso">
          <p className="titulo">Empresa criada! Repasse esses dados pro cliente:</p>
          <p className="credenciais">{textoCredenciaisEmpresa}</p>
          <div className="acoes">
            <BotaoCopiar texto={textoCredenciaisEmpresa} />
            <button
              type="button"
              className="botao-primario pequeno neutro"
              onClick={() => setUltimaCriada(null)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      <div className="barra-ferramentas-admin">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, slug ou e-mail..."
        />
        <button className="botao-primario" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? 'Cancelar' : '+ Nova empresa'}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={criarEmpresa} className="cartao" style={{ marginBottom: 24, maxWidth: 480 }}>
          <label className="rotulo-campo">Nome da empresa</label>
          <input value={novaEmpresa.nome} onChange={(e) => setNovaEmpresa({ ...novaEmpresa, nome: e.target.value })} />

          <label className="rotulo-campo">Slug (identificador único)</label>
          <input value={novaEmpresa.slug} onChange={(e) => setNovaEmpresa({ ...novaEmpresa, slug: e.target.value })} />

          <label className="rotulo-campo">E-mail da empresa</label>
          <input type="email" value={novaEmpresa.email} onChange={(e) => setNovaEmpresa({ ...novaEmpresa, email: e.target.value })} />

          <label className="rotulo-campo">Senha da empresa</label>
          <input type="password" value={novaEmpresa.senha} onChange={(e) => setNovaEmpresa({ ...novaEmpresa, senha: e.target.value })} />

          <hr className="divisor" />

          <label className="rotulo-campo">Nome do admin responsável</label>
          <input value={novaEmpresa.adminNome} onChange={(e) => setNovaEmpresa({ ...novaEmpresa, adminNome: e.target.value })} />

          <label className="rotulo-campo">Usuário do admin (login)</label>
          <input value={novaEmpresa.adminUsuario} onChange={(e) => setNovaEmpresa({ ...novaEmpresa, adminUsuario: e.target.value })} />

          <label className="rotulo-campo">Senha do admin</label>
          <input type="password" value={novaEmpresa.adminSenha} onChange={(e) => setNovaEmpresa({ ...novaEmpresa, adminSenha: e.target.value })} />

          {erro && <p className="erro-texto">{erro}</p>}

          <button className="botao-primario" type="submit">Criar empresa</button>
        </form>
      )}

      {carregando && <p className="carregando-texto">Carregando...</p>}
      {!carregando && empresas.length === 0 && <p className="vazio">Nenhuma empresa cadastrada ainda.</p>}
      {!carregando && empresas.length > 0 && empresasFiltradas.length === 0 && (
        <p className="vazio">Nenhuma empresa encontrada pra "{busca}".</p>
      )}

      <div className="grade-empresas">
        {empresasFiltradas.map((empresa) => (
          <div key={empresa.id} className="cartao-empresa">
            <div className="cartao-empresa-topo" onClick={() => abrirDetalhe(empresa)}>
              <div>
                <div className="cartao-empresa-nome">{empresa.nome}</div>
                <div className="cartao-empresa-meta">
                  slug: {empresa.slug}
                  {empresa.email && <><br />{empresa.email}</>}
                </div>
              </div>
              <span className={`pilula-status ${empresa.ativo ? 'ativa' : 'inativa'}`}>
                {empresa.ativo ? 'Ativa' : 'Inativa'}
              </span>
            </div>

            <div className="cartao-empresa-stats">
              <span><strong>{empresa._count?.funcionarios ?? 0}</strong> funcionário(s)</span>
              <span><strong>{empresa._count?.produtos ?? 0}</strong> produto(s)</span>
              {empresa.plano && <span>plano: <strong>{empresa.plano}</strong></span>}
            </div>

            {empresa.dataVencimento && new Date(empresa.dataVencimento) < new Date() && (
              <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 700, color: '#ff6b6b' }}>
                ⚠️ Plano vencido em {new Date(empresa.dataVencimento).toLocaleDateString('pt-BR')}
              </p>
            )}

            <div className="linha-acoes-admin">
              <button
                className={`botao-primario pequeno ${empresa.ativo ? 'perigo' : 'sucesso'}`}
                onClick={(e) => { e.stopPropagation(); alternarAtivo(empresa); }}
              >
                {empresa.ativo ? 'Desativar' : 'Ativar'}
              </button>
              <button className="botao-primario pequeno neutro" onClick={() => abrirDetalhe(empresa)}>
                {expandida === empresa.id ? 'Fechar detalhes' : 'Ver detalhes'}
              </button>
            </div>

            {expandida === empresa.id && (
              <div style={{ marginTop: 4 }}>
                <hr className="divisor" />
                {!detalhe && <p className="carregando-texto">Carregando detalhes...</p>}

                {detalhe && !editando && excluindoId !== empresa.id && (
                  <>
                    <div className="bloco-credenciais">
                      <p className="titulo-credencial">Login do dono (empresa)</p>
                      <div className="linha-credencial">
                        <span>Usuário</span>
                        <span className="valor-mono">{detalhe.usuario}</span>
                      </div>
                      <div className="linha-credencial">
                        <span>Senha</span>
                        <span>não pode ser recuperada, só redefinida</span>
                      </div>
                      <button
                        type="button"
                        className="botao-primario pequeno neutro"
                        style={{ width: '100%', marginTop: 8 }}
                        disabled={resetandoChave === 'empresa'}
                        onClick={() => resetarSenhaEmpresa(empresa)}
                      >
                        {resetandoChave === 'empresa' ? 'Gerando...' : '🔑 Gerar nova senha'}
                      </button>

                      {senhaRevelada?.escopo === 'empresa' && (
                        <div className="senha-revelada">
                          <p style={{ margin: '0 0 6px', fontWeight: 700 }}>
                            Nova senha gerada — repasse pro cliente agora, ela não aparece de novo:
                          </p>
                          <p style={{ margin: '0 0 8px' }}>
                            Usuário: <span className="valor-mono">{senhaRevelada.usuario}</span><br />
                            Senha: <span className="valor-mono">{senhaRevelada.senha}</span>
                          </p>
                          <BotaoCopiar texto={`Usuário: ${senhaRevelada.usuario}\nSenha: ${senhaRevelada.senha}`} />
                        </div>
                      )}
                    </div>

                    <p style={{ fontSize: 13, fontWeight: 700, margin: '14px 0 6px' }}>Funcionários:</p>
                    {detalhe.funcionarios.length === 0 && <p className="subtexto">Nenhum ainda.</p>}
                    {detalhe.funcionarios.map((f) => (
                      <div key={f.id} className="bloco-credenciais" style={{ marginBottom: 8 }}>
                        <div className="linha-credencial">
                          <span>
                            {f.nome} (@{f.usuario})
                            {f.papel === 'ADMIN' && <span className="badge-papel" style={{ marginLeft: 6 }}>ADMIN</span>}
                          </span>
                          <span style={{ fontSize: 12, color: f.ativo ? '#1f6b28' : '#a33333' }}>
                            {f.ativo ? 'ativo' : 'inativo'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="botao-primario pequeno neutro"
                          style={{ width: '100%', marginTop: 6 }}
                          disabled={resetandoChave === f.id}
                          onClick={() => resetarSenhaFuncionario(empresa, f)}
                        >
                          {resetandoChave === f.id ? 'Gerando...' : '🔑 Gerar nova senha'}
                        </button>
                        {senhaRevelada?.escopo === f.id && (
                          <div className="senha-revelada">
                            <p style={{ margin: '0 0 6px', fontWeight: 700 }}>
                              Nova senha de {senhaRevelada.nome} — repasse agora:
                            </p>
                            <p style={{ margin: '0 0 8px' }}>
                              Usuário: <span className="valor-mono">{senhaRevelada.usuario}</span><br />
                              Senha: <span className="valor-mono">{senhaRevelada.senha}</span>
                            </p>
                            <BotaoCopiar texto={`Usuário: ${senhaRevelada.usuario}\nSenha: ${senhaRevelada.senha}`} />
                          </div>
                        )}
                      </div>
                    ))}

                    <div className="linha-acoes-admin">
                      <button className="botao-primario pequeno neutro" onClick={iniciarEdicao}>
                        Editar dados
                      </button>
                      <button className="botao-primario pequeno perigo" onClick={() => abrirExclusao(empresa.id)}>
                        Excluir definitivamente
                      </button>
                    </div>
                  </>
                )}

                {editando && (
                  <div>
                    <label className="rotulo-campo">Nome</label>
                    <input value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />

                    <label className="rotulo-campo">E-mail</label>
                    <input value={editando.email} onChange={(e) => setEditando({ ...editando, email: e.target.value })} />

                    <label className="rotulo-campo">Slug</label>
                    <input value={editando.slug} onChange={(e) => setEditando({ ...editando, slug: e.target.value })} />

                    <hr className="divisor" />

                    <label className="rotulo-campo">Plano</label>
                    <select value={editando.plano} onChange={(e) => setEditando({ ...editando, plano: e.target.value })}>
                      <option value="BASICO">Básico</option>
                      <option value="PRO">Pro</option>
                      <option value="PERSONALIZADO">Personalizado</option>
                    </select>

                    <label className="rotulo-campo">Mensalidade (R$, opcional)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editando.valorMensalidade}
                      onChange={(e) => setEditando({ ...editando, valorMensalidade: e.target.value })}
                    />

                    <label className="rotulo-campo">Vencimento do plano (opcional)</label>
                    <input
                      type="date"
                      value={editando.dataVencimento}
                      onChange={(e) => setEditando({ ...editando, dataVencimento: e.target.value })}
                    />
                    <p style={{ fontSize: 12, opacity: 0.6, marginTop: -6, marginBottom: 12 }}>
                      Depois dessa data, a empresa é desativada automaticamente. Deixe em branco pra nunca vencer.
                    </p>

                    <hr className="divisor" />

                    <label className="rotulo-campo">Nova senha (deixe em branco pra manter a atual)</label>
                    <input
                      type="password"
                      value={editando.novaSenha}
                      onChange={(e) => setEditando({ ...editando, novaSenha: e.target.value })}
                    />

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="botao-primario pequeno" style={{ flex: 1 }} onClick={() => salvarEdicao(empresa.id)}>
                        Salvar
                      </button>
                      <button
                        className="botao-primario pequeno neutro"
                        style={{ flex: 1 }}
                        onClick={() => setEditando(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {excluindoId === empresa.id && (
                  <div className="aviso-sucesso" style={{ borderColor: '#d33', background: 'rgba(211,51,51,0.06)' }}>
                    <p className="titulo">Excluir "{empresa.nome}" definitivamente</p>
                    <p className="subtexto">
                      Essa ação apaga a empresa e todos os dados vinculados (funcionários, produtos,
                      movimentações, clientes fiado, sangrias, vasilhames). Não pode ser desfeita.
                    </p>
                    <label className="rotulo-campo">
                      Digite exatamente <strong>{empresa.nome}</strong> pra confirmar
                    </label>
                    <input
                      value={confirmacaoTexto}
                      onChange={(e) => setConfirmacaoTexto(e.target.value)}
                      placeholder={empresa.nome}
                    />

                    {erroExclusao && <p className="erro-texto">{erroExclusao}</p>}

                    <div className="acoes" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        className="botao-primario pequeno perigo"
                        style={{ flex: 1 }}
                        disabled={confirmacaoTexto !== empresa.nome || excluindoCarregando}
                        onClick={() => confirmarExclusao(empresa)}
                      >
                        {excluindoCarregando ? 'Excluindo...' : 'Confirmar exclusão'}
                      </button>
                      <button
                        type="button"
                        className="botao-primario pequeno neutro"
                        style={{ flex: 1 }}
                        onClick={fecharExclusao}
                        disabled={excluindoCarregando}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {erro && <p className="erro-texto" style={{ marginTop: 12 }}>{erro}</p>}
    </div>
  );
}