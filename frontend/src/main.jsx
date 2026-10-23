import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './theme.css';
import { sincronizarPendentes, sincronizarProdutos } from './api';

// Tenta sincronizar assim que o app abre, e sempre que a internet volta
async function sincronizarTudo() {
  await sincronizarPendentes();
  await sincronizarProdutos();
}
window.addEventListener('online', sincronizarTudo);
sincronizarTudo();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
