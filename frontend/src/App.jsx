import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { lazy, Suspense } from 'react';
import Home from './paginas/Home';
import Login from './paginas/Login';
import { estaOnline, estaLogado, obterPapel, removerToken, obterPermissoes, obterNomeUsuario } from './api';
import { contarPendentes } from './db';


const RegistrarMovimentacao = lazy(() => import('./paginas/RegistrarMovimentacao'));
const CadastrarProduto = lazy(() => import('./paginas/CadastrarProduto'));
const EditarProduto = lazy(() => import('./paginas/EditarProduto'));
const Estoque = lazy(() => import('./paginas/Estoque'));
const FechamentoCaixa = lazy(() => import('./paginas/FechamentoCaixa'));
const GerenciarFuncionarios = lazy(() => import('./paginas/GerenciarFuncionarios'));
const VendaRapida = lazy(() => import('./paginas/VendaRapida'));
const ClientesFiado = lazy(() => import('./paginas/ClientesFiado'));
const Vasilhames = lazy(() => import('./paginas/Vasilhames'));
const SuperAdmin = lazy(() => import('./paginas/SuperAdmin'));
const HistoricoMovimentacoes = lazy(() => import('./paginas/HistoricoMovimentacoes'));
const BaixaRapida = lazy(() => import('./paginas/BaixaRapida'));
const ConfigurarPin = lazy(() => import('./paginas/ConfigurarPin'));
const Inventario = lazy(() => import('./paginas/Inventario'));
const InventarioDetalhe = lazy(() => import('./paginas/InventarioDetalhe'));
const Fornecedores = lazy(() => import('./paginas/Fornecedores'));
const GiroEstoque = lazy(() => import('./paginas/GiroEstoque'));


function RotaProtegida({ children, papel, permissao }) {
  if (!estaLogado()) return <Navigate to="/login" replace />;
  if (papel && obterPapel() !== papel) {
    const destino = obterPapel() === 'ADMIN' ? '/admin' : '/funcionario';
    return <Navigate to={destino} replace />;
  }
  if (permissao && !obterPermissoes()[permissao]) {
    const destino = obterPapel() === 'ADMIN' ? '/admin' : '/funcionario';
    return <Navigate to={destino} replace />;
  }
  return children;
}


function BadgeConexao() {
  const [online, setOnline] = useState(estaOnline());

  useEffect(() => {
    const atualizar = () => setOnline(navigator.onLine);
    window.addEventListener('online', atualizar);
    window.addEventListener('offline', atualizar);
    return () => {
      window.removeEventListener('online', atualizar);
      window.removeEventListener('offline', atualizar);
    };
  }, []);

  return online ? (
    <span className="badge-online">Online</span>
  ) : (
    <span className="badge-offline">Sem internet · salvando local</span>
  );
}

function BadgePendentes() {
  const [pendentes, setPendentes] = useState(0);

  useEffect(() => {
    let ativo = true;
    async function verificar() {
      const total = await contarPendentes();
      if (ativo) setPendentes(total);
    }
    verificar();
    const intervalo = setInterval(verificar, 4000);
    return () => { ativo = false; clearInterval(intervalo); };
  }, []);

  if (pendentes === 0) return null;
  return (
    <span className="badge-pendente">
      {pendentes} venda{pendentes > 1 ? 's' : ''} aguardando sincronizar
    </span>
  );
}

function NavRodape() {
  const navigate = useNavigate();
  const local = useLocation().pathname;
  const inicio = obterPapel() === 'ADMIN' ? '/admin' : '/funcionario';

  const itens = [
    { rota: inicio, icone: '🏠', rotulo: 'Início' },
    { rota: '/estoque', icone: '📦', rotulo: 'Estoque' },
    { rota: '/caixa', icone: '🧾', rotulo: 'Caixa' },
  ];

  return (
    <nav className="rodape-nav">
      {itens.map((item) => (
        <button
          key={item.rota}
          className={local === item.rota ? 'ativo' : ''}
          onClick={() => navigate(item.rota)}
        >
          <span className="icone">{item.icone}</span>
          {item.rotulo}
        </button>
      ))}
    </nav>
  );
}

export default function App() {

  const location = useLocation();
  const navigate = useNavigate();
  const esconderNav = ['/login', '/super-admin'].includes(location.pathname);
  const ehSuperAdmin = location.pathname === '/super-admin';
  return (
    <div className={`app-shell ${ehSuperAdmin ? 'app-shell-largo' : ''}`}>
      {!ehSuperAdmin && (
        <div className="topo">
          <h1>Estoque Fácil</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {estaLogado() && location.pathname !== '/login' && (
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
                {obterNomeUsuario()}
              </span>
            )}
            <BadgeConexao />
            {estaLogado() && location.pathname !== '/login' && (
              <button
                className="botao-sair"
                onClick={() => { removerToken(); navigate('/login'); }}
              >
                Sair
              </button>
            )}
          </div>
        </div>
      )}
      {!ehSuperAdmin && <BadgePendentes />}

     <Suspense fallback={<p style={{ textAlign: 'center', padding: 20 }}>Carregando...</p>}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/super-admin" element={<SuperAdmin />} />

          <Route path="/" element={
            estaLogado()
              ? <Navigate to={obterPapel() === 'ADMIN' ? '/admin' : '/funcionario'} replace />
              : <Navigate to="/login" replace />
          } />
          <Route path="/admin" element={<RotaProtegida papel="ADMIN"><Home /></RotaProtegida>} />
          <Route path="/funcionario" element={<RotaProtegida papel="FUNCIONARIO"><Home /></RotaProtegida>} />
          <Route path="/movimentar/:tipo" element={<RotaProtegida><RegistrarMovimentacao /></RotaProtegida>} />
          <Route path="/cadastrar-produto" element={<RotaProtegida permissao="podeVerEstoque"><CadastrarProduto /></RotaProtegida>} />
          <Route path="/editar-produto/:id" element={<RotaProtegida permissao="podeVerEstoque"><EditarProduto /></RotaProtegida>} />
          <Route path="/estoque" element={<RotaProtegida permissao="podeVerEstoque"><Estoque /></RotaProtegida>} />
          <Route path="/caixa" element={<RotaProtegida permissao="podeVerCaixa"><FechamentoCaixa /></RotaProtegida>} />
          <Route path="/funcionarios" element={<RotaProtegida papel="ADMIN"><GerenciarFuncionarios /></RotaProtegida>} />
          <Route path="/venda-rapida" element={<RotaProtegida><VendaRapida /></RotaProtegida>} />
          <Route path="/fiado" element={<RotaProtegida><ClientesFiado /></RotaProtegida>} />
          <Route path="/vasilhames" element={<RotaProtegida><Vasilhames /></RotaProtegida>} />
          <Route path="/historico" element={<RotaProtegida permissao="podeVerEstoque"><HistoricoMovimentacoes /></RotaProtegida>} />
          <Route path="/configurar-pin" element={<RotaProtegida papel="ADMIN"><ConfigurarPin /></RotaProtegida>} />
          <Route path="/inventario" element={<RotaProtegida permissao="podeVerEstoque"><Inventario /></RotaProtegida>} />
          <Route path="/inventario/:id" element={<RotaProtegida permissao="podeVerEstoque"><InventarioDetalhe /></RotaProtegida>} />
          <Route path="/fornecedores" element={<RotaProtegida permissao="podeVerEstoque"><Fornecedores /></RotaProtegida>} />
          <Route path="/giro-estoque" element={<RotaProtegida permissao="podeVerEstoque"><GiroEstoque /></RotaProtegida>} />
          {/* Pública - o funcionário pode escanear o QR sem estar logado ainda */}
          <Route path="/baixa-rapida/:slug/:produtoId" element={<BaixaRapida />} />
        </Routes>
      </Suspense>
       {!esconderNav && <NavRodape />}
    </div>
  );
}