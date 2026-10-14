/*
  rules.js
  Regras de cálculo da consolidação, conforme o documento de escopo
  (seções 3, 4.1, 4.2, 4.3) + a regra atualizada passada no chat sobre
  "Data do ultimo vencimento" / _Status "Reprogramado".
 
  Este arquivo só recebe valores já extraídos das planilhas e devolve
  os campos calculados — não lê nem escreve nenhum arquivo.
 
  As colunas do Consolidado, as colunas fixas em N/INF, o campo fixo
  (Meio Pagamento) e o de-para de corretor (_Origem) vêm de
  assets/JS/data/config.json, carregado por company-mappings.js em
  window.ISA_CONFIG antes deste script rodar.
*/
 
(() => {
  "use strict";
 
  const NINF = "N/INF";
 
  const config = window.ISA_CONFIG || {};
 
  // Ordem exata das 34 colunas do Consolidado Agro (define a ordem do .xlsx final).
  const CONSOLIDADO_COLUMNS = config.consolidadoColumns || [];
 
  // Colunas fixas: sempre N/INF na consolidação (nenhuma companhia informa).
  const NINF_COLUMNS = config.ninfColumns || [];
 
  // Valor fixo, igual pra qualquer linha (não vem de arquivo nem é calculado por regra própria).
  const FIXED_COLUMNS = config.fixedColumns || {};
 
  const isBlank = (value) => {
    if (value === undefined || value === null) return true;
    const text = String(value).trim();
    return text === "" || text === "-" || text.toUpperCase() === NINF;
  };
 
  const norm = (text) => String(text ?? "").trim().toLowerCase();
 
  /* ---------- 4.1 Origem ---------- */
 
  // Monta, a partir de config.brokers, o de-para "alias normalizado -> nome
  // oficial" e "nome oficial -> _Origem".
  const BROKER_ALIASES = {};
  const ORIGEM_POR_OFICIAL = {};
 
  (config.brokers || []).forEach((grupo) => {
    ORIGEM_POR_OFICIAL[grupo.oficial] = grupo.origem;
 
    (grupo.aliases || []).forEach((alias) => {
      BROKER_ALIASES[norm(alias)] = grupo.oficial;
    });
  });
 
  function normalizeBrokerName(corretor) {
    if (isBlank(corretor)) {
      return NINF;
    }
 
    const original = String(corretor).trim();
    const normalized = norm(original);
 
    return BROKER_ALIASES[normalized] || original;
  }
 
  function calcOrigem(corretor) {
    const corretorPadronizado = normalizeBrokerName(corretor);
 
    if (corretorPadronizado === NINF) {
      return NINF;
    }
 
    return ORIGEM_POR_OFICIAL[corretorPadronizado] || NINF;
  }
 
  /* ---------- 4.2 Dias, Aging, Status ---------- */
  function diffDays(recebidoEm, dataBase) {
    if (
      !(recebidoEm instanceof Date) ||
      Number.isNaN(recebidoEm.getTime())
    ) {
      return null;
    }
 
    if (
      !(dataBase instanceof Date) ||
      Number.isNaN(dataBase.getTime())
    ) {
      return null;
    }
 
    /*
      Date.UTC evita diferenças de horário de verão,
      fuso horário e mudanças de meia-noite.
    */
    const recebidoUTC = Date.UTC(
      recebidoEm.getFullYear(),
      recebidoEm.getMonth(),
      recebidoEm.getDate()
    );
 
    const vencimentoUTC = Date.UTC(
      dataBase.getFullYear(),
      dataBase.getMonth(),
      dataBase.getDate()
    );
 
    return Math.round(
      (recebidoUTC - vencimentoUTC) /
      86400000
    );
  }
 
  function calcAging(dias) {
    if (
      dias === null ||
      dias === undefined ||
      Number.isNaN(Number(dias))
    ) {
      return NINF;
    }
 
    const numeroDias = Number(dias);
 
    if (numeroDias <= 0) {
      return "A Vencer";
    }
 
    if (numeroDias <= 30) {
      return "001 à 030";
    }
 
    if (numeroDias <= 60) {
      return "031 à 060";
    }
 
    if (numeroDias <= 90) {
      return "061 à 090";
    }
 
    if (numeroDias <= 120) {
      return "091 à 120";
    }
 
    if (numeroDias <= 180) {
      return "121 à 180";
    }
 
    if (numeroDias <= 364) {
      return "181 à 364";
    }
 
    return "Acima de 365";
  }
 
  function calcStatus(dias) {
    if (dias === null) return NINF;
    return dias > 0 ? "Vencido" : "A Vencer";
  }
 
  /* ---------- 4.3 Tipo de documento ---------- */
  function calcTipoDocumento(endosso, proposta, apolice) {
    const endossoNum = Number(String(endosso ?? "").replace(",", "."));
    if (!isBlank(endosso) && !Number.isNaN(endossoNum) && endossoNum > 0) return "Endosso";
    if (!isBlank(proposta)) return "Proposta";
    if (!isBlank(apolice)) return "Apólice";
    return NINF;
  }
 
  window.ISA_RULES = {
    NINF,
    CONSOLIDADO_COLUMNS,
    NINF_COLUMNS,
    FIXED_COLUMNS,
    isBlank,
    normalizeBrokerName,
    calcOrigem,
    diffDays,
    calcAging,
    calcStatus,
    calcTipoDocumento,
  };
})();