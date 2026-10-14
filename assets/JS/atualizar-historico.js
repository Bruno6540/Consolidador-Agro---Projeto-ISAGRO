/*
  atualizar-historico.js
  Fase 03 — Atualiza (enriquece) o Histórico Agro com os registros
  mais recentes do Consolidado Agro, sem duplicar histórico e sem
  sobrescrever dados que a Cia já tenha mandado antes.
*/

(() => {
    "use strict";

    const NINF = "N/INF";

    const { CONSOLIDADO_COLUMNS } = window.ISA_RULES;

    // O Histórico Agro não leva "origem Busca" / "Chave para Localização"
    // (só existem depois da Fase 02) — e monta as linhas só com essas
    // colunas pra não deixar nenhuma chave extra sobrar no objeto (ex: uma
    // segunda "Valor Total" vinda do arquivo de Histórico), já que
    // json_to_sheet + header só define a ORDEM das colunas, não remove
    // chaves fora da lista.
    const COLUNAS_HISTORICO = CONSOLIDADO_COLUMNS.filter(
        (coluna) =>
            coluna !== "origem Busca" &&
            coluna !== "Chave para Localização"
    );

    const config = window.ISA_CONFIG || {};

    // Colunas que só são atualizadas quando estiverem "vazias" no Histórico.
    const CAMPOS_ENRIQUECER = config.camposEnriquecerHistorico || [];

    function normalize(value) {
        return String(value ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase();
    }

    function isBlankGeral(value) {
        const text = String(value ?? "").trim();
        return (
            text === "" ||
            text === "-" ||
            text.toUpperCase() === NINF
        );
    }

    // "Projeto" também considera "Sem Projeto" vazio;
    // "Agência" também considera "Sem Agência" vazio;
    // "Agente" também considera "Sem Agente", "Sem Correspondência" e
    // "Não Localizado" vazio;
    // "Cultura" também considera "Sem Correspondência" e
    // "Não Localizado" vazio.
    // (mesmo critério usado na Fase 02, pra não travar o campo com um
    // placeholder que impediria uma atualização melhor no futuro.)
    function isCampoVazio(campo, valor) {
        const texto = normalize(valor);

        if (campo === "Projeto") {
            return isBlankGeral(valor) || texto === "sem projeto";
        }

        if (campo === "Agência") {
            return isBlankGeral(valor) || texto === "sem agencia";
        }

        if (campo === "Agente") {
            return (
                isBlankGeral(valor) ||
                texto === "sem agente" ||
                texto === "sem correspondencia" ||
                texto === "nao localizado"
            );
        }

        if (campo === "Cultura") {
            return (
                isBlankGeral(valor) ||
                texto === "sem correspondencia" ||
                texto === "nao localizado"
            );
        }

        if (campo === "Telefone") {
            return (
                isBlankGeral(valor) ||
                texto === "sem correspondencia"
            );
        }

        // "Valor Total" vira 0 (número) na Fase 02 quando não informado
        // (parseValorNumerico trata blank/N/INF como 0) — então 0 aqui
        // também conta como vazio, senão um "0" desse tipo sobrescreve um
        // Valor Total legitimamente vazio no Histórico.
        if (campo === "Valor Total") {
            if (isBlankGeral(valor)) return true;

            const numero = typeof valor === "number"
                ? valor
                : parseFloat(String(valor).replace(/\./g, "").replace(",", "."));

            return numero === 0;
        }

        return isBlankGeral(valor);
    }

    function normalizarParcela(valor) {
        const texto = String(valor ?? "").trim();
        const numero = Number(texto.replace(",", "."));
        return Number.isFinite(numero) ? numero : texto.toLowerCase();
    }

    async function readExcel(file) {
        const { data } =
            await window.ISA_XLSX_WORKER.parseWorkbook(file, {
                xlsxOptions: { type: "array", cellDates: true },
                sheetToJsonOptions: { defval: "" }
            });

        // Limpa espaços (inclusive \u00A0) no início/fim e duplicados nos
        // nomes das colunas — ex: " Valor Total " / "Agente\u00A0" —, senão
        // o acesso por linha["Valor Total"] retorna undefined e a coluna
        // sai em branco no arquivo gerado.
        return (data || []).map((linha) => {
            const limpa = {};

            Object.keys(linha).forEach((chave) => {
                const chaveLimpa = String(chave)
                    .replace(/\u00A0/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();

                if (!(chaveLimpa in limpa)) {
                    limpa[chaveLimpa] = linha[chave];
                }
            });

            return limpa;
        });
    }

    // Indexa o Histórico por Proposta e por Apólice (normalizados),
    // pra localizar rápido todos os candidatos de um mesmo contrato.
    function construirIndices(historico) {
        const porProposta = new Map();
        const porApolice = new Map();

        historico.forEach((linha) => {
            if (!isBlankGeral(linha["Proposta"])) {
                const chave = normalize(linha["Proposta"]);

                if (!porProposta.has(chave)) {
                    porProposta.set(chave, []);
                }

                porProposta.get(chave).push(linha);
            }

            if (!isBlankGeral(linha["Numero Apolice"])) {
                const chave = normalize(linha["Numero Apolice"]);

                if (!porApolice.has(chave)) {
                    porApolice.set(chave, []);
                }

                porApolice.get(chave).push(linha);
            }
        });

        return { porProposta, porApolice };
    }

    // Todos os registros do Histórico que compartilham a Proposta OU
    // a Apólice da linha do Consolidado (sem duplicar o mesmo objeto).
    function localizarCandidatos(linhaConsolidado, indices) {
        const candidatos = new Set();

        if (!isBlankGeral(linhaConsolidado["Proposta"])) {
            const chave = normalize(linhaConsolidado["Proposta"]);

            (indices.porProposta.get(chave) || []).forEach((linha) => {
                candidatos.add(linha);
            });
        }

        if (!isBlankGeral(linhaConsolidado["Numero Apolice"])) {
            const chave = normalize(linhaConsolidado["Numero Apolice"]);

            (indices.porApolice.get(chave) || []).forEach((linha) => {
                candidatos.add(linha);
            });
        }

        return [...candidatos];
    }

    // Atualiza, campo a campo, só o que estiver vazio no Histórico.
    // Devolve a lista de alterações (campo/antes/depois) feitas na linha.
    function atualizarCamposVazios(linhaHistorico, linhaConsolidado) {
        const alteracoes = [];

        CAMPOS_ENRIQUECER.forEach((campo) => {
            const valorHistorico = linhaHistorico[campo];
            const valorConsolidado = linhaConsolidado[campo];

            if (!isCampoVazio(campo, valorHistorico)) return;
            if (isCampoVazio(campo, valorConsolidado)) return;

            alteracoes.push({
                campo,
                antes: valorHistorico,
                depois: valorConsolidado
            });

            linhaHistorico[campo] = valorConsolidado;
        });

        return alteracoes;
    }

    function processar(consolidado, historico) {
        const indices = construirIndices(historico);

        let cadastrados = 0;
        let atualizados = 0;
        let ignorados = 0;
        const registrosAtualizados = [];

        consolidado.forEach((linhaConsolidado) => {
            const candidatos = localizarCandidatos(
                linhaConsolidado,
                indices
            );

            if (candidatos.length === 0) {
                historico.push({ ...linhaConsolidado });
                cadastrados++;
                return;
            }

            const parcelaConsolidado = normalizarParcela(
                linhaConsolidado["Numero Parcela"]
            );

            const registroMesmaParcela = candidatos.find((linha) => {
                return (
                    normalizarParcela(linha["Numero Parcela"]) ===
                    parcelaConsolidado
                );
            });

            if (!registroMesmaParcela) {
                historico.push({ ...linhaConsolidado });
                cadastrados++;
                return;
            }

            const alteracoes = atualizarCamposVazios(
                registroMesmaParcela,
                linhaConsolidado
            );

            if (alteracoes.length) {
                atualizados++;

                registrosAtualizados.push({
                    identificador:
                        registroMesmaParcela["Numero Apolice"] ||
                        registroMesmaParcela["Proposta"] ||
                        "",
                    tomador: registroMesmaParcela["Tomador"] || "",
                    alteracoes
                });
            } else {
                ignorados++;
            }
        });

        return {
            historico,
            cadastrados,
            atualizados,
            ignorados,
            registrosAtualizados
        };
    }

    // Monta o painel de resultado (#historico-preview) só com os totais.
    function renderResultado(resultado) {
        const preview = document.getElementById("historico-preview");
        if (!preview) return;

        const statCadastrados = document.getElementById("historico-stat-cadastrados");
        const statAtualizados = document.getElementById("historico-stat-atualizados");
        const statIgnorados = document.getElementById("historico-stat-ignorados");

        if (statCadastrados) statCadastrados.textContent = resultado.cadastrados;
        if (statAtualizados) statAtualizados.textContent = resultado.atualizados;
        if (statIgnorados) statIgnorados.textContent = resultado.ignorados;

        preview.hidden = false;
    }

    async function runAtualizarHistorico() {
        const cards = document.querySelectorAll(
            "#view-historico .card"
        );

        let consolidadoFile = null;
        let historicoFile = null;

        cards.forEach((card) => {
            const input = card.querySelector("[data-input]");

            if (!input || !input.files.length) return;

            if (card.dataset.company === "consolidado-h") {
                consolidadoFile = input.files[0];
            }

            if (card.dataset.company === "historico-h") {
                historicoFile = input.files[0];
            }
        });

        if (!consolidadoFile || !historicoFile) {
            window.ISA_UI.showErrorModal(
                "Selecione o Consolidado Agro e o Histórico Agro.",
                []
            );

            return;
        }

        window.ISA_UI.showLoading("Atualizando histórico...");

        await new Promise((resolve) => setTimeout(resolve, 50));

        try {
            const consolidado = await readExcel(consolidadoFile);
            const historico = await readExcel(historicoFile);

            const resultado = processar(consolidado, historico);

            const linhasHistorico = resultado.historico.map((linha) => {
                const nova = {};

                COLUNAS_HISTORICO.forEach((coluna) => {
                    nova[coluna] = linha[coluna];
                });

                return nova;
            });

            const worksheet = XLSX.utils.json_to_sheet(
                linhasHistorico,
                { header: [...COLUNAS_HISTORICO] }
            );

            const workbook = XLSX.utils.book_new();

            XLSX.utils.book_append_sheet(
                workbook,
                worksheet,
                "Historico Agro"
            );

            XLSX.writeFile(workbook, "Historico Agro.xlsx");

            renderResultado(resultado);

            console.log(
                `Histórico atualizado — novos: ${resultado.cadastrados}, ` +
                `atualizados: ${resultado.atualizados}, ` +
                `ignorados: ${resultado.ignorados}`
            );
        } catch (error) {
            console.error("Erro ao atualizar histórico:", error);

            window.ISA_UI.showErrorModal(
                "Ocorreu um erro ao atualizar o histórico.",
                [error.message]
            );
        } finally {
            window.ISA_UI.hideLoading();
        }
    }

    window.ISA_HISTORICO = { runAtualizarHistorico };
})();