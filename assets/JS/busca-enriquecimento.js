(() => {

  "use strict";

  const NINF = "N/INF";

  const config = window.ISA_CONFIG || {};

  const ENRIQUECER = config.enriquecer || [];

  const BI_MAPPING = config.biMapping || {};

  /*
   * Colunas onde Proposta e Apólice podem aparecer no Relatório BI —
   * reaproveitadas tanto na indexação exata quanto na busca por sufixo.
   */
  const BI_CAMPOS_PROPOSTA = config.biCamposProposta || [];

  const BI_CAMPOS_APOLICE = config.biCamposApolice || [];

  const BI_CAMPO_SEGURADO = config.biCampoSegurado || "Cliente";

  const CONSOLIDADO_CAMPO_SEGURADO = "SEGURADO";

  /*
   * Quantidade mínima de dígitos pro número do Consolidado ser aceito
   * como sufixo válido na busca parcial do BI — evita que um número
   * curto demais (ex: "12") gere match por coincidência com qualquer
   * proposta/apólice que termine nesses dígitos.
   */
  const MIN_DIGITOS_SUFIXO = 5;

  const CAMPOS_SEM_NINF = config.camposSemNinf || [];

  const HUBSPOT_CONFIG = config.hubspot || {};
  const HUBSPOT_COL_TICKET = HUBSPOT_CONFIG.nomeTicket || "Nome do ticket";
  const HUBSPOT_COL_AGENTE = HUBSPOT_CONFIG.agente || "Agente Agro";
  const HUBSPOT_COL_GRUPO = HUBSPOT_CONFIG.grupoProducao || "Grupo de produção P&C";
  const AGENTE_POR_EMAIL = HUBSPOT_CONFIG.agentePorEmail || {};

  /*
   * Campos em que, se o "melhor" registro do grupo (Proposta/Apólice)
   * não tiver valor real no BI, procura-se entre os demais registros
   * do mesmo grupo (mesma Proposta/Apólice) o primeiro com valor real,
   * em vez de descartar o campo.
   */
  const CAMPOS_FALLBACK_GRUPO_BI = ["Agente", "Projeto", "Agência", "Cultura", "PRODUTO", "Telefone"];

  /*
   * De-para de "Agente" vindo do Histórico/BI: alguns nomes de agente
   * devem ser substituídos por outro responsável na hora de enriquecer
   * o Consolidado, independente do que veio na fonte.
   */
  const AGENTE_MAPPING = {
    "pbm agrogestao empresarial ltda": "Graziele",
    "farias & copetti assessoria no agronegocio ltda": "Kamila Frison Cocco",
    "fabio andrei assuncao": "FABIO ANDREI ASSUNÇÃO",

    /*
     * Esses dois nomes vêm errados no Histórico/BI pra esse agente —
     * força "Sem Correspondência" (em vez do nome) pra cair na busca
     * manual, independente da fonte onde apareceram.
     */
    "fabio manoel piana": "Sem Correspondência",
    "top agricultura servicos tecnicos ltda": "Sem Correspondência"
  };

  /*
   * De-para da coluna "Grupo de Produção" (match exato normalizado).
   */
  const GRUPO_PRODUCAO_MAPPING = {
    "0719 - agro sicredi centro sul pr/sc/rj": "0903 - AGRO SICREDI CENTRO-SUL",
    "0903 - agro sicredi centro-sul ms": "0903 - AGRO SICREDI CENTRO-SUL"
  };

  /*
   * De-para Grupo de Produção -> Agente, aplicado só quando o Agente
   * terminou a busca como "Não Localizado", "Sem Agente" ou
   * "Sem Correspondência". Match por "contém" (ignorando pontuação).
   */
  const AGENTE_POR_GRUPO_PRODUCAO = [
    { grupo: "sicredi centro sul", agente: "Ligia Dornelles" },
    { grupo: "sicredi dexis", agente: "Daniella Gomes Costa" },
    { grupo: "sicredi vale do piquiri", agente: "Barbara Magalhaes" }
  ];

  const AGENTES_SUBSTITUIVEIS_POR_GRUPO = [
    "nao localizado",
    "sem agente",
    "sem correspondencia"
  ];

  function normalizeGrupoParaBusca(valor) {

    return normalize(valor)
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  }

  function aplicarDeParaGrupoProducao(linha) {

    const chave = normalize(linha["Grupo de Produção"]);

    if (GRUPO_PRODUCAO_MAPPING[chave]) {
      linha["Grupo de Produção"] = GRUPO_PRODUCAO_MAPPING[chave];
    }

  }

  function aplicarAgentePorGrupoProducao(linha) {

    if (
      !AGENTES_SUBSTITUIVEIS_POR_GRUPO.includes(
        normalize(linha["Agente"])
      )
    ) {
      return;
    }

    const grupo = normalizeGrupoParaBusca(linha["Grupo de Produção"]);

    if (!grupo) {
      return;
    }

    const regra = AGENTE_POR_GRUPO_PRODUCAO.find(r =>
      ` ${grupo} `.includes(` ${r.grupo} `)
    );

    if (regra) {
      linha["Agente"] = regra.agente;
    }

  }

  /*
   * De-para final de Agente: unifica variações do mesmo nome e devolve
   * "Sem Correspondência" para qualquer agente fora da lista oficial.
   */
  const AGENTES_OFICIAIS = [
    "ALEXANDRE SILVA DA VEIGA LTDA",
    "ARMANDO MARCZEWSKI - ME",
    "BIENERT ASSESSORIA E CONSULTORIA LTDA",
    "Daniella Gomes Costa",
    "FABIO ANDREI ASSUNÇÃO",
    "Graziele da Rosa Rodrigues",
    "J. BELLETT CONSULTORIA LTDA",
    "Kamila Frison Cocco",
    "LIGIA CRISTINA RIES DORNELES",
    "NOE FELIPE PORTELA MACHADO LTDA",
    "PBM AGROGESTAO EMPRESARIAL LTDA",
    "R.MIOTTO CONSULTORIA EMPRESARIAL",
    "RIL REPRESENTACOES LTDA",
    "Barbara Magalhaes"
  ];

  const AGENTE_ALIASES = {
    "daniella": "Daniella Gomes Costa",
    "graziele": "Graziele da Rosa Rodrigues",
    "ligia dornelles": "LIGIA CRISTINA RIES DORNELES",
    "ligia dorneles": "LIGIA CRISTINA RIES DORNELES"
  };

  const AGENTE_OFICIAL_POR_CHAVE = {};

  AGENTES_OFICIAIS.forEach(nome => {
    AGENTE_OFICIAL_POR_CHAVE[normalize(nome)] = nome;
  });

  Object.entries(AGENTE_ALIASES).forEach(([alias, nome]) => {
    AGENTE_OFICIAL_POR_CHAVE[alias] = nome;
  });

  function aplicarDeParaAgenteFinal(linha) {

    const chave = normalize(linha["Agente"]);

    if (
      chave === "" ||
      chave === "-" ||
      chave === normalize(NINF) ||
      chave === "sem agente" ||
      chave === "nao localizado" ||
      chave === "sem correspondencia"
    ) {
      return;
    }

    linha["Agente"] =
      AGENTE_OFICIAL_POR_CHAVE[chave] || "Sem Correspondência";

  }

  function normalize(value) {

    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

  }

  function normalizeAgente(valor) {

    const chave = normalize(valor);

    return AGENTE_MAPPING[chave] || valor;

  }

  function isEmpty(value) {

    const texto = normalize(value);

    return (
      texto === "" ||
      texto === "-" ||
      texto === normalize(NINF) ||
      texto === "sem correspondencia" ||
      texto === "nao localizado" ||
      texto === "sem agente"
    );

  }

  function canOverwriteProjeto(value) {

    const text = String(value ?? "")
      .trim()
      .toLowerCase();

    return (
      isEmpty(value) ||
      text === "sem projeto"
    );

  }

  function canOverwriteAgencia(value) {

    const text = String(value ?? "")
      .trim()
      .toLowerCase();

    return (
      isEmpty(value) ||
      text === "sem agencia" ||
      text === "sem agência"
    );

  }

  function endsWithMatch(source, target) {

    if (!source || !target) {
      return false;
    }

    return String(source)
      .trim()
      .endsWith(String(target).trim());

  }

  function selecionarMelhorRegistro(registros) {

    if (!registros.length) {
      return null;
    }

    return registros.sort((a, b) => {

      const parcelaA =
        Number(a["Numero Parcela"]) || 0;

      const parcelaB =
        Number(b["Numero Parcela"]) || 0;

      return parcelaB - parcelaA;

    })[0];

  }

  function parseValorNumerico(value) {

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    if (value === null || value === undefined || value === "") {
      return 0;
    }

    let text = String(value)
      .trim()
      .replace(/\u00A0/g, " ")
      .replace(/\s/g, "")
      .replace(/R\$/gi, "");

    let negativo = false;

    // Trata valores contábeis negativos:
    // (1.500,00) -> -1500
    if (
      text.startsWith("(") &&
      text.endsWith(")")
    ) {
      negativo = true;

      text = text
        .slice(1, -1)
        .trim();
    }

    // Trata sinal negativo:
    // -1.500,00
    if (text.startsWith("-")) {
      negativo = true;
      text = text.slice(1);
    }

    if (
      text.includes(".") &&
      text.includes(",")
    ) {
      text = text
        .replace(/\./g, "")
        .replace(",", ".");
    } else if (
      text.includes(",")
    ) {
      text = text.replace(",", ".");
    }

    const numero = Number(text);

    if (!Number.isFinite(numero)) {
      return 0;
    }

    return negativo ? -numero : numero;
  }

  function formatDateBR(date) {

    if (
      !(date instanceof Date) ||
      Number.isNaN(date.getTime())
    ) {
      return null;
    }

    const day = String(
      date.getDate()
    ).padStart(2, "0");

    const month = String(
      date.getMonth() + 1
    ).padStart(2, "0");

    const year = date.getFullYear();

    return `${day}/${month}/${year}`;

  }

  async function readExcel(file) {

    const { data } =
      await window.ISA_XLSX_WORKER.parseWorkbook(file, {
        xlsxOptions: { type: "array", cellDates: true },
        sheetToJsonOptions: { defval: "" }
      });

    return (data || []).map(linha => {

      const linhaNormalizada = {};

      Object.entries(linha).forEach(
        ([chave, valor]) => {

          const chaveNormalizada =
            String(chave).trim();

          linhaNormalizada[chaveNormalizada] =
            valor;

        }
      );

      return linhaNormalizada;

    });

  }

  function buscarPorCampo(
    registros,
    campo,
    valor
  ) {

    if (!valor) {
      return null;
    }

    const encontrados =
      registros.filter(linha => {

        return normalize(
          linha[campo]
        ) === normalize(valor);

      });

    return selecionarMelhorRegistro(
      encontrados
    );

  }

  function buscarPorApolice(
    registros,
    valor
  ) {

    return (
      buscarPorCampo(
        registros,
        "Numero Apolice",
        valor
      )
      ||
      buscarPorCampo(
        registros,
        "Apólice",
        valor
      )
      ||
      buscarPorCampo(
        registros,
        "Numero da apolice",
        valor
      )
      ||
      buscarPorCampo(
        registros,
        "Apólice / Contrato",
        valor
      )
    );

  }

  function criarIndice(
    registros,
    campo
  ) {

    const indice = new Map();

    registros.forEach(registro => {

      if (isEmpty(registro[campo])) {
        return;
      }

      const chave =
        normalize(
          registro[campo]
        );

      if (!chave) {
        return;
      }

      if (!indice.has(chave)) {

        indice.set(
          chave,
          []
        );

      }

      indice.get(chave)
        .push(registro);

    });

    return indice;

  }

  function buscarIndice(
    indice,
    valor
  ) {

    if (isEmpty(valor)) {
      return null;
    }

    const chave =
      normalize(valor);

    const registros =
      indice.get(chave) || [];

    return selecionarMelhorRegistro(
      registros
    );

  }

  function obterGrupo(
    indice,
    valor
  ) {

    if (isEmpty(valor)) {
      return [];
    }

    const chave =
      normalize(valor);

    return indice.get(chave) || [];

  }

  /*
   * Entre os registros de um mesmo grupo (mesma Proposta/Apólice),
   * ordenados por maior Numero Parcela, devolve o primeiro valor real
   * (classificado por classificarValorFonte) encontrado no campo de
   * origem indicado. Usado como fallback quando o "melhor" registro
   * do grupo não tem esse campo preenchido.
   */
  function buscarValorRealNoGrupo(
    grupo,
    campoOrigem,
    campoDestino
  ) {

    if (!grupo || !grupo.length) {
      return null;
    }

    const ordenado = [...grupo].sort((a, b) => {

      const parcelaA =
        Number(a["Numero Parcela"]) || 0;

      const parcelaB =
        Number(b["Numero Parcela"]) || 0;

      return parcelaB - parcelaA;

    });

    for (const registro of ordenado) {

      const info =
        classificarValorFonte(
          registro[campoOrigem],
          campoDestino
        );

      if (info.real) {
        return info.valor;
      }

    }

    return null;

  }

  function somenteDigitos(valor) {

    return String(valor ?? "")
      .replace(/\D/g, "");

  }

  /*
   * Correspondência parcial pro BI: alguns registros vêm com Proposta
   * ou Apólice "compostas" (ex: "118118511095216"), onde só os dígitos
   * finais correspondem ao número que temos no Consolidado
   * (ex: "1095216"). Como isso sozinho não é confiável o suficiente,
   * só aceita o match se o nome do Segurado também bater entre as
   * duas planilhas (normalizado, ignorando acento/espaço/maiúscula).
   */
  function buscarBIPorSufixo(
    bi,
    campos,
    valorConsolidado,
    seguradoConsolidado
  ) {

    const digitosConsolidado =
      somenteDigitos(valorConsolidado);

    if (
      digitosConsolidado.length <
      MIN_DIGITOS_SUFIXO
    ) {
      return { melhor: null, grupo: [] };
    }

    const seguradoNormalizado =
      normalize(seguradoConsolidado);

    if (!seguradoNormalizado) {
      return { melhor: null, grupo: [] };
    }

    const candidatos =
      bi.filter(linha => {

        const bateNumero =
          campos.some(campo => {

            const digitosBI =
              somenteDigitos(
                linha[campo]
              );

            return (
              digitosBI.length >
              digitosConsolidado.length &&
              digitosBI.endsWith(
                digitosConsolidado
              )
            );

          });

        if (!bateNumero) {
          return false;
        }

        return (
          normalize(
            linha[BI_CAMPO_SEGURADO]
          ) === seguradoNormalizado
        );

      });

    return {
      melhor: selecionarMelhorRegistro(candidatos),
      grupo: candidatos
    };

  }

  function classificarValorFonte(valor, campo) {

    const valorFormatado =
      valor instanceof Date
        ? (formatDateBR(valor) || "")
        : valor;

    const texto =
      String(valorFormatado ?? "").trim();

    /*
     * "-" no Histórico/BI é uma informação confirmada, não
     * "sem informação": significa que a companhia mandou o campo
     * vazio de propósito. Pros campos Projeto e Agência isso vira
     * o literal usado no resto do sistema ("Sem Projeto" /
     * "Sem Agência"), em vez de cair em "Sem Correspondência".
     */
    if (texto === "-") {

      if (campo === "Projeto") {

        return {
          real: true,
          confirmadoSemInfo: false,
          valor: "Sem Projeto"
        };

      }

      if (campo === "Agência") {

        return {
          real: true,
          confirmadoSemInfo: false,
          valor: "Sem Agência"
        };

      }

    }

    /*
     * "Sem Agente" é uma informação confirmada da fonte (não é
     * "sem informação") — precisa continuar sendo "Sem Agente" na
     * saída, distinto de "Sem Correspondência" (que significa que o
     * sistema não achou nenhum match). Por isso intercepta aqui,
     * antes do isEmpty() genérico, que trataria "Sem Agente" como
     * vazio.
     */
    if (
      campo === "Agente" &&
      normalize(texto) === "sem agente"
    ) {

      return {
        real: true,
        confirmadoSemInfo: false,
        valor: "Sem Agente"
      };

    }

    if (texto.toUpperCase() === NINF) {

      return {
        real: false,
        confirmadoSemInfo: true
      };

    }

    if (isEmpty(texto)) {

      return {
        real: false,
        confirmadoSemInfo: false
      };

    }

    return {
      real: true,
      confirmadoSemInfo: false,
      valor: texto
    };

  }

  /*
   * "Sem Projeto" / "Sem Agência" são valores "reais" (confirmados),
   * mas são só um placeholder — não devem impedir que o BI seja
   * consultado em busca de um valor mais útil. Só valem como resposta
   * final se o BI também não trouxer nada melhor.
   */
  function isPlaceholderReal(campo, valor) {

    const texto = String(valor ?? "")
      .trim()
      .toLowerCase();

    if (campo === "Projeto") {
      return texto === "sem projeto";
    }

    if (campo === "Agência") {
      return texto === "sem agencia" || texto === "sem agência";
    }

    if (campo === "Agente") {
      return texto === "sem agente";
    }

    return false;

  }

  function enriquecerLinha(
    linha,
    resultadoHistorico,
    resultadoBI,
    resultadoHistoricoPorNome,
    resultadoBIPorNome,
    grupoBI
  ) {

    ENRIQUECER.forEach(campo => {

      let podeAtualizar =
        isEmpty(linha[campo]);

      if (campo === "Projeto") {

        podeAtualizar =
          canOverwriteProjeto(
            linha[campo]
          );

      }

      if (campo === "Agência") {

        podeAtualizar =
          canOverwriteAgencia(
            linha[campo]
          );

      }

      if (!podeAtualizar) {
        return;
      }

      let infoHistorico =
        resultadoHistorico
          ? classificarValorFonte(
            resultadoHistorico[campo],
            campo
          )
          : { real: false, confirmadoSemInfo: false };

      const campoBI =
        BI_MAPPING[campo] || campo;

      let infoBI =
        resultadoBI
          ? classificarValorFonte(
            resultadoBI[campoBI],
            campo
          )
          : { real: false, confirmadoSemInfo: false };

      /*
       * Se o "melhor" registro do grupo (mesma Proposta/Apólice no BI)
       * não tem valor real pra esse campo, procura entre os demais
       * registros do mesmo grupo o primeiro que tenha, em vez de
       * descartar de vez.
       */
      if (
        !infoBI.real &&
        !infoBI.confirmadoSemInfo &&
        CAMPOS_FALLBACK_GRUPO_BI.includes(campo) &&
        grupoBI &&
        grupoBI.length
      ) {

        const valorGrupo =
          buscarValorRealNoGrupo(
            grupoBI,
            campoBI,
            campo
          );

        if (valorGrupo !== null) {

          infoBI = {
            real: true,
            confirmadoSemInfo: false,
            valor: valorGrupo
          };

        }

      }

      /*
       * "Agente" também pode ser localizado pelo nome do Segurado
       * (SEGURADO no Consolidado / Cliente no BI) — só entra se a
       * busca normal por Proposta/Apólice não achou nada pra esse
       * campo.
       */
      if (
        campo === "Agente" &&
        !infoHistorico.real &&
        !infoHistorico.confirmadoSemInfo &&
        resultadoHistoricoPorNome
      ) {

        infoHistorico =
          classificarValorFonte(
            resultadoHistoricoPorNome[campo],
            campo
          );

      }

      if (
        campo === "Agente" &&
        !infoBI.real &&
        !infoBI.confirmadoSemInfo &&
        resultadoBIPorNome
      ) {

        infoBI =
          classificarValorFonte(
            resultadoBIPorNome[campoBI],
            campo
          );

      }

      /*
       * "Telefone" é localizado pelo nome do Segurado (SEGURADO no
       * Consolidado / Cliente no BI). A busca por Proposta/Apólice só
       * fica como reserva caso o nome não traga telefone.
       */
      if (campo === "Telefone") {

        const historicoPorNome =
          resultadoHistoricoPorNome
            ? classificarValorFonte(
              resultadoHistoricoPorNome[campo],
              campo
            )
            : { real: false, confirmadoSemInfo: false };

        if (historicoPorNome.real) {
          infoHistorico = historicoPorNome;
        }

        const biPorNome =
          resultadoBIPorNome
            ? classificarValorFonte(
              resultadoBIPorNome[campoBI],
              campo
            )
            : { real: false, confirmadoSemInfo: false };

        if (biPorNome.real) {
          infoBI = biPorNome;
        }

      }

      /*
       * Se o Histórico só trouxe um placeholder ("Sem Projeto" /
       * "Sem Agência"), isso não é descartado de vez — mas antes de
       * usá-lo, dá uma chance pro BI trazer um valor real diferente.
       */
      if (
        infoHistorico.real &&
        !isPlaceholderReal(campo, infoHistorico.valor)
      ) {

        linha[campo] =
          campo === "Agente"
            ? normalizeAgente(infoHistorico.valor)
            : infoHistorico.valor;
        return;

      }

      if (infoBI.real) {

        linha[campo] =
          campo === "Agente"
            ? normalizeAgente(infoBI.valor)
            : infoBI.valor;
        return;

      }

      if (infoHistorico.real) {

        // Placeholder do Histórico e o BI não trouxe nada melhor.
        linha[campo] = infoHistorico.valor;
        return;

      }

      if (
        infoHistorico.confirmadoSemInfo ||
        infoBI.confirmadoSemInfo
      ) {

        linha[campo] = NINF;
        return;

      }

      if (CAMPOS_SEM_NINF.includes(campo)) {

        linha[campo] =
          "Sem Correspondência";

      }

    });

  }

  /* ---------- HubSpot (último caso) ---------- */

  function chaveNumero(valor) {
    return somenteDigitos(valor).replace(/^0+/, "");
  }

  function normalizarTextoNome(valor) {
    return normalize(valor).replace(/[^a-z0-9]+/g, " ").trim();
  }

  function extrairNumerosTicket(nomeTicket) {
    const limpo = String(nomeTicket ?? "").replace(/SRA[\s\-]*\d+/gi, " ");
    const numeros = new Set();

    (limpo.match(/\d[\d.]*\d/g) || []).forEach(token => {
      const chave = chaveNumero(token);

      if (chave.length >= MIN_DIGITOS_SUFIXO) {
        numeros.add(chave);
      }
    });

    return [...numeros];
  }

  function criarIndiceHubspot(linhas) {
    const chaveReal = {};

    if (linhas.length) {
      Object.keys(linhas[0]).forEach(chave => {
        chaveReal[normalize(chave)] = chave;
      });
    }

    const ler = (linha, coluna) => {
      const chave = chaveReal[normalize(coluna)];
      return chave === undefined ? "" : linha[chave];
    };

    const porNumero = new Map();
    const somenteNome = [];

    linhas.forEach(linha => {
      const ticket = ler(linha, HUBSPOT_COL_TICKET);
      const agente = AGENTE_POR_EMAIL[normalize(ler(linha, HUBSPOT_COL_AGENTE))] || null;
      const grupoBruto = ler(linha, HUBSPOT_COL_GRUPO);
      const grupo = isEmpty(grupoBruto) ? "" : String(grupoBruto).trim();

      if (!agente && !grupo) {
        return;
      }

      const numeros = extrairNumerosTicket(ticket);

      if (numeros.length) {

        numeros.forEach(numero => {
          if (!porNumero.has(numero)) {
            porNumero.set(numero, []);
          }

          porNumero.get(numero).push({ agente, grupo });
        });

        return;

      }

      // Só nome: serve apenas pra achar o Agente.
      if (agente) {
        somenteNome.push({
          texto: ` ${normalizarTextoNome(ticket)} `,
          agente
        });
      }
    });

    return { porNumero, somenteNome };
  }

  function buscarHubspot(linha, indice, precisaAgente) {
    const resultado = { agente: null, grupo: null };

    [linha["Proposta"], linha["Numero Apolice"]].forEach(valor => {
      const chave = chaveNumero(valor);

      if (chave.length < MIN_DIGITOS_SUFIXO) {
        return;
      }

      (indice.porNumero.get(chave) || []).forEach(entrada => {
        if (!resultado.agente && entrada.agente) {
          resultado.agente = entrada.agente;
        }

        if (!resultado.grupo && entrada.grupo) {
          resultado.grupo = entrada.grupo;
        }
      });
    });

    if (!resultado.agente && precisaAgente) {

      const segurado =
        normalizarTextoNome(linha[CONSOLIDADO_CAMPO_SEGURADO]);

      if (segurado.split(" ").length >= 2) {

        const alvo = ` ${segurado} `;

        const achado = indice.somenteNome.find(entrada =>
          entrada.texto.includes(alvo)
        );

        if (achado) {
          resultado.agente = achado.agente;
        }

      }

    }

    return resultado;
  }

  function enriquecerComHubspot(linha, indice) {

    if (!indice) {
      return;
    }

    const precisaAgente = isEmpty(linha["Agente"]);
    const precisaGrupo = isEmpty(linha["Grupo de Produção"]);

    if (!precisaAgente && !precisaGrupo) {
      return;
    }

    const resultado = buscarHubspot(linha, indice, precisaAgente);

    if (precisaAgente && resultado.agente) {
      linha["Agente"] = normalizeAgente(resultado.agente);
    }

    if (precisaGrupo && resultado.grupo) {
      linha["Grupo de Produção"] = resultado.grupo;
    }

  }

  async function runBusca() {

    const cards =
      document.querySelectorAll(
        "#view-buscar .card"
      );

    let consolidadoFile = null;
    let historicoFile = null;
    let biFile = null;
    let hubspotFile = null;

    cards.forEach(card => {

      const input =
        card.querySelector(
          "[data-input]"
        );

      if (
        !input ||
        !input.files.length
      ) {
        return;
      }

      if (
        card.dataset.company ===
        "consolidado"
      ) {
        consolidadoFile =
          input.files[0];
      }

      if (
        card.dataset.company ===
        "historico"
      ) {
        historicoFile =
          input.files[0];
      }

      if (
        card.dataset.company ===
        "bi"
      ) {
        biFile =
          input.files[0];
      }

      if (
        card.dataset.company ===
        "hubspot"
      ) {
        hubspotFile =
          input.files[0];
      }

    });

    if (!consolidadoFile) {

      const sessionRows =
        window.ISA_CONSOLIDACAO &&
          typeof window.ISA_CONSOLIDACAO.getUltimoConsolidado === "function"
          ? window.ISA_CONSOLIDACAO.getUltimoConsolidado()
          : null;

      if (!sessionRows || !sessionRows.length) {

        window.ISA_UI.showErrorModal(
          "Selecione o Consolidado Agro ou gere um na fase Consolidar antes de buscar.",
          []
        );

        return;

      }

    }

    window.ISA_UI.showLoading(
      "Buscando informações..."
    );

    const previewSectionEnriquecido = document.getElementById("enriquecido-preview");
    const downloadBtnEnriquecido = document.getElementById("btn-baixar-enriquecido");

    if (previewSectionEnriquecido) previewSectionEnriquecido.hidden = true;
    if (downloadBtnEnriquecido) downloadBtnEnriquecido.disabled = true;

    await new Promise(resolve =>
      setTimeout(resolve, 50)
    );

    try {

      console.time(
        "ENRIQUECIMENTO"
      );

      const consolidado =
        consolidadoFile
          ? await readExcel(consolidadoFile)
          : window.ISA_CONSOLIDACAO
            .getUltimoConsolidado()
            .map(linha => ({ ...linha }));

      const historico =
        historicoFile
          ? await readExcel(
            historicoFile
          )
          : [];

      const bi =
        biFile
          ? await readExcel(
            biFile
          )
          : [];

      const hubspot =
        hubspotFile
          ? await readExcel(
            hubspotFile
          )
          : [];

      const indiceHubspot =
        hubspot.length
          ? criarIndiceHubspot(hubspot)
          : null;

      const historicoPorProposta =
        criarIndice(
          historico,
          "Proposta"
        );

      const historicoPorApolice =
        criarIndice(
          historico,
          "Numero Apolice"
        );

      const historicoPorSegurado =
        criarIndice(
          historico,
          CONSOLIDADO_CAMPO_SEGURADO
        );

      const biPorProposta =
        new Map();

      bi.forEach(linha => {

        BI_CAMPOS_PROPOSTA.forEach(campo => {

          if (isEmpty(linha[campo])) {
            return;
          }

          const chave =
            normalize(
              linha[campo]
            );

          if (!chave) {
            return;
          }

          if (!biPorProposta.has(chave)) {

            biPorProposta.set(
              chave,
              []
            );

          }

          biPorProposta
            .get(chave)
            .push(linha);

        });

      });

      const biPorApolice =
        new Map();

      bi.forEach(linha => {

        BI_CAMPOS_APOLICE.forEach(campo => {

          if (isEmpty(linha[campo])) {
            return;
          }

          const chave =
            normalize(
              linha[campo]
            );

          if (!chave) {
            return;
          }

          if (!biPorApolice.has(chave)) {

            biPorApolice.set(
              chave,
              []
            );

          }

          biPorApolice
            .get(chave)
            .push(linha);

        });

      });

      const biPorCliente =
        criarIndice(
          bi,
          BI_CAMPO_SEGURADO
        );

      const filialPorAgente =
        window.ISA_FILIAL_MAP || {};

      consolidado.forEach(linha => {

        const proposta =
          linha["Proposta"];

        const apolice =
          linha["Numero Apolice"];

        let resultadoHistorico = null;
        let chaveHistorico = NINF;

        if (historico.length) {

          resultadoHistorico =
            buscarIndice(
              historicoPorProposta,
              proposta
            );

          if (resultadoHistorico) {

            chaveHistorico = "Proposta";

          } else {

            resultadoHistorico =
              buscarIndice(
                historicoPorApolice,
                apolice
              );

            if (resultadoHistorico) {

              chaveHistorico = "Apólice";

            }

          }

        }

        let resultadoBI = null;
        let chaveBI = NINF;
        let grupoBI = [];

        if (bi.length) {

          const seguradoConsolidado =
            linha[CONSOLIDADO_CAMPO_SEGURADO];

          resultadoBI =
            buscarIndice(
              biPorProposta,
              proposta
            );

          if (resultadoBI) {

            chaveBI = "Proposta";
            grupoBI =
              obterGrupo(
                biPorProposta,
                proposta
              );

          } else {

            resultadoBI =
              buscarIndice(
                biPorApolice,
                apolice
              );

            if (resultadoBI) {

              chaveBI = "Apólice";
              grupoBI =
                obterGrupo(
                  biPorApolice,
                  apolice
                );

            } else {

              /*
               * Busca exata não achou nada — tenta
               * correspondência parcial: números do BI
               * que terminam com o número do Consolidado,
               * validando pelo nome do Segurado/Cliente.
               */

              const sufixoProposta =
                buscarBIPorSufixo(
                  bi,
                  BI_CAMPOS_PROPOSTA,
                  proposta,
                  seguradoConsolidado
                );

              resultadoBI = sufixoProposta.melhor;

              if (resultadoBI) {

                chaveBI = "Proposta (parcial)";
                grupoBI = sufixoProposta.grupo;

              } else {

                const sufixoApolice =
                  buscarBIPorSufixo(
                    bi,
                    BI_CAMPOS_APOLICE,
                    apolice,
                    seguradoConsolidado
                  );

                resultadoBI = sufixoApolice.melhor;

                if (resultadoBI) {

                  chaveBI = "Apólice (parcial)";
                  grupoBI = sufixoApolice.grupo;

                }

              }

            }

          }

        }

        let origem = "Sem Correspondencia";

        if (resultadoHistorico && resultadoBI) {

          origem = "Historico + BI";

        } else if (resultadoHistorico) {

          origem = "Historico";

        } else if (resultadoBI) {

          origem = "BI";

        }

        const chave =
          resultadoHistorico
            ? chaveHistorico
            : (resultadoBI ? chaveBI : NINF);

        const seguradoConsolidadoParaNome =
          linha[CONSOLIDADO_CAMPO_SEGURADO];

        const resultadoHistoricoPorNome =
          historico.length
            ? buscarIndice(
              historicoPorSegurado,
              seguradoConsolidadoParaNome
            )
            : null;

        const resultadoBIPorNome =
          bi.length
            ? buscarIndice(
              biPorCliente,
              seguradoConsolidadoParaNome
            )
            : null;

        enriquecerLinha(
          linha,
          resultadoHistorico,
          resultadoBI,
          resultadoHistoricoPorNome,
          resultadoBIPorNome,
          grupoBI
        );

        enriquecerComHubspot(
          linha,
          indiceHubspot
        );

        aplicarDeParaGrupoProducao(linha);
        aplicarAgentePorGrupoProducao(linha);
        aplicarDeParaAgenteFinal(linha);

        linha["Filial"] =
          filialPorAgente[
          normalize(linha["Agente"])
          ] || NINF;

        /*
         * _Origem depende do Corretor. Se o Corretor acabou de
         * ser preenchido pelo enriquecimento (estava vazio antes),
         * _Origem precisa ser recalculada — senão continuaria
         * com o valor herdado da consolidação (geralmente N/INF).
         */
        linha["Corretor"] =
          window.ISA_RULES.normalizeBrokerName(
            linha["Corretor"]
          );

        linha["_Origem"] =
          window.ISA_RULES.calcOrigem(
            linha["Corretor"]
          );

        linha["origem Busca"] = origem;
        linha["Chave para Localização"] = chave;

        linha["Valor Total"] =
          parseValorNumerico(
            linha["Valor Total"]
          );

      });

      ultimoEnriquecido = consolidado;

      console.timeEnd(
        "ENRIQUECIMENTO"
      );

      renderPreviewEnriquecido(consolidado);

    } catch (error) {

      console.error(
        "Erro durante a busca:",
        error
      );

      window.ISA_UI.showErrorModal(
        "Ocorreu um erro durante a busca.",
        [error.message]
      );

    } finally {

      if (
        window.ISA_UI &&
        typeof window.ISA_UI.hideLoading === "function"
      ) {
        window.ISA_UI.hideLoading();
      }

    }

  }

  let ultimoEnriquecido = null;

  function renderPreviewEnriquecido(rows) {

    const wrap = document.getElementById("preview-enriquecido-table-wrap");
    const previewSection = document.getElementById("enriquecido-preview");
    const downloadBtn = document.getElementById("btn-baixar-enriquecido");
    const countEl = document.getElementById("enriquecido-preview-count");

    if (!wrap || !previewSection || !rows.length) return;

    const colunas = Object.keys(rows[0]);

    const tabelaApi = window.ISA_PREVIEW_TABLE.renderFilterableTable(
      wrap,
      colunas,
      rows,
      {
        formatCell: (valor, columnName) =>
          columnName === "Valor Total" && typeof valor === "number"
            ? valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
            : (valor ?? ""),
        onCount: (visiveis, total) => {
          if (!countEl) return;

          const textEl = countEl.querySelector("span");
          if (!textEl) return;

          textEl.textContent = visiveis === total
            ? `${total.toLocaleString("pt-BR")} registro${total === 1 ? "" : "s"}`
            : `${visiveis.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} registros`;
        }
      }
    );

    const btnLimparFiltrosEnriquecido = document.getElementById("btn-limpar-filtros-enriquecido");

    if (btnLimparFiltrosEnriquecido) {
      btnLimparFiltrosEnriquecido.onclick = () => tabelaApi.limparFiltros();
    }

    previewSection.hidden = false;

    if (downloadBtn) {
      downloadBtn.disabled = false;
    }

  }

  function gerarWorkbookEnriquecido(rows) {

    const worksheet =
      XLSX.utils.json_to_sheet(
        rows
      );

    const valorTotalColumnIndex =
      worksheet["!ref"]
        ? rows.length
          ? Object.keys(rows[0]).indexOf("Valor Total")
          : -1
        : -1;

    if (valorTotalColumnIndex >= 0) {

      const valorTotalColumnLetter =
        XLSX.utils.encode_col(
          valorTotalColumnIndex
        );

      for (
        let rowNumber = 2;
        rowNumber <= rows.length + 1;
        rowNumber++
      ) {

        const cellAddress =
          `${valorTotalColumnLetter}${rowNumber}`;

        const excelCell =
          worksheet[cellAddress];

        if (
          excelCell &&
          excelCell.t === "n"
        ) {

          excelCell.z =
            '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';

        }

      }
    }

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Consolidado Agro"
    );

    return workbook;

  }

  function baixarEnriquecido() {

    if (!ultimoEnriquecido || !ultimoEnriquecido.length) return;

    const workbook = gerarWorkbookEnriquecido(ultimoEnriquecido);

    XLSX.writeFile(
      workbook,
      "Consolidado Agro Enriquecido.xlsx"
    );

  }

  // Usado pelo Dashboard (Fase 03) pra reaproveitar o Consolidado
  // Enriquecido gerado nesta sessão, sem precisar baixar/reenviar o arquivo.
  function getUltimoEnriquecido() {
    return ultimoEnriquecido;
  }

  console.log("busca-enriquecimento carregado");

  window.ISA_BUSCA = {
    runBusca,
    baixarEnriquecido,
    getUltimoEnriquecido
  };

  window.ISA_BUSCA_UTILS = {

    normalize,
    isEmpty,
    canOverwriteProjeto,
    canOverwriteAgencia,
    endsWithMatch,
    selecionarMelhorRegistro,
    ENRIQUECER,
    BI_MAPPING

  };

  window.ISA_BUSCA_UTILS_BI = {
    BI_CAMPOS_PROPOSTA,
    BI_CAMPOS_APOLICE,
    BI_CAMPO_SEGURADO
  };

})();