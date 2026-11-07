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
  assert.equal(
    one("TED recebida\nValor: R$ 1.500,00\nOrigem: Empresa XYZ Ltda").item.description,
    "TED recebida de Empresa XYZ Ltda",
  );
  assert.equal(one("Depósito identificado\nValor R$ 90,00").method, "entrada");
});

test("Pix enviado continua sendo saída e mostra para quem", () => {
  const { method, item } = one("Comprovante de Pix\nPix enviado\nR$ 85,90\nPara João Souza\nBanco Inter");
  assert.equal(method, "pix");
  assert.equal(item.description, "Pix para João Souza");
  assert.equal(
    one("Comprovante de transferência\nValor: R$ 200,00\nDe: Victor Mano\nPara: Ana Paula Lima\nPix").item
      .description,
    "Pix para Ana Paula Lima",
  );
});

test("comprovante de banco desconhecido: valor e descrição úteis", () => {
  const { method, item } = one(
    "Comprovante de transferência\nTransferência realizada\nValor R$ 120,50\nPara: João\nBanco C6",
  );
  assert.notEqual(method, "entrada");
  assert.equal(item.totalCents, 12050);
  assert.equal(item.description, "Transferência para João");
  assert.equal(
    one("Pagamento de boleto\nValor R$ 389,90\nBeneficiário: Enel Distribuição").item.description,
    "Enel Distribuição",
  );
});

test("fatura: 'Pagamento recebido' não é entrada; extrato ignora recebimentos", () => {
  const fatura = parseReceiptText(
    "05 OUT Mercado Livre R$ 120,00\n06 OUT Uber R$ 23,50\n07 OUT Pagamento recebido -R$ 500,00\n08 OUT iFood R$ 42,90",
    now,
  );
  assert.notEqual(fatura.method, "entrada");
  assert.equal(fatura.items.length, 3);
  const misto = parseReceiptText(
    "05 OUT Mercado Livre R$ 120,00\n06 OUT Pix recebido de Maria R$ 80,00\n08 OUT iFood R$ 42,90",
    now,
  );
  assert.notEqual(misto.method, "entrada");
  assert.deepEqual(
    misto.items.map((i) => i.totalCents).sort((a, b) => a - b),
    [4290, 12000],
  );
});

test("parcelado e Parc 01/1 continuam certos", () => {
  assert.equal(one("10 x de R$ 100,00\nTotal R$ 1.000,00\nCrédito").item.installments, 10);
  assert.equal(one("Compra no débito R$ 45,00 Parc 01/1 Padaria Pão Quente 12/10").item.installments, 1);
});

test("recebimento via credito", () => {
  const recebido = one("Recebimento via cartao de credito\nValor: R$ 8,43\nChave 2-88");
  assert.equal(recebido.method, "entrada");
  assert.equal(recebido.item.totalCents, 843);
});

test("identidade do perfil distingue Pix recebido e enviado", () => {
  const identity = { names: ["Victor Mano"], cpfDigits: "1234" };
  const recebido = parseReceiptText(
    "Pix\nPara: Victor Mano\nDe: Ana Souza\nValor R$ 370,00\nVocê recebeu",
    now,
    identity,
  );
  assert.equal(recebido.method, "entrada");
  assert.equal(recebido.items[0].description, "Pix recebido de Ana Souza");
  assert.equal(recebido.items[0].totalCents, 37000);
  const enviado = parseReceiptText(
    "Pix\nDe: Victor Mano\nPara: Ana Souza\nValor R$ 50,00\nVocê enviou",
    now,
    identity,
  );
  assert.notEqual(enviado.method, "entrada");
});

test("fatura curta nao vira entrada por causa de pagamento recebido", () => {
  const fatura = parseReceiptText(
    "05 OUT Mercado Livre R$ 120,00\n06 OUT Pagamento recebido -R$ 500,00",
    now,
  );
  assert.notEqual(fatura.method, "entrada");
});

test("Nubank compra no crédito pega valor e método", () => {
  const text = `Compra no crédito
Aprovada
R$ 129,90
Estabelecimento: Padaria Central
02/11/2026
Final 1234`;
  const out = parseReceiptText(text, now);
  assert.equal(out.method, "credito");
  assert.equal(out.items.length, 1);
  assert.equal(out.items[0].totalCents, 12990);
});

test("compra no débito não vira crédito", () => {
  const text = `Compra no débito
Valor R$ 45,00
Estabelecimento: Mercado Livre
10/11/2026`;
  const out = parseReceiptText(text, now);
  assert.equal(out.method, "debito");
  assert.equal(out.items[0].totalCents, 4500);
});

test("transferência recebida Inter vira entrada", () => {
  const text = `Transferência recebida
Você recebeu
Valor R$ 250,00
De: Carlos Eduardo
11/11/2026`;
  const out = parseReceiptText(text, now);
  assert.equal(out.method, "entrada");
  assert.equal(out.items[0].totalCents, 25000);
});
