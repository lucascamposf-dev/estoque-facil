import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { chamarApi, definirPinBaixaRapida } from '../api';

export default function ConfigurarPin() {
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(true);
  const [pinConfigurado, setPinConfigurado] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmarPin, setConfirmarPin] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  async function carregar() {
    setCarregando(true);
    try {
      const empresa = await chamarApi('/empresa/me');
      setPinConfigurado(!!empresa.pinBaixaRapidaConfigurado);
    } catch {
      setErro('Não foi possível verificar se o PIN já está configurado.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function salvar(e) {
    e.preventDefault();
    setErro('');
    setSucesso('');

    if (!/^\d{4}$/.test(pin)) {
      setErro('O PIN precisa ter exatamente 4 números.');
      return;
    }
    if (pin !== confirmarPin) {
      setErro('Os PINs digitados não são iguais.');
      return;
    }

    setSalvando(true);
    try {
      await definirPinBaixaRapida(pin);
      setPinConfigurado(true);
      setSucesso('PIN salvo! Agora os QR codes de "Baixa rápida" na tela de Estoque já funcionam.');
      setPin('');
      setConfirmarPin('');
    } catch {
      setErro('Não foi possível salvar o PIN. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <div className="cartao-cabecalho" style={{ marginBottom: 12, alignItems: 'flex-start' }}>
        <div>
          <h2 className="titulo-secao" style={{ margin: 0 }}>Baixa rápida (QR code)</h2>
          <p className="subtexto" style={{ margin: '2px 0 0' }}>
            Defina o PIN de 4 dígitos usado quando alguém escaneia o QR code colado na prateleira.
          </p>
        </div>
        <button className="botao-primario pequeno neutro" onClick={() => navigate(-1)}>Voltar</button>
      </div>

      {carregando && <p className="carregando-texto">Carregando...</p>}

      {!carregando && (
        <div className="cartao" style={{ marginBottom: 16 }}>
          <p className="subtexto">
            {pinConfigurado
              ? '✅ Já existe um PIN configurado pra essa empresa. Você pode trocar por um novo abaixo.'
              : '⚠️ Nenhum PIN configurado ainda. Sem isso, escanear o QR code de um produto sempre falha.'}
          </p>
        </div>
      )}

      <form onSubmit={salvar} className="cartao">
        <label className="rotulo-campo">Novo PIN (4 números)</label>
        <input
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="0000"
        />

        <label className="rotulo-campo">Confirmar novo PIN</label>
        <input
          inputMode="numeric"
          maxLength={4}
          value={confirmarPin}
          onChange={(e) => setConfirmarPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="0000"
        />

        {erro && <p className="erro-texto">{erro}</p>}
        {sucesso && <p className="sucesso-texto">{sucesso}</p>}

        <button className="botao-primario" disabled={salvando} type="submit">
          {salvando ? 'Salvando...' : (pinConfigurado ? 'Trocar PIN' : 'Salvar PIN')}
        </button>
      </form>

      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 16 }}>
        Depois de configurado, qualquer funcionário pode escanear o QR code de um produto
        (gerado na tela de Estoque) e digitar esse PIN pra dar baixa rápida sem precisar
        fazer login completo.
      </p>
    </div>
  );
}
