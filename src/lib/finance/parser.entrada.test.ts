import assert from "node:assert/strict";
import test from "node:test";
import { parseReceiptText } from "./parser.ts";

const now = new Date(2026, 9, 28);
const one = (text: string) => {
  const out = parseReceiptText(text, now);
  assert.equal(out.items.length, 1, text);
  return { method: out.method, item: out.items[0] };
};

test("Pix recebido vira entrada, com nome de quem enviou", () => {
  const { method, item } = one("Pix recebido\nVocê recebeu um Pix de R$ 370,00\nDe: Maria Silva\n12/10/2026");
  assert.equal(method, "entrada");
  assert.equal(item.totalCents, 37000);
  assert.equal(item.description, "Pix recebido de Maria Silva");
  assert.equal(item.month, 10);
});

test("frase curta de banco desconhecido também é entrada", () => {
  assert.equal(one("Você recebeu R$ 370,00 por Pix").method, "entrada");
  assert.equal(one("TED recebida\nValor: R$ 1.500,00\nOrigem: Empresa XYZ Ltda").item.description, "TED recebida de Empresa XYZ Ltda");
  assert.equal(one("Depósito identificado\nValor R$ 90,00").method, "entrada");
});

test("Pix enviado continua sendo saída e mostra para quem", () => {
  const { method, item } = one("Comprovante de Pix\nPix enviado\nR$ 85,90\nPara João Souza\nBanco Inter");
  assert.equal(method, "pix");
  assert.equal(item.description, "Pix para João Souza");
  assert.equal(one("Comprovante de transferência\nValor: R$ 200,00\nDe: Victor Mano\nPara: Ana Paula Lima\nPix").item.description, "Pix para Ana Paula Lima");
});

test("comprovante de banco desconhecido: valor e descrição úteis", () => {
  const { method, item } = one("Comprovante de transferência\nTransferência realizada\nValor R$ 120,50\nPara: João\nBanco C6");
  assert.notEqual(method, "entrada");
  assert.equal(item.totalCents, 12050);
  assert.equal(item.description, "Transferência para João");
  assert.equal(one("Pagamento de boleto\nValor R$ 389,90\nBeneficiário: Enel Distribuição").item.description, "Enel Distribuição");
});

test("fatura: 'Pagamento recebido' não é entrada; extrato ignora recebimentos", () => {
  const fatura = parseReceiptText("05 OUT Mercado Livre R$ 120,00\n06 OUT Uber R$ 23,50\n07 OUT Pagamento recebido -R$ 500,00\n08 OUT iFood R$ 42,90", now);
  assert.notEqual(fatura.method, "entrada");
  assert.equal(fatura.items.length, 3);
  const misto = parseReceiptText("05 OUT Mercado Livre R$ 120,00\n06 OUT Pix recebido de Maria R$ 80,00\n08 OUT iFood R$ 42,90", now);
  assert.notEqual(misto.method, "entrada");
  assert.deepEqual(misto.items.map((i) => i.totalCents), [12000, 4290]);
});

test("parcelado e Parc 01/1 continuam certos", () => {
  const c = one("Compra aprovada\nR$ 3.940,00\n10x de R$ 394,00\nMagazine Luiza\nCartão de crédito final 1234");
  assert.equal(c.item.installments, 10);
  assert.equal(c.item.totalCents, 394000);
  assert.equal(c.item.description, "Magazine Luiza");
  assert.equal(one("Compra no débito R$ 45,00 Parc 01/1 Padaria Pão Quente 12/10").item.installments, 1);
});
