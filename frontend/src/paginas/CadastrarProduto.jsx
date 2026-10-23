import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chamarApi, estaOnline } from '../api';
import { db } from '../db';
import LeitorCodigoBarras from '../componentes/LeitorCodigoBarras';
import FormularioUnidadeVenda from '../componentes/FormularioUnidadeVenda';
import ListaUnidadesVenda from '../componentes/ListaUnidadesVenda';
import { redimensionarFoto } from '../utils/redimensionarFoto';

export default function CadastrarProduto() {
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [precoVenda, setPrecoVenda] = useState('');
  const [precoCartao, setPrecoCartao] = useState('');
  const [estoqueAtual, setEstoqueAtual] = useState('');
  const [estoqueMinimo, setEstoqueMinimo] = useState('5');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [mostrarLeitor, setMostrarLeitor] = useState(false);
  const [buscandoProdutoExistente, setBuscandoProdutoExistente] = useState(false);
  const [fotoUrl, setFotoUrl] = useState('');

  const [unidadesVenda, setUnidadesVenda] = useState([]); // formas extras de venda: fardo, caixa, etc.

  const [vendeDose, setVendeDose] = useState(false);
  const [dosesPorUnidade, setDosesPorUnidade] = useState('');
  const [precoDose, setPrecoDose] = useState('');
  const [precoDoseCartao, setPrecoDoseCartao] = useState('');

  function adicionarUnidade(dados) {
    setUnidadesVenda((lista) => [...lista, dados]);
    return true;
  }

  function removerUnidade(indice) {
    setUnidadesVenda((lista) => lista.filter((_, i) => i !== indice));
  }

  async function aoEscolherFoto(e) {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro('');

    try {
      setFotoUrl(await redimensionarFoto(arquivo));
    } catch {
      setErro('Não foi possível carregar essa foto. Tente novamente.');
    }
  }

  async function aoLerCodigo(codigo) {
    setMostrarLeitor(false);
    setCodigoBarras(codigo);

    // Se esse código já existir cadastrado, avisa em vez de deixar duplicar
    if (estaOnline()) {
      setBuscandoProdutoExistente(true);
      try {
        const existente = await chamarApi(`/produtos/codigo-barras/${codigo}`);
        if (existente) {
          setNome(existente.nome);
          setPrecoVenda(String(existente.precoVenda));
          setErro('Esse código já existe cadastrado - os dados foram preenchidos, ajuste o que precisar.');
        }
      } catch {
        // 404 é o esperado quando o produto é novo - segue o cadastro normalmente
      } finally {
        setBuscandoProdutoExistente(false);
      }
    }
  }

  function aoFecharLeitor(mensagemErro) {
    setMostrarLeitor(false);
    if (mensagemErro) setErro(mensagemErro);
  }

  async function salvar() {
    if (!nome || !precoVenda) {
      setErro('Preencha ao menos o nome e o preço de venda');
      return;
    }
    if (vendeDose && (!dosesPorUnidade || Number(dosesPorUnidade) <= 0 || !precoDose)) {
      setErro('Pra vender por dose, informe quantas doses saem de 1 unidade e o preço da dose');
      return;
    }
    setErro('');
    setSalvando(true);

    const dadosProduto = {
      nome,
      codigoBarras: codigoBarras || undefined,
      fotoUrl: fotoUrl || undefined,
      precoVenda: Number(precoVenda),
      precoCartao: precoCartao ? Number(precoCartao) : undefined,
      estoqueAtual: Number(estoqueAtual) || 0,
      estoqueMinimo: Number(estoqueMinimo) || 5,
      vendeDose,
      dosesPorUnidade: vendeDose ? Number(dosesPorUnidade) : undefined,
      precoDose: vendeDose ? Number(precoDose) : undefined,
      precoDoseCartao: vendeDose && precoDoseCartao ? Number(precoDoseCartao) : undefined,
    };

    try {
      if (estaOnline()) {
        const criado = await chamarApi('/produtos', {
          method: 'POST',
          body: JSON.stringify(dadosProduto),
        });
        await db.produtos.add({ ...criado, servidorId: criado.id });

        // Cria as formas de venda extras (fardo, caixa etc.) já vinculadas ao produto
        // recém-criado. Se alguma falhar, o produto principal já está salvo - só avisa
        // e segue, pra não travar o cadastro inteiro por causa de uma forma de venda extra.
        for (const unidade of unidadesVenda) {
          try {
            await chamarApi(`/produtos/${criado.id}/unidades`, {
              method: 'POST',
              body: JSON.stringify(unidade),
            });
          } catch {
            setErro('Produto salvo, mas não foi possível salvar alguma forma de venda extra. Edite o produto pra adicionar de novo.');
          }
        }
      } else {
        // Sem internet: salva só localmente por enquanto.
        // Esse produto entra na sincronização de produtos assim que a rede voltar
        // (fica marcado como "pendenteEnvio" pra você tratar no passo de sincronização de produtos).
        await db.produtos.add({ ...dadosProduto, pendenteEnvio: true });
      }
      navigate('/');
    } catch {
      setErro('Não foi possível salvar. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <h2 className="titulo-secao">Novo produto</h2>

      <button
        type="button"
        className="botao-primario"
        style={{ background: 'var(--branco-giz)', marginBottom: 16 }}
        onClick={() => setMostrarLeitor(true)}
      >
        📷 Escanear código de barras
      </button>

      {codigoBarras && (
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: -8 }}>
          Código lido: {codigoBarras} {buscandoProdutoExistente && '· verificando...'}
        </p>
      )}

      <label style={{ fontSize: 14, opacity: 0.8 }}>Foto do produto</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="botao-primario pequeno neutro"
          style={{ flex: 1 }}
          onClick={() => document.getElementById('input-camera-cadastro').click()}
        >
          📷 Tirar foto
        </button>
        <button
          type="button"
          className="botao-primario pequeno neutro"
          style={{ flex: 1 }}
          onClick={() => document.getElementById('input-galeria-cadastro').click()}
        >
          🖼️ Galeria
        </button>
      </div>
      <input
        id="input-camera-cadastro"
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={aoEscolherFoto}
      />
      <input
        id="input-galeria-cadastro"
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={aoEscolherFoto}
      />
      {fotoUrl && (
        <img
          src={fotoUrl}
          alt="Prévia do produto"
          style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, marginTop: 8 }}
        />
      )}

      <label style={{ fontSize: 14, opacity: 0.8 }}>Nome do produto</label>
      <input placeholder="Ex: Skol Lata 350ml" value={nome} onChange={(e) => setNome(e.target.value)} />

      <label style={{ fontSize: 14, opacity: 0.8 }}>Preço de venda (R$)</label>
      <input
        type="number"
        step="0.01"
        placeholder="Ex: 4.50"
        value={precoVenda}
        onChange={(e) => setPrecoVenda(e.target.value)}
      />

      <label style={{ fontSize: 14, opacity: 0.8 }}>Preço no cartão (crédito/débito) — opcional</label>
      <input
        type="number"
        step="0.01"
        placeholder="Deixe em branco pra usar o preço normal"
        value={precoCartao}
        onChange={(e) => setPrecoCartao(e.target.value)}
      />

      <label style={{ fontSize: 14, opacity: 0.8 }}>Quantidade em estoque agora</label>
      <input
        type="number"
        placeholder="Ex: 24"
        value={estoqueAtual}
        onChange={(e) => setEstoqueAtual(e.target.value)}
      />

      <label style={{ fontSize: 14, opacity: 0.8 }}>Avisar quando restar menos de</label>
      <input
        type="number"
        value={estoqueMinimo}
        onChange={(e) => setEstoqueMinimo(e.target.value)}
      />

      <div className="cartao" style={{ marginBottom: 12, padding: '10px 14px', flexDirection: 'column', alignItems: 'stretch' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={vendeDose}
            onChange={(e) => setVendeDose(e.target.checked)}
            style={{ width: 'auto' }}
          />
          🥃 Vende por dose (ex: garrafa de destilado)
        </label>

        {vendeDose && (
          <>
            <p style={{ fontSize: 12, opacity: 0.7, margin: '4px 0 8px' }}>
              Depois de cadastrar, use "Abrir garrafa p/ doses" no Estoque pra ter doses disponíveis pra vender.
            </p>
            <label className="rotulo-campo">Quantas doses saem de 1 unidade/garrafa</label>
            <input
              type="number"
              min="1"
              placeholder="Ex: 40"
              value={dosesPorUnidade}
              onChange={(e) => setDosesPorUnidade(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="rotulo-campo">Preço da dose (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 8.00"
                  value={precoDose}
                  onChange={(e) => setPrecoDose(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="rotulo-campo">Preço da dose no cartão (opcional)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Deixe em branco pra usar o normal"
                  value={precoDoseCartao}
                  onChange={(e) => setPrecoDoseCartao(e.target.value)}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <label style={{ fontSize: 14, opacity: 0.8 }}>Outras formas de venda (fardo, caixa, etc.)</label>
      {!estaOnline() && (
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: -8, marginBottom: 8 }}>
          Sem internet, essas formas extras não podem ser salvas agora. Cadastre o produto e adicione fardo/caixa depois, quando estiver online.
        </p>
      )}

      <ListaUnidadesVenda unidades={unidadesVenda} onRemover={(_u, indice) => removerUnidade(indice)} />

      {estaOnline() && (
        <FormularioUnidadeVenda onAdicionar={adicionarUnidade} onErro={setErro} />
      )}

      {erro && <p style={{ color: '#ffb4b4', fontSize: 14 }}>{erro}</p>}

      <button className="botao-primario" disabled={salvando} onClick={salvar}>
        {salvando ? 'Salvando...' : 'Salvar produto'}
      </button>

      {mostrarLeitor && <LeitorCodigoBarras onLeitura={aoLerCodigo} onFechar={aoFecharLeitor} />}
    </div>
  );
}
