import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const ID_ELEMENTO = 'leitor-codigo-barras';

// Abre a câmera traseira e fica lendo até achar um código de barras.
// Assim que encontra, chama onLeitura(codigo) e o componente pai decide o que fazer.
export default function LeitorCodigoBarras({ onLeitura, onFechar }) {
  const leitorRef = useRef(null);
  const jaLeuRef = useRef(false);
  const onLeituraRef = useRef(onLeitura);
  const onFecharRef = useRef(onFechar);

  const [mostrarManual, setMostrarManual] = useState(false);
  const [codigoManual, setCodigoManual] = useState('');
  const [avisoCamera, setAvisoCamera] = useState('');

  // Mantém as funções mais recentes sem precisar reiniciar a câmera a cada
  // re-render da tela que chamou o leitor
  useEffect(() => {
    onLeituraRef.current = onLeitura;
    onFecharRef.current = onFechar;
  });

  useEffect(() => {
    const leitor = new Html5Qrcode(ID_ELEMENTO);
    leitorRef.current = leitor;
    jaLeuRef.current = false;

    leitor
      .start(
        { facingMode: 'environment' }, // câmera de trás do celular
        {
          fps: 10,
          // Caixa quadrada: funciona bem tanto pra código de barras (comprido,
          // cabe na largura) quanto pra QR code (precisa de altura e largura parecidas)
          qrbox: { width: 250, height: 250 },
          // Usa o leitor de código de barras nativo do Android/Chrome quando
          // disponível - mais rápido e mais confiável com luz ruim ou etiqueta
          // amassada do que o decodificador em JS puro (fallback automático
          // se o navegador não suportar)
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        },
        (codigoLido) => {
          // Evita disparar várias vezes seguidas pro mesmo código
          if (jaLeuRef.current) return;
          jaLeuRef.current = true;
          onLeituraRef.current(codigoLido.trim());
        },
        () => {
          // erro de leitura de um frame específico - ignora, é normal acontecer o tempo todo
        }
      )
      .then(() => {
        // Tenta manter o foco contínuo, ajuda bastante a focar códigos pequenos
        // ou de perto. Se o aparelho/navegador não suportar, ignora e segue com
        // o foco padrão - não trava a leitura por causa disso.
        try {
          const capacidades = leitor.getRunningTrackCameraCapabilities();
          const recursoFoco = capacidades.focusModeFeature();
          if (recursoFoco && recursoFoco.value() !== 'continuous') {
            recursoFoco.apply('continuous');
          }
        } catch {
          // Sem suporte a controle de foco nesse aparelho - segue normalmente
        }
      })
      .catch(() => {
        // Câmera não disponível ou permissão negada - deixa o campo manual
        // como única opção em vez de fechar sozinho
        setAvisoCamera('Não foi possível acessar a câmera. Verifique a permissão do navegador ou digite o código abaixo.');
        setMostrarManual(true);
      });

    return () => {
      leitor.stop().then(() => leitor.clear()).catch(() => {});
    };
  }, []); // roda só uma vez, na montagem — não reinicia a câmera a cada re-render

  function confirmarManual() {
    const codigo = codigoManual.trim();
    if (!codigo) return;
    jaLeuRef.current = true;
    onLeituraRef.current(codigo);
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(10, 20, 15, 0.95)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <p style={{ color: '#fff', marginBottom: 12, fontWeight: 600 }}>
        Aponte a câmera para o código de barras
      </p>
      <div
        id={ID_ELEMENTO}
        style={{ width: '100%', maxWidth: 360, borderRadius: 16, overflow: 'hidden' }}
      />

      {avisoCamera && (
        <p style={{ color: '#ffb4b4', fontSize: 13, marginTop: 12, maxWidth: 360, textAlign: 'center' }}>
          {avisoCamera}
        </p>
      )}

      {!mostrarManual ? (
        <button
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', marginTop: 16, textDecoration: 'underline', fontSize: 14 }}
          onClick={() => setMostrarManual(true)}
        >
          Não está lendo? Digitar o código
        </button>
      ) : (
        <div style={{ width: '100%', maxWidth: 360, marginTop: 16 }}>
          <input
            autoFocus
            inputMode="numeric"
            placeholder="Digite o código de barras"
            value={codigoManual}
            onChange={(e) => setCodigoManual(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <button className="botao-primario" onClick={confirmarManual} disabled={!codigoManual.trim()}>
            Usar esse código
          </button>
        </div>
      )}

      <button
        className="botao-primario neutro"
        style={{ marginTop: 12, maxWidth: 360 }}
        onClick={() => onFechar(null)}
      >
        Cancelar
      </button>
    </div>
  );
}
