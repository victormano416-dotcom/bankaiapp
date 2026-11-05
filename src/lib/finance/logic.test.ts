import assert from "node:assert/strict";
import test from "node:test";
import { applyMutation, emptyBundle, normalize } from "./logic.ts";

const card = { name: "Nubank", limitCents: 300000, dueDay: 10, tone: "graphite" } as never;
const purchase = (cardId: string) =>
  ({
    kind: "purchase",
    data: { cardId, description: "Loja", category: "Outros", merchant: null, totalCents: 394000, installments: 10, year: 2026, month: 10, day: 5 },
  }) as never;

test("conta nova ({}) vira um caixa completo", () => {
  const b = normalize({});
  assert.equal(b.profile.appName, "BANKAI");
  assert.equal(b.profile.onboarded, false);
  assert.deepEqual(b.cards, []);
});

test("compra parcelada cria cartão e calcula a parcela", () => {
  const b = applyMutation(emptyBundle(), { op: "launch", newCard: card, items: [purchase("")] });
  assert.equal(b.cards.length, 1);
  assert.equal(b.purchases[0].cardId, b.cards[0].id);
  assert.equal(b.purchases[0].installmentCents, 39400);
});

test("apagar cartão apaga as compras dele", () => {
  const a = applyMutation(emptyBundle(), { op: "launch", newCard: card, items: [purchase("")] });
  const b = applyMutation(a, { op: "delete-card", id: a.cards[0].id });
  assert.equal(b.cards.length, 0);
  assert.equal(b.purchases.length, 0);
});

test("metas sem limite", () => {
  const goal = { name: "Viagem", targetCents: 100000, savedCents: 0, year: 2026, month: 12 } as never;
  let b = emptyBundle();
  for (let i = 0; i < 5; i++) b = applyMutation(b, { op: "save-goal", data: goal });
  assert.equal(b.goals.length, 5);
});

test("orçamento por categoria atualiza em vez de duplicar", () => {
  let b = applyMutation(emptyBundle(), { op: "save-budget", category: "Mercado", limitCents: 50000 });
  b = applyMutation(b, { op: "save-budget", category: "Mercado", limitCents: 70000 });
  assert.equal(b.budgets.length, 1);
  assert.equal(b.budgets[0].limitCents, 70000);
});

test("editar item que não existe dá erro claro", () => {
  assert.throws(() => applyMutation(emptyBundle(), { op: "save-card", id: "x", data: card }), /Cartão não encontrado/);
});
