import assert from "node:assert/strict";
import test from "node:test";
import { CASES } from "./recognize.corpus.ts";
import { parseReceiptText } from "./parser.ts";

const NOW = new Date(2026, 10, 8, 12, 0); // 8/11/2026
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

for (const c of CASES) {
  test(`comprovante: ${c.name}`, () => {
    const out = parseReceiptText(c.text, NOW, c.me ? { names: c.me } : undefined);
    const item = out.items[0];
    if (c.none) return assert.equal(item, undefined, "não devia ler valor");
    assert.ok(item, "não leu nenhum item");
    assert.ok(c.method.includes(out.method), `forma ${out.method}, aceitas ${c.method.join("/")}`);
    assert.equal(item.totalCents, c.cents, "valor");
    assert.equal(item.installments, c.installments ?? 1, "parcelas");
    if (c.date) assert.deepEqual([item.day, item.month], c.date, "data da compra");
    if (c.desc) assert.ok(fold(item.description).includes(c.desc), `descrição "${item.description}"`);
  });
}
