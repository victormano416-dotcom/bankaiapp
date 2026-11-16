import assert from "node:assert/strict";
import test from "node:test";
import { parseReceiptText } from "./parser.ts";

const NOW = new Date(2026, 10, 3); // 3 de novembro de 2026
type Want = {
  method?: string | null;
  cents?: number;
  inst?: number;
  date?: [number, number, number]; // dia, mês, ano
  desc?: string;
  conf?: string;
  kind?: string;
};
function check(name: string, text: string, want: Want, opts: { now?: Date; identity?: { names: string[]; cpfDigits?: string } } = {}) {
  test(name, () => {
    const out = parseReceiptText(text, opts.now ?? NOW, opts.identity);
    assert.equal(out.items.length, 1, `esperava 1 item, veio ${out.items.length}`);
    const it = out.items[0];
    if ("method" in want) assert.equal(out.method, want.method, "forma");
    if (want.cents !== undefined) assert.equal(it.totalCents, want.cents, "valor");
    if (want.inst !== undefined) assert.equal(it.installments, want.inst, "parcelas");
    if (want.date) assert.deepEqual([it.day, it.month, it.year], want.date, "data");
    if (want.desc) assert.equal(it.description, want.desc, "descrição");
    if (want.conf) assert.equal(out.confidence, want.conf, `confiança (${out.notes?.join(" | ")})`);
    if (want.kind) assert.equal(out.kind, want.kind, "tipo");
  });
}

/* ---------- Pix / transferência RECEBIDOS (vários bancos e layouts) ---------- */
check("Nubank: transferência recebida (frase corrida)", "Transferência recebida\nVocê recebeu uma transferência de R$ 370,00 de MARIA SILVA\n03 NOV 2026 às 14:32",
  { method: "entrada", cents: 37000, date: [3, 11, 2026], desc: "Transferência recebida de Maria Silva", kind: "transfer_in" });
check("Inter: campo e valor em linhas separadas", "Pix recebido\nValor\nR$ 370,00\nDe\nMARIA SILVA\nData\n03/11/2026",
  { method: "entrada", cents: 37000, date: [3, 11, 2026], desc: "Pix recebido de Maria Silva", conf: "alta", kind: "pix_in" });
check("Itaú: Recebido de + CPF mascarado", "Comprovante de Pix\nPix recebido\nValor: R$ 1.250,00\nRecebido de: JOSE CARLOS PEREIRA\nCPF: ***.456.789-**\nData: 02/11/2026 09:15",
  { method: "entrada", cents: 125000, date: [2, 11, 2026], desc: "Pix recebido de Jose Carlos Pereira" });
check("Mercado Pago: nome na linha de baixo", "Você recebeu R$ 370,00\nde Maria Silva\n03/11/2026", { method: "entrada", cents: 37000, desc: "Transferência recebida de Maria Silva" });
check("PicPay: 'te enviou'", "Maria Silva te enviou R$ 370,00\n03/11/2026 14:10", { method: "entrada", cents: 37000 });
check("Banco do Brasil: 'PIX - RECEBIDO' com hífen", "PIX - RECEBIDO\nValor: R$ 370,00\nPagador: MARIA SILVA\nData da transação: 03/11/2026",
  { method: "entrada", cents: 37000, desc: "Pix recebido de Maria Silva" });
check("Bloco Origem + Nome (C6/Santander)", "Pix recebido\nVocê recebeu R$ 370,00\nOrigem\nNome: MARIA SILVA\nCPF ***.111.222-**\nInstituição: NU PAGAMENTOS S.A.",
  { method: "entrada", cents: 37000, desc: "Pix recebido de Maria Silva" });
check("Pix recebido com ruído de OCR (RS, letra O)", "Pix recebido\nValor: RS 37O,OO\nDe: MARIA SILVA", { method: "entrada", cents: 37000 });
check("Recebimento por cartão (maquininha)", "Recebimento via cartao de credito\nValor: R$ 8,43", { method: "entrada", cents: 843 });
check("Depósito identificado", "Depósito identificado\nValor R$ 90,00\n03/11/2026", { method: "entrada", cents: 9000, kind: "deposit_in" });
check("TED recebida de empresa", "TED recebida\nValor: R$ 1.500,00\nOrigem: Empresa XYZ Ltda", { method: "entrada", cents: 150000, desc: "TED recebida de Empresa XYZ Ltda" });

/* ---------- identidade (o nome do perfil decide quando o texto não diz) ---------- */
const eu = { names: ["Victor Mano da Silva"], cpfDigits: "45678900" };
check("sem palavra 'recebido': meu nome em 'Para' = entrada", "Comprovante\nValor: R$ 370,00\nDe: Ana Souza\nPara: Victor Mano da Silva\nPix", { method: "entrada", cents: 37000 }, { identity: eu });
check("sem palavra 'enviado': meu nome em 'De' = saída", "Comprovante\nValor: R$ 370,00\nDe: Victor Mano da Silva\nPara: Ana Souza\nPix", { method: "pix", cents: 37000, desc: "Pix para Ana Souza" }, { identity: eu });
check("Santander: blocos 'quem pagou' e 'quem recebeu'", "Pix enviado\nValor: R$ 85,90\nDados de quem recebeu\nNome: JOAO SOUZA\nDados de quem pagou\nNome: VICTOR MANO DA SILVA",
  { method: "pix", cents: 8590, desc: "Pix para Joao Souza" }, { identity: eu });
