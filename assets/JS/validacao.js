/*
  validacao.js
  Validação de cabeçalho dos arquivos ANTES de qualquer automação rodar.
  Roda assim que o usuário seleciona/arrasta o arquivo em cada card —
  não espera o clique no botão de consolidar/buscar/atualizar.
 
  Não lê o corpo da planilha, só a linha de cabeçalho, pra ser rápido.
*/

(() => {
    "use strict";

    function normalizeTexto(valor) {
        return String(valor ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase();
    }

    function distanciaLevenshtein(a, b) {
        const m = a.length;
        const n = b.length;

        if (m === 0) return n;
        if (n === 0) return m;

        const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                const custo = a[i - 1] === b[j - 1] ? 0 : 1;

                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,
                    dp[i][j - 1] + 1,
                    dp[i - 1][j - 1] + custo
                );
            }
        }

        return dp[m][n];
    }

    function similaridade(a, b) {
        const maiorTamanho = Math.max(a.length, b.length);
        if (maiorTamanho === 0) return 1;
        return 1 - distanciaLevenshtein(a, b) / maiorTamanho;
    }

    // Limiar pra considerar que uma coluna do arquivo "é" a coluna esperada,
    // só escrita diferente (typo, abreviação, maiúscula/minúscula etc.).
    const LIMIAR_SEMELHANCA = 0.55;

    async function lerCabecalho(file) {
        const { sheetExists, data: matriz } =
            await window.ISA_XLSX_WORKER.parseWorkbook(file, {
                xlsxOptions: { type: "array" },
                sheetToJsonOptions: {
                    header: 1,
                    defval: "",
                    raw: true,
                    blankrows: false
                }
            });

        if (!sheetExists) {
            throw new Error(
                `O arquivo "${file.name}" não tem nenhuma planilha legível.`
            );
        }

        if (!matriz.length) {
            throw new Error(`O arquivo "${file.name}" está vazio.`);
        }

        return matriz[0]
            .map((valor) => String(valor ?? "").trim())
            .filter((valor) => valor !== "");
    }

    // Compara o cabeçalho do arquivo com a lista de colunas esperadas.
    // Cada coluna esperada só pode "consumir" uma coluna do arquivo (evita
    // duas colunas esperadas apontarem pra mesma coluna real por engano).
    function validarColunas(headersArquivo, colunasEsperadas) {
        const headersInfo = headersArquivo.map((original) => ({
            original,
            normalizado: normalizeTexto(original),
            usado: false
        }));

        const pendentes = [];
        const ausentes = [];
        const divergentes = [];

        colunasEsperadas.forEach((esperada) => {
            const normEsperada = normalizeTexto(esperada);
            const exato = headersInfo.find(
                (h) => !h.usado && h.normalizado === normEsperada
            );

            if (exato) {
                exato.usado = true;
            } else {
                pendentes.push(esperada);
            }
        });

        pendentes.forEach((esperada) => {
            const normEsperada = normalizeTexto(esperada);

            let melhor = null;
            let melhorScore = 0;

            headersInfo.forEach((h) => {
                if (h.usado) return;

                const score = similaridade(normEsperada, h.normalizado);

                if (score > melhorScore) {
                    melhorScore = score;
                    melhor = h;
                }
            });

            if (melhor && melhorScore >= LIMIAR_SEMELHANCA) {
                melhor.usado = true;
                divergentes.push({ esperado: esperada, encontrado: melhor.original });
            } else {
                ausentes.push(esperada);
            }
        });

        return {
            valido: ausentes.length === 0 && divergentes.length === 0,
            ausentes,
            divergentes
        };
    }

    function obterColunasEsperadas(view, companyKey) {
        if (view === "consolidar") {
            const empresa = window.COMPANY_MAPPINGS[companyKey];
            if (!empresa) return null;
            return [...new Set(empresa.mapTo.map((m) => m.from))];
        }

        if (
            companyKey === "consolidado" ||
            companyKey === "consolidado-h" ||
            companyKey === "historico" ||
            companyKey === "historico-h" ||
            companyKey === "dashboard"
        ) {
            // "origem Busca" e "Chave para Localização" só existem depois que o
            // arquivo passa pela Fase 02 (Buscar e enriquecer) — não fazem parte
            // do Consolidado/Histórico "cru", então não devem ser exigidas aqui.
            return window.ISA_RULES.CONSOLIDADO_COLUMNS.filter(
                (coluna) =>
                    coluna !== "origem Busca" &&
                    coluna !== "Chave para Localização" &&
                    coluna !== "Telefone"
            );
        }

        if (companyKey === "hubspot") {
            const hubspot = (window.ISA_CONFIG && window.ISA_CONFIG.hubspot) || {};
            return hubspot.columns || null;
        }

        return null;
    }

    function obterRotulo(view, companyKey) {
        if (view === "consolidar") {
            return window.COMPANY_MAPPINGS[companyKey]?.label || companyKey;
        }

        const rotulos = {
            hubspot: "HubSpot",
            consolidado: "Consolidado Agro",
            "consolidado-h": "Consolidado Agro",
            historico: "Histórico Agro",
            "historico-h": "Histórico Agro",
            bi: "Relatório BI",
            dashboard: "Consolidado Agro"
        };

        return rotulos[companyKey] || companyKey;
    }

    function algumaColunaPresente(headersNormalizados, candidatos) {
        return candidatos.some((candidato) => {
            const normCandidato = normalizeTexto(candidato);

            return headersNormalizados.some(
                (h) => h === normCandidato || similaridade(h, normCandidato) >= LIMIAR_SEMELHANCA
            );
        });
    }

    // O Relatório BI tem formato livre — só exige o mínimo pra conseguir
    // cruzar os dados (Cliente + Proposta ou Apólice).
    function validarBI(headersArquivo) {
        const headersNormalizados = headersArquivo.map(normalizeTexto);

        const bi = window.ISA_BUSCA_UTILS_BI || {};

        const camposProposta = bi.BI_CAMPOS_PROPOSTA || [
            "Proposta Cia",
            "Proposta / Controle"
        ];

        const camposApolice = bi.BI_CAMPOS_APOLICE || [
            "Numero Apolice",
            "Apólice",
            "Numero da apolice",
            "Apólice / Contrato"
        ];

        const temCliente = algumaColunaPresente(headersNormalizados, ["Cliente"]);
        const temProposta = algumaColunaPresente(headersNormalizados, camposProposta);
        const temApolice = algumaColunaPresente(headersNormalizados, camposApolice);

        const mensagens = [];

        if (!temCliente) {
            mensagens.push(
                '"Cliente" — não encontrada. É obrigatória pra cruzar os dados pelo nome do segurado.'
            );
        }

        if (!temProposta && !temApolice) {
            mensagens.push(
                'Nenhuma coluna de Proposta ou Apólice foi encontrada (ex.: "Proposta Cia", "Proposta / Controle", "Numero Apolice", "Apólice").'
            );
        }

        if (mensagens.length) {
            return { valido: false, mensagens, rotulo: "Relatório BI" };
        }

        return { valido: true };
    }

    async function validarArquivo(view, companyKey, file) {
        const headers = await lerCabecalho(file);

        if (companyKey === "bi") {
            return validarBI(headers);
        }

        const colunasEsperadas = obterColunasEsperadas(view, companyKey);

        if (!colunasEsperadas) {
            return { valido: true };
        }

        const resultado = validarColunas(headers, colunasEsperadas);

        if (resultado.valido) {
            return { valido: true };
        }

        const mensagens = [];

        resultado.divergentes.forEach((item) => {
            mensagens.push(
                `"${item.esperado}" — não encontrada, mas o arquivo tem uma coluna parecida: "${item.encontrado}".`
            );
        });

        resultado.ausentes.forEach((coluna) => {
            mensagens.push(`"${coluna}" — não encontrada no arquivo.`);
        });

        return {
            valido: false,
            mensagens,
            rotulo: obterRotulo(view, companyKey)
        };
    }

    async function validarPagos(colunasEsperadas, file) {
        const headers = await lerCabecalho(file);
        const resultado = validarColunas(headers, colunasEsperadas);

        if (resultado.valido) {
            return { valido: true };
        }

        const mensagens = [];

        resultado.divergentes.forEach((item) => {
            mensagens.push(
                `"${item.esperado}" — não encontrada, mas o arquivo tem uma coluna parecida: "${item.encontrado}".`
            );
        });

        resultado.ausentes.forEach((coluna) => {
            mensagens.push(`"${coluna}" — não encontrada no arquivo.`);
        });

        return { valido: false, mensagens };
    }

    window.ISA_VALIDACAO = { validarArquivo, validarPagos };
})();