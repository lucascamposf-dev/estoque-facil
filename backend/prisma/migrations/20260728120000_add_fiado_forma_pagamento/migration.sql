-- Adiciona 'FIADO' ao enum FormaPagamento.
-- Migration puramente aditiva: nenhum dado existente é alterado ou removido.
-- Corrige o bug em que a "Venda rápida" mandava formaPagamento: 'FIADO' pro
-- backend, mas o Postgres rejeitava a gravação porque esse valor não existia
-- no enum (a venda fiado nunca virava dívida de verdade pro cliente).
ALTER TYPE "FormaPagamento" ADD VALUE 'FIADO';
