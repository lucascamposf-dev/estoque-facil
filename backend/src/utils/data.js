// Utilitário central pra calcular datas no fuso de Brasília (UTC-3, sem
// horário de verão desde 2019).
//
// Por que isso existe: `new Date(); date.setHours(0,0,0,0)` calcula "meia-noite"
// usando o fuso horário do processo Node, não o do Brasil. Se o servidor (ex:
// Railway) roda em UTC, "meia-noite" pro sistema vira 21h em Brasília - vendas
// feitas entre 21h e 23h59 (Brasília) acabam contadas no fechamento de caixa do
// dia seguinte, e o resumo do dia fica incompleto até as 21h.
//
// Toda rota que precisa do "início do dia" (relatórios, sangrias, etc.) deve
// usar essa função em vez de repetir a lógica de `setHours` em cada arquivo.

const OFFSET_BRASIL_HORAS = 3; // Brasília = UTC-3 (fixo, sem DST desde 2019)
const OFFSET_BRASIL_MS = OFFSET_BRASIL_HORAS * 60 * 60 * 1000;

// Retorna um Date (instante UTC) correspondente à meia-noite em Brasília do
// dia da `referencia` (por padrão, agora). O Date retornado é um instante
// absoluto e pode ser comparado normalmente com `criadoEm` no Postgres.
function inicioDoDiaBrasil(referencia = new Date()) {
  const horaLocalBrasil = new Date(referencia.getTime() - OFFSET_BRASIL_MS);
  horaLocalBrasil.setUTCHours(0, 0, 0, 0);
  return new Date(horaLocalBrasil.getTime() + OFFSET_BRASIL_MS);
}

// Retorna o instante UTC correspondente ao fim do dia (23:59:59.999) em
// Brasília do dia da `referencia`. Útil pra filtros de período fechado.
function fimDoDiaBrasil(referencia = new Date()) {
  const inicioProximoDia = inicioDoDiaBrasil(new Date(referencia.getTime() + 24 * 60 * 60 * 1000));
  return new Date(inicioProximoDia.getTime() - 1);
}

module.exports = { inicioDoDiaBrasil, fimDoDiaBrasil };
