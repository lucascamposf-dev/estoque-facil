// Rate limiting simples em memória, por chave (ex: usuário, ou usuário+empresa).
// Reseta se o servidor reiniciar (deploy, crash) - aceitável com uma única
// instância. Se um dia rodar mais de uma réplica, cada réplica tem seu próprio
// contador; nesse caso vale migrar pra um store compartilhado (ex: Redis).
function criarLimitadorTentativas({ janelaMs = 15 * 60 * 1000, maxTentativas = 5 } = {}) {
  const tentativas = new Map();

  function bloqueado(chave) {
    const agora = Date.now();
    const lista = (tentativas.get(chave) || []).filter((t) => agora - t < janelaMs);
    tentativas.set(chave, lista);
    return lista.length >= maxTentativas;
  }

  function registrarFalha(chave) {
    const lista = tentativas.get(chave) || [];
    lista.push(Date.now());
    tentativas.set(chave, lista);
  }

  function limparTentativas(chave) {
    tentativas.delete(chave);
  }

  return { bloqueado, registrarFalha, limparTentativas };
}

module.exports = { criarLimitadorTentativas };
