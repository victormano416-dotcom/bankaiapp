import assert from "node:assert/strict";
import test from "node:test";
import { parseReceiptText } from "./parser.ts";

test("reads installment plan and ignores Parc 01/1", () => {
  const text = `
Estabelecimento: Loja Aurora
10 x de R$ 394,00
Parc 01/1
Total R$ 3.940,00
Data: 02/03/2026
Crédito
`;
  const parsed = parseReceiptText(text, new Date(2026, 9, 16));
  assert.equal(parsed.items.length, 1);
  const item = parsed.items[0];
  assert.equal(item.installments, 10);
  assert.equal(item.totalCents, 394000);
  assert.equal(item.month, 3);
  assert.equal(item.year, 2026);
  assert.equal(item.day, 2);
  assert.equal(parsed.method, "credito");
  assert.equal(item.merchant, "Loja Aurora");
});

test("statement lines stay separate and skip payments", () => {
  const text = `
15 OUT iFood R$ 54,90
16 OUT Uber R$ 22,00
Pagamento recebido - R$ 800,00
20 OUT Farmacia Droga Raia R$ 31,00
`;
  const parsed = parseReceiptText(text, new Date(2026, 9, 16));
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[0].description.toLowerCase().includes("ifood"), true);
  assert.equal(parsed.items[0].category, "Restaurante");
  assert.equal(parsed.items[1].category, "Transporte");
  assert.equal(parsed.items[2].category, "Saúde");
  assert.equal(
    parsed.items.some((item) => item.totalCents === 80000),
    false,
  );
});

test("parcela 3/10 starts two months before the slip", () => {
  const text = "Magazine 15/10/2026 Parcela 3/10 R$ 100,00";
  const parsed = parseReceiptText(text, new Date(2026, 9, 16));
  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].installments, 10);
  assert.equal(parsed.items[0].totalCents, 100000);
  assert.equal(parsed.items[0].year, 2026);
  assert.equal(parsed.items[0].month, 8);
  assert.equal(parsed.items[0].day, 15);
});