check("mesmo layout, mas eu sou quem recebeu", "Comprovante de Pix\nValor: R$ 85,90\nDados de quem recebeu\nNome: VICTOR MANO DA SILVA\nDados de quem pagou\nNome: JOAO SOUZA",
  { method: "entrada", cents: 8590 }, { identity: eu });

/* ---------- Pix / transferência ENVIADOS ---------- */
check("Nubank: transferência enviada (sem a palavra Pix)", "Transferência enviada\nValor\nR$ 85,90\nDestino\nJOÃO SOUZA\nCPF ***.123.456-**\nInstituição\nNU PAGAMENTOS S.A.\n03/11/2026",
  { method: "pix", cents: 8590, desc: "Transferência para João Souza", kind: "transfer_out" });
check("Inter: Pix enviado com bloco Para/Nome", "Pix enviado\nValor R$ 85,90\nPara\nNome: JOÃO SOUZA\nInstituição: BANCO INTER\n03/11/2026", { method: "pix", cents: 8590, desc: "Pix para João Souza", conf: "alta" });
check("Bradesco: Pix efetuado + Favorecido", "Comprovante de transação Pix\nPix efetuado\nValor: R$ 85,90\nFavorecido: João Souza\nData: 03/11/2026", { method: "pix", cents: 8590, desc: "Pix para João Souza" });
check("Notificação: 'Você enviou R$ ... para'", "Você enviou R$ 85,90 para JOAO SOUZA", { method: "pix", cents: 8590, desc: "Pix para Joao Souza" });
check("PicPay: 'Você pagou' (pagamento)", "Você pagou R$ 50,00 para Padaria Central\n03/11/2026", { method: "pix", cents: 5000, desc: "Pagamento para Padaria Central" });
check("Pix agendado avisa e usa a data do agendamento", "Pix agendado\nValor R$ 100,00\nPara: Ana Lima\nData do agendamento: 20/11/2026", { method: "pix", cents: 10000, date: [20, 11, 2026] });
check("Pix enviado: Para sem dois-pontos", "Comprovante de Pix\nPix enviado\nR$ 85,90\nPara João Souza\nBanco Inter", { method: "pix", cents: 8590, desc: "Pix para João Souza" });

/* ---------- compra no CRÉDITO: parcelas e data ---------- */
check("crédito 10x com valor da parcela e data", "Compra aprovada\nR$ 3.940,00\n10x de R$ 394,00\nMAGAZINE LUIZA\nCartão de crédito final 1234\n05/10/2026",
  { method: "credito", cents: 394000, inst: 10, date: [5, 10, 2026], desc: "Magazine Luiza", kind: "credit" });
check("crédito: notificação 'em 10x'", "Compra de R$ 3.940,00 aprovada em MAGAZINE LUIZA em 10x\n03/11/2026", { method: "credito", cents: 394000, inst: 10, desc: "Magazine Luiza" });
check("crédito: Valor total + Parcelas: 10x", "Compra no crédito\nValor total: R$ 3.940,00\nParcelas: 10x\nEstabelecimento: MAGAZINE LUIZA\nData da compra: 05/10/2026",
  { method: "credito", cents: 394000, inst: 10, date: [5, 10, 2026], conf: "alta" });
check("crédito: 'em 10 vezes sem juros'", "Compra aprovada\nR$ 3.940,00 em 10 vezes sem juros\nLoja Exemplo\n03/11/2026", { method: "credito", cents: 394000, inst: 10 });
check("crédito: o Valor mostrado é a parcela (total = 10 x parcela)", "Compra aprovada\nCartão de crédito\nValor: R$ 394,00\n10x de R$ 394,00\nLoja Exemplo\n03/11/2026", { method: "credito", cents: 394000, inst: 10 });
check("crédito à vista", "Compra no crédito à vista\nR$ 120,00\nPadaria Central\n03/11/2026", { method: "credito", cents: 12000, inst: 1, desc: "Padaria Central" });
check("compra de outubro lida em novembro cai no mês certo", "Compra aprovada no crédito\nR$ 250,00\nFARMACIA POPULAR\n28/10/2026", { method: "credito", cents: 25000, date: [28, 10, 2026] });
check("parcela 3/10: compra começou 2 meses antes", "Magazine 15/10/2026 Parcela 3/10 R$ 100,00", { method: "credito", cents: 100000, inst: 10, date: [15, 8, 2026] });
check("'Parc 01/1' falso é à vista", "Compra no débito R$ 45,00 Parc 01/1 Padaria Pão Quente 12/10", { method: "debito", inst: 1, cents: 4500 });
check("compra no cartão sem dizer crédito/débito: pergunta", "Compra aprovada\nR$ 45,00\nPADARIA PAO QUENTE\n03/11/2026", { method: null, cents: 4500, kind: "card_unknown", conf: "media" });

