/**
 * Comprovantes de teste, no estilo do texto que o OCR devolve (layouts aproximados de cada banco).
 * Cada caso diz o que o leitor DEVE entender. "hoje" nos testes é 8/11/2026.
 */
import type { PayMethod } from "./types";

export type Case = {
  name: string;
  text: string;
  /** nomes do titular (perfil), quando o caso depende de saber quem é "você" */
  me?: string[];
  /** formas aceitas (null = o app pergunta ao usuário) */
  method: (PayMethod | null)[];
  cents: number;
  installments?: number;
  /** [dia, mês] da compra */
  date?: [number, number];
  /** a descrição deve conter este trecho (sem acento, minúsculo) */
  desc?: string;
  /** esperado não ser entrada nem gasto (ex.: sem valor) */
  none?: boolean;
};

const E: PayMethod[] = ["entrada"];
const PIX: (PayMethod | null)[] = ["pix"];

export const CASES: Case[] = [
  /* ---------------- Pix enviado ---------------- */
  {
    name: "Nubank: comprovante de Pix enviado (campos em linhas separadas)",
    me: ["Victor Mano"],
    text: "Comprovante de transferência\n12 OUT 2026 - 14:32:08\nValor\nR$ 85,90\nTipo de transferência\nPix\nDestino\nNome\nPadaria Pão Quente Ltda\nCPF/CNPJ\n12.345.678/0001-90\nInstituição\nBanco Inter S.A.\nOrigem\nNome\nVictor Mano\nInstituição\nNU PAGAMENTOS - IP\nID da transação\nE18236120202610121732abcdef",
    method: PIX, cents: 8590, date: [12, 10], desc: "padaria",
  },
  {
    name: "Nubank: mesmo comprovante sem saber quem sou (assume saída)",
    text: "Comprovante de transferência\n12 OUT 2026 - 14:32:08\nValor\nR$ 85,90\nTipo de transferência\nPix\nDestino\nNome\nPadaria Pão Quente Ltda\nInstituição\nBanco Inter S.A.\nOrigem\nNome\nVictor Mano\nInstituição\nNU PAGAMENTOS - IP",
    method: ["pix", null], cents: 8590, date: [12, 10],
  },
  {
    name: "Inter: Pix enviado",
    text: "Pix enviado\nVocê enviou um Pix\nR$ 120,00\nPara\nFULANO DE TAL\nCPF ***.456.789-**\nData 12/10/2026 às 14:32",
    method: PIX, cents: 12000, date: [12, 10], desc: "fulano",
  },
  {
    name: "Banco do Brasil: comprovante PIX (pagador e recebedor)",
    me: ["Victor Mano"],
    text: "Comprovante PIX\nPIX ENVIADO\nVALOR: R$ 50,00\nDATA: 12/10/2026\nPAGADOR\nNOME: VICTOR MANO\nRECEBEDOR\nNOME: MARIA SILVA\nCHAVE: maria@email.com",
    method: PIX, cents: 5000, date: [12, 10], desc: "maria",
  },
  {
    name: "Itaú: comprovante de transferência Pix",
    me: ["Victor Mano"],
    text: "comprovante de transferência\nvalor da transferência: R$ 200,00\ntipo de transferência: Pix\ntransferido de: Victor Mano\npara: Ana Paula Lima\ndata da transferência: 12 out 2026",
    method: PIX, cents: 20000, date: [12, 10], desc: "ana paula",
  },
  {
    name: "Bradesco: comprovante de transação Pix",
    text: "COMPROVANTE DE TRANSAÇÃO PIX\nDATA: 12/10/2026 HORA: 14:32\nVALOR: R$ 75,00\nNOME DO RECEBEDOR: JOAO DA SILVA\nINSTITUIÇÃO: BANCO BRADESCO",
    method: PIX, cents: 7500, date: [12, 10], desc: "joao",
  },
  {
    name: "Caixa: comprovante Pix",
    text: "Comprovante Pix\nValor R$ 300,00\nData da transferência 12/10/2026\nNome do recebedor\nCARLOS ALBERTO SOUZA\nTipo de conta Corrente",
    method: PIX, cents: 30000, date: [12, 10], desc: "carlos",
  },
  {
    name: "Santander: Pix realizado",
    text: "Pix realizado com sucesso\nR$ 45,00\nPara: Fulano Beltrano\n12/10/2026",
    method: PIX, cents: 4500, date: [12, 10], desc: "fulano",
  },
  {
    name: "C6 Bank: Pix enviado com sucesso",
    text: "Pix enviado com sucesso\nR$ 35,50\nPara Beltrano Silva\nHoje às 14:32",
    method: PIX, cents: 3550, date: [8, 11], desc: "beltrano",
  },
  {
    name: "PicPay: pagamento realizado",
    text: "Pagamento realizado\nR$ 18,90\nPara Maria Souza\n12/10/2026",
    method: ["pix", null], cents: 1890, date: [12, 10],
  },
  {
    name: "Mercado Pago: você pagou",
    text: "Você pagou R$ 25,00 a Loja do Bairro\nPagamento aprovado\n12/10/2026",
    method: ["pix", null], cents: 2500, date: [12, 10],
  },
  /* ---------------- Pix recebido ---------------- */
  {
    name: "Nubank: transferência recebida",
    text: "Transferência recebida\nVocê recebeu uma transferência de R$ 370,00 de Maria Silva\n12 OUT 2026 - 09:15",
    method: E, cents: 37000, date: [12, 10], desc: "maria",
  },
  {
    name: "Inter: Pix recebido",
    text: "Pix recebido\nR$ 370,00\nDe\nMARIA SILVA\n12/10/2026",
    method: E, cents: 37000, date: [12, 10], desc: "maria",
  },
  {
    name: "Itaú: você recebeu um Pix",
    text: "Você recebeu um Pix\nR$ 370,00\nde MARIA SILVA",
    method: E, cents: 37000, desc: "maria",
  },
  {
    name: "Banco do Brasil: notificação Pix recebido",
    text: "Pix recebido! R$ 370,00 de MARIA SILVA em 12/10/2026",
    method: E, cents: 37000, date: [12, 10],
  },
  {
    name: "Mercado Pago: você recebeu",
    text: "Você recebeu R$ 370,00\nde Maria Silva\nPix",
    method: E, cents: 37000, desc: "maria",
  },
  {
    name: "Comprovante Pix recebido (pagador e recebedor, sou o recebedor)",
    me: ["Victor Mano"],
    text: "Comprovante PIX\nVALOR: R$ 370,00\nDATA: 12/10/2026\nPAGADOR\nNOME: MARIA SILVA\nRECEBEDOR\nNOME: VICTOR MANO",
    method: E, cents: 37000, date: [12, 10], desc: "maria",
  },
  {
    name: "Comprovante genérico sem título: eu sou o destino, então é entrada",
    me: ["Victor Mano"],
    text: "Comprovante Pix\nValor R$ 370,00\nOrigem: Maria Silva\nDestino: Victor Mano\n12/10/2026",
    method: E, cents: 37000, date: [12, 10],
  },
  {
    name: "Comprovante genérico sem título: eu sou a origem, então é saída",
    me: ["Victor Mano"],
    text: "Comprovante Pix\nValor R$ 370,00\nOrigem: Victor Mano\nDestino: Maria Silva\n12/10/2026",
    method: PIX, cents: 37000, date: [12, 10], desc: "maria",
  },
  {
    name: "Nome com acento e caixa diferente ainda me reconhece",
    me: ["Victor Manoel"],
    text: "Comprovante Pix\nValor R$ 90,00\nPagador: JOÃO SOUZA\nRecebedor: VÍCTOR MANOEL DA SILVA",
    method: E, cents: 9000,
  },
  {
    name: "TED recebida",
    text: "TED recebida\nValor: R$ 1.500,00\nOrigem: Empresa XYZ Ltda\n12/10/2026",
    method: E, cents: 150000, date: [12, 10],
  },
  {
    name: "Depósito identificado",
    text: "Depósito identificado\nValor R$ 90,00\n12/10/2026",
    method: E, cents: 9000,
  },
  {
    name: "Crédito de salário",
    text: "Crédito de salário\nR$ 3.200,00\nEMPRESA ABC LTDA\n05/10/2026",
    method: E, cents: 320000, date: [5, 10],
  },
  {
    name: "TED enviada",
    text: "TED enviada\nValor: R$ 800,00\nFavorecido: IMOBILIARIA CENTRAL\nData: 05/11/2026",
    method: ["pix", null], cents: 80000, date: [5, 11], desc: "imobiliaria",
  },
  /* ---------------- Compra no crédito ---------------- */
  {
    name: "Nubank: compra aprovada em 10x",
    text: "Compra aprovada\nCompra de R$ 3.940,00 aprovada em MAGAZINE LUIZA\nem 10x de R$ 394,00 no cartão final 1234\n05 OUT 2026",
    method: ["credito"], cents: 394000, installments: 10, date: [5, 10], desc: "magazine",
  },
  {
    name: "Itaú: compra aprovada, parcelas e data sem ano",
    text: "Compra aprovada MAGAZINELUIZA R$ 3.940,00\n10x no cartão final 1234\n05/10 às 14:32",
    method: ["credito"], cents: 394000, installments: 10, date: [5, 10],
  },
  {
    name: "Inter: crédito parcelado 6x",
    text: "Compra no crédito\nR$ 1.200,00\nEstabelecimento AMAZON\nParcelas 6x de R$ 200,00\n05/10/2026",
    method: ["credito"], cents: 120000, installments: 6, date: [5, 10], desc: "amazon",
  },
  {
    name: "Parcelado informando só o total",
    text: "Compra parcelada em 12x\nTotal R$ 2.400,00\nLOJAS AMERICANAS\ncartão final 4321\n02/11/2026",
    method: ["credito"], cents: 240000, installments: 12, date: [2, 11],
  },
  {
    name: "Parcela e total ao mesmo tempo: vale o total informado",
    text: "Compra aprovada\nem 12x de R$ 83,33 (total R$ 1.000,00)\nCASAS BAHIA\ncrédito final 1234\n03/11/2026",
    method: ["credito"], cents: 100000, installments: 12, date: [3, 11],
  },
  {
    name: "10 x R$ 394,00 (sem 'de')",
    text: "Compra no crédito\n10 x R$ 394,00\nMagazine Luiza\n05/10/2026",
    method: ["credito"], cents: 394000, installments: 10, date: [5, 10],
  },
  {
    name: "À vista no crédito",
    text: "Compra aprovada\nR$ 89,90\nIFOOD\ncartão de crédito final 1234\n06/11/2026",
    method: ["credito"], cents: 8990, installments: 1, date: [6, 11], desc: "ifood",
  },
  {
    name: "Parc 01/1 não é parcelamento",
    text: "Compra no crédito R$ 150,00 Parc 01/1 FARMACIA POPULAR 04/11/2026",
    method: ["credito"], cents: 15000, installments: 1, date: [4, 11],
  },
  {
    name: "Compra de ontem",
    text: "Compra aprovada\nR$ 52,00\nUBER *TRIP\ncrédito final 1234\nOntem às 21:10",
    method: ["credito"], cents: 5200, date: [7, 11],
  },
  {
    name: "Compra do mês passado vai para o mês passado",
    text: "Compra aprovada\nR$ 310,00\nPOSTO SHELL\ncrédito final 1234\n28/10/2026",
    method: ["credito"], cents: 31000, date: [28, 10],
  },
  {
    name: "Data sem ano no futuro vira ano passado",
    text: "Compra aprovada\nR$ 99,00\nLOJA X\ncrédito final 1234\n28/12 às 10:00",
    method: ["credito"], cents: 9900, date: [28, 12],
  },
  {
    name: "Data por extenso",
    text: "Compra no crédito\nR$ 240,00\nRESTAURANTE SABOR\n12 de outubro de 2026",
    method: ["credito"], cents: 24000, date: [12, 10],
  },
  /* ---------------- Débito, boleto, saque ---------------- */
  {
    name: "Compra no débito",
    text: "Compra no débito\nR$ 45,00\nPADARIA PAO QUENTE\n06/11/2026",
    method: ["debito"], cents: 4500, date: [6, 11], desc: "padaria",
  },
  {
    name: "Boleto: não confunde vencimento com data de pagamento",
    text: "Comprovante de pagamento de boleto\nBeneficiário: ENEL DISTRIBUICAO\nValor do documento R$ 389,90\nValor cobrado R$ 389,90\nData de vencimento 10/11/2026\nData do pagamento 08/11/2026",
    method: ["pix", "debito", null], cents: 38990, date: [8, 11], desc: "enel",
  },
  {
    name: "Saque",
    text: "Saque realizado\nR$ 200,00\nCaixa eletrônico\n05/11/2026",
    method: ["dinheiro", null], cents: 20000, date: [5, 11],
  },
  /* ---------------- Ruído de OCR ---------------- */
  {
    name: "OCR trocou R$ por RS",
    text: "Pix recebido\nRS 370,00\nDe MARIA SILVA",
    method: E, cents: 37000,
  },
  {
    name: "R$ colado no número",
    text: "Pix enviado\nR$370,00\nPara JOAO",
    method: PIX, cents: 37000,
  },
  {
    name: "Valor sem R$",
    text: "Pix enviado\nValor: 370,00\nPara JOAO SOUZA",
    method: PIX, cents: 37000,
  },
  {
    name: "Milhar com espaço do OCR",
    text: "Pix enviado\nR$ 1 234,56\nPara IMOBILIARIA CENTRAL",
    method: PIX, cents: 123456,
  },
  {
    name: "Ignora tarifa e saldo",
    text: "Pix enviado\nValor R$ 100,00\nTarifa R$ 0,00\nSaldo após a transação R$ 1.532,10\nPara JOAO",
    method: PIX, cents: 10000,
  },
  /* ---------------- Mais formatos e casos difíceis ---------------- */
  {
    name: "Push do Nubank sem rótulos (compra no crédito)",
    text: "Nubank\nCompra de R$ 52,00 aprovada em UBER *TRIP",
    method: ["credito", null], cents: 5200, desc: "uber",
  },
  {
    name: "Pix recebido com sucesso (frase longa, valor no meio)",
    text: "Você recebeu um Pix de R$ 50,00 de FULANO DE TAL em 06/11/2026 às 09:41. Confira no app.",
    method: E, cents: 5000, date: [6, 11], desc: "fulano",
  },
  {
    name: "Devolução de Pix é entrada",
    text: "Pix devolvido\nVocê recebeu de volta R$ 85,90\nde PADARIA PAO QUENTE\n07/11/2026",
    method: E, cents: 8590, date: [7, 11],
  },
  {
    name: "Estorno de compra é entrada",
    text: "Estorno de compra\nR$ 120,00\nMAGAZINE LUIZA\n06/11/2026",
    method: E, cents: 12000, date: [6, 11],
  },
  {
    name: "Pix agendado usa a data do agendamento",
    text: "Pix agendado\nValor R$ 600,00\nPara IMOBILIARIA CENTRAL\nAgendado para 10/11/2026",
    method: PIX, cents: 60000, date: [10, 11],
  },
  {
    name: "Pix por QR Code",
    text: "Pagamento via Pix QR Code\nValor R$ 28,00\nRecebedor: LANCHONETE DO ZE\n08/11/2026",
    method: PIX, cents: 2800, date: [8, 11], desc: "lanchonete",
  },
  {
    name: "Data com ponto e hífen",
    text: "Pix enviado\nR$ 15,00\nPara MARIA\n12.10.2026",
    method: PIX, cents: 1500, date: [12, 10],
  },
  {
    name: "Data no formato ISO",
    text: "Pix enviado\nR$ 15,00\nPara MARIA\n2026-10-12 14:32:08",
    method: PIX, cents: 1500, date: [12, 10],
  },
  {
    name: "Data abreviada com ponto",
    text: "Compra no crédito\nR$ 77,00\nLIVRARIA CULTURA\n12 out. 2026",
    method: ["credito"], cents: 7700, date: [12, 10],
  },
  {
    name: "Valor grande",
    text: "TED enviada\nValor: R$ 12.345,67\nFavorecido: CONSTRUTORA BETA\n05/11/2026",
    method: ["pix", null], cents: 1234567, date: [5, 11],
  },
  {
    name: "Valor pequeno",
    text: "Pix enviado\nR$ 0,99\nPara APP STORE",
    method: PIX, cents: 99,
  },
  {
    name: "Parcelas por extenso: 3 vezes sem juros",
    text: "Compra aprovada\nR$ 300,00 em 3 vezes sem juros\nKABUM\ncrédito final 1234\n04/11/2026",
    method: ["credito"], cents: 30000, installments: 3, date: [4, 11],
  },
  {
    name: "3 parcelas de R$ 100,00",
    text: "Compra no crédito\n3 parcelas de R$ 100,00\nMERCADO LIVRE\n04/11/2026",
    method: ["credito"], cents: 30000, installments: 3, date: [4, 11],
  },
  {
    name: "1x explícito é à vista",
    text: "Compra no crédito\n1x de R$ 64,90\nSPOTIFY\n03/11/2026",
    method: ["credito"], cents: 6490, installments: 1, date: [3, 11],
  },
  {
    name: "Nubank: Pix enviado em frase única",
    text: "Pix enviado\nVocê enviou R$ 40,00 para JOAO PEDRO via Pix\n05 NOV 2026",
    method: PIX, cents: 4000, date: [5, 11], desc: "joao",
  },
  {
    name: "Mercado Pago: pagamento recebido por Pix",
    text: "Você recebeu um pagamento\nR$ 220,00\nPix de CLIENTE EXEMPLO\n06/11/2026",
    method: E, cents: 22000, date: [6, 11],
  },
  {
    name: "Mesmo sobrenome não me confunde (Silva)",
    me: ["Maria Silva"],
    text: "Comprovante Pix\nValor R$ 150,00\nPagador: JOAO SILVA\nRecebedor: PEDRO SILVA\n12/10/2026",
    method: PIX, cents: 15000, date: [12, 10],
  },
  {
    name: "Pagamento de fatura do cartão pelo app (saída)",
    text: "Pagamento de fatura realizado\nR$ 1.850,40\nCartão Nubank\n05/11/2026",
    method: ["pix", "debito", null], cents: 185040, date: [5, 11],
  },
  {
    name: "Rótulo e valor em linhas trocadas (modo escuro)",
    text: "R$ 64,00\nValor\nPix\nTipo\nBAR DO ALEMAO\nDestino\n09 NOV 2026\nData",
    method: PIX, cents: 6400,
  },
  {
    name: "Compra no débito com merchant depois do valor",
    text: "Compra aprovada no débito\nR$ 31,50\nPADARIA ESTRELA\nfinal 9988\n07/11/2026",
    method: ["debito"], cents: 3150, date: [7, 11], desc: "padaria",
  },
  {
    name: "Compra no crédito com merchant antes do valor",
    text: "RESTAURANTE SABOR DA TERRA\nCompra no crédito\nR$ 184,00\nfinal 1234\n08/11/2026",
    method: ["credito"], cents: 18400, date: [8, 11], desc: "restaurante",
  },
  /* ---------------- Print de Pix da galeria: ruído que já enganou o app ---------------- */
  {
    name: "Print de Pix com barra de status, ID da transação e CPF (nada disso é parcela)",
    me: ["Victor Mano"],
    text: "14:32  5G  87%\nComprovante de Pix\n12 OUT 2026 - 14:32:08\nValor\nR$ 150,00\nDestino\nNome\nMARIA SILVA\nCPF ***.456.789-**\nInstituição\nBANCO INTER S.A.\nAgência 0001 Conta 12345-6\nOrigem\nNome\nVictor Mano\nID da transação\nE18236120202610121732a1b2c3d4e5f6\nAutenticação 3F2A-91C4-77B0",
    method: PIX, cents: 15000, installments: 1, date: [12, 10], desc: "maria",
  },
  {
    name: "Pix para instituição 'Cooperativa de Crédito' não é cartão de crédito",
    text: "Pix enviado\nValor R$ 230,00\nPara: JOSE CARLOS PEREIRA\nInstituição: SICREDI - Cooperativa de Crédito\n05/11/2026 às 10:15",
    method: PIX, cents: 23000, installments: 1, date: [5, 11], desc: "jose",
  },
  {
    name: "Pix enviado de banco com 'Crédito' no nome da instituição",
    text: "Comprovante de transferência Pix\nR$ 410,00\nPara: ANA PAULA\nInstituição: BANCO PAN S.A. (Crédito, Financiamento e Investimento)\n03/11/2026",
    method: PIX, cents: 41000, installments: 1, date: [3, 11],
  },
  {
    name: "Pix recebido com 'Crédito em conta' e hora colada",
    text: "Crédito em conta\nPix recebido\nR$ 370,00\nDe MARIA SILVA\n12/10/2026 14:32",
    method: E, cents: 37000, installments: 1, date: [12, 10],
  },
  {
    name: "OCR trocou R$ por R5 e Pix por PIX maiúsculo",
    text: "PIX ENVIADO\nR5 85,90\nPARA JOAO SOUZA\n12/10/2026",
    method: PIX, cents: 8590, installments: 1, date: [12, 10],
  },
  {
    name: "Data com hora e número de agência não vira parcela",
    text: "Transferência efetuada com sucesso\nValor: R$ 200,00\nAgência: 1234  Conta: 56789-0\nData 12/10/2026 às 14:32:08\nFavorecido: IMOBILIARIA CENTRAL",
    method: ["pix", null], cents: 20000, installments: 1, date: [12, 10], desc: "imobiliaria",
  },
  {
    name: "Pix com tarifa, saldo e protocolo numérico",
    text: "Pix enviado\nValor R$ 75,00\nTarifa R$ 0,00\nSaldo disponível R$ 2.310,45\nProtocolo 20261012143208123456\nPara LANCHONETE DO ZE\n12/10/2026",
    method: PIX, cents: 7500, installments: 1, date: [12, 10],
  },
  {
    name: "Pix recebido de empresa, com CNPJ",
    text: "Pix recebido\nVocê recebeu R$ 1.280,00\nde EMPRESA EXEMPLO LTDA\nCNPJ 12.345.678/0001-90\n06/11/2026 às 08:00",
    method: E, cents: 128000, installments: 1, date: [6, 11], desc: "empresa",
  },
  /* ---------------- Não é comprovante ---------------- */
  { name: "Texto sem valor", text: "Obrigado pela preferência. Volte sempre!", method: [null], cents: 0, none: true },
];