/* ---------- débito, boleto, saque ---------- */
check("débito", "Compra no débito\nR$ 45,00\nPADARIA PAO QUENTE\n02/11/2026", { method: "debito", cents: 4500, desc: "Padaria Pao Quente", date: [2, 11, 2026] });
check("boleto: ignora o vencimento, usa a data do pagamento", "Pagamento de boleto\nValor: R$ 389,90\nBeneficiário: ENEL DISTRIBUICAO\nData do pagamento: 03/11/2026\nVencimento: 10/11/2026",
  { method: "debito", cents: 38990, date: [3, 11, 2026], desc: "Enel Distribuicao", kind: "boleto" });
check("saque", "Saque\nValor R$ 200,00\nCaixa eletrônico\n03/11/2026", { method: null, cents: 20000, desc: "Saque", kind: "cash" });

/* ---------- datas ---------- */
check("'Hoje' e 'Ontem' viram data de verdade", "Hoje às 14:32\nVocê recebeu R$ 20,00 de Ana", { method: "entrada", cents: 2000, date: [3, 11, 2026] });
check("'Ontem'", "Ontem às 20:10\nPix enviado\nR$ 30,00\nPara Ana", { method: "pix", cents: 3000, date: [2, 11, 2026] });
check("dia/mês sem ano usa o ano atual", "Pix enviado\nR$ 30,00\nPara: Ana\n28/10 às 10:00", { date: [28, 10, 2026] });
check("dia/mês sem ano: dezembro lido em janeiro é do ano passado", "Pix enviado\nR$ 30,00\nPara: Ana\n30/12", { date: [30, 12, 2026] }, { now: new Date(2027, 0, 5) });
check("data por extenso", "Pix recebido\nR$ 70,00\nDe: Ana\n12 de outubro de 2026", { date: [12, 10, 2026] });
check("data com mês abreviado", "Pix recebido\nR$ 70,00\nDe: Ana\n12 OUT 2026 14:00", { date: [12, 10, 2026] });
check("sem data: usa hoje e avisa", "Pix recebido\nValor: R$ 70,00\nDe: Ana", { date: [3, 11, 2026], conf: "media" });
check("ano absurdo de OCR é ignorado", "Pix recebido\nValor: R$ 70,00\nDe: Ana\n12/10/2062", { date: [3, 11, 2026] });

/* ---------- armadilhas de valor ---------- */
check("ignora saldo", "Pix enviado\nSaldo disponível R$ 1.200,00\nValor R$ 85,90\nPara: Ana", { cents: 8590 });
check("ignora IOF/tarifa", "Compra aprovada crédito\nTotal R$ 500,00\nIOF R$ 3,25\nTarifa R$ 0,99\nLoja Exemplo\n03/11/2026", { cents: 50000, method: "credito" });
check("OCR: R5 e R $", "Pix enviado\nValor R5 85,90\nPara: Ana", { cents: 8590 });
check("valor com milhar e letra O no OCR", "Compra aprovada crédito\nR$ 3.94O,OO\nLoja Exemplo\n03/11/2026", { cents: 394000 });

/* ---------- extratos e textos sem valor ---------- */
test("extrato: Pix recebido no meio não vira gasto nem entrada", () => {
  const out = parseReceiptText("05 OUT Mercado Livre R$ 120,00\n06 OUT Pix recebido de Maria R$ 80,00\n08 OUT iFood R$ 42,90", NOW);
  assert.equal(out.kind, "statement");
  assert.deepEqual(out.items.map((i) => i.totalCents), [12000, 4290]);
});
test("fatura: 'Pagamento recebido' não é entrada e os 3 itens vêm", () => {
  const out = parseReceiptText("05 OUT Mercado Livre R$ 120,00\n06 OUT Uber R$ 23,50\n07 OUT Pagamento recebido -R$ 500,00\n08 OUT iFood R$ 42,90", NOW);
  assert.equal(out.items.length, 3);
  assert.notEqual(out.method, "entrada");
});
test("texto sem comprovante não vira lançamento", () => {
  assert.equal(parseReceiptText("Obrigado pela preferência", NOW).items.length, 0);
});

/* ---------- texto padronizado devolvido pela IA ---------- */
check("IA: Pix recebido", "Pix recebido\nValor: R$ 370,00\nDe: Maria Silva\nData: 12/10/2026", { method: "entrada", cents: 37000, date: [12, 10, 2026], desc: "Pix recebido de Maria Silva", conf: "alta" });
check("IA: Compra no crédito parcelada", "Compra no crédito\nValor: R$ 3.940,00\nParcelas: 10x de R$ 394,00\nEstabelecimento: Magazine Luiza\nData: 05/10/2026\nCartão: Nubank final 1234",
  { method: "credito", cents: 394000, inst: 10, date: [5, 10, 2026], desc: "Magazine Luiza" });
check("IA: Pix enviado", "Pix enviado\nValor: R$ 85,90\nPara: Padaria do Zé\nData: 03/11/2026", { method: "pix", cents: 8590, desc: "Pix para Padaria do Zé", conf: "alta" });
