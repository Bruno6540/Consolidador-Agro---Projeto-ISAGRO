/*
  dashboard.js
  Fase 04 — Dashboard / Visão geral + comparação entre execuções.
 
  Lê um Consolidado Agro já processado (mesmas colunas do arquivo gerado
  na Fase 01) e monta um resumo visual (Status, Aging, valor por
  seguradora, top corretores). A comparação com a execução anterior é
  manual: o usuário decide quando "Salvar esta execução" (fica guardada
  neste navegador, localStorage) e pode "Remover" o relatório salvo a
  qualquer momento — útil na fase de testes, pra não acumular comparações
  indesejadas a cada arquivo novo enviado.
 
  Só é guardada 1 execução por vez (a última salva manualmente). A
  comparação é sempre "execução atual" vs "execução salva", sem tentar
  achar a mais próxima de X dias atrás.
*/

(() => {
    "use strict";

    const { NINF, isBlank, CONSOLIDADO_COLUMNS } = window.ISA_RULES;

    const STORAGE_KEY = "isaAgroDashboardSnapshot";

    /* ================= RELATÓRIOS POR AGENTE (aba DINÂMICA + 4 abas) ================= */

    const FORMATO_MOEDA =
        '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';

    const COLUNAS_RELATORIO_AGENTE = CONSOLIDADO_COLUMNS.filter(
        (coluna) =>
            coluna !== "origem Busca" &&
            coluna !== "Chave para Localização"
    );

    const COLUNAS_ABA_AGENTE = [
        "Proposta",
        "Numero Apolice",
        "PRODUTO",
        "SEGURADORA",
        "SEGURADO",
        "Cultura",
        "Numero Parcela",
        "Valor Total",
        "Data Vencimento",
        "_Análises de dia de vencimento",
        "_Status",
        "Meio Pagamento",
        "Agente",
        "Filial",
        "Grupo de Produção",
        "Projeto",
        "Agência",
        "_Tipo Documento",
        "Endosso",
        "Inicio de Vigência",
        "Final de Vigência",
        "Telefone"
    ];

    const COLUNA_ATUALIZAR_STATUS = "Observações MDS Tovese";

    const NOME_ABA_DINAMICA = "DINÂMICA";
    const NOME_ABA_CONSOLIDADO = "CONSOLIDADO AGRO";
    const NOME_ABA_A_VENCER = "A VENCER";
    const NOME_ABA_VENCIDO = "VENCIDO";

    const CORES = {
        brand: "34908B",
        brandDark: "17375E",
        error: "B4432E",
        bgAlt: "E9F7F3",
        ink: "16302C",
        branco: "FFFFFF",
        valorTotalKpi: "7992B1"
    };

    const BORDA_FINA = { style: "thin", color: { rgb: "000000" } };

    function combinarEstilo(base, extra) {
        return Object.assign({}, base || {}, extra);
    }

    function bordaTabela() {
        return {
            top: BORDA_FINA,
            bottom: BORDA_FINA,
            left: BORDA_FINA,
            right: BORDA_FINA
        };
    }

    const ESTILO_BANNER_TITULO = {
        fill: { patternType: "solid", fgColor: { rgb: CORES.brandDark } },
        font: { color: { rgb: CORES.branco }, bold: true, sz: 16 },
        alignment: { horizontal: "left", vertical: "center" }
    };

    const ESTILO_BANNER_SUBTITULO = {
        fill: { patternType: "solid", fgColor: { rgb: CORES.brandDark } },
        font: { color: { rgb: CORES.branco }, sz: 10 },
        alignment: { horizontal: "left", vertical: "center" }
    };

    const ESTILO_TITULO_PAINEL = {
        font: { bold: true, sz: 13, color: { rgb: CORES.ink } }
    };

    const ESTILO_CABECALHO_TABELA = {
        fill: { patternType: "solid", fgColor: { rgb: CORES.brand } },
        font: { color: { rgb: CORES.branco }, bold: true, sz: 10 },
        alignment: { horizontal: "center", vertical: "center" }
    };

    const ESTILO_LINHA_PAR = {
        fill: { patternType: "solid", fgColor: { rgb: CORES.bgAlt } }
    };

    const ESTILO_CABECALHO_ABA_DADOS = {
        fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } },
        font: { color: { rgb: "000000" }, bold: true, sz: 10 },
        alignment: { horizontal: "center", vertical: "center" }
    };

    const ESTILO_CABECALHO_ABA_EXTRA = {
        fill: { patternType: "solid", fgColor: { rgb: "C00000" } },
        font: { color: { rgb: "FFFFFF" }, bold: true, sz: 10 },
        alignment: { horizontal: "center", vertical: "center" }
    };

    function estiloKpi(corFundo) {
        return {
            label: {
                fill: { patternType: "solid", fgColor: { rgb: corFundo } },
                font: { color: { rgb: CORES.branco }, bold: true, sz: 10 },
                alignment: { horizontal: "center", vertical: "center" }
            },
            valor: {
                fill: { patternType: "solid", fgColor: { rgb: corFundo } },
                font: { color: { rgb: CORES.branco }, bold: true, sz: 14 },
                alignment: { horizontal: "center", vertical: "center" }
            }
        };
    }

    function agentesDisponiveis(linhas) {
        const set = new Set();

        (linhas || []).forEach((linha) => {
            const valor = String(linha["Agente"] ?? "").trim();
            if (!isBlank(valor)) set.add(valor);
        });

        return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
    }

    // campos: 1+ nomes de coluna que formam a chave da linha (ex: ["_Origem","_Status"]).
    function agruparValorSimples(linhas, campos) {
        const mapa = new Map();

        linhas.forEach((linha) => {
            const chave = campos
                .map((campo) => (isBlank(linha[campo]) ? NINF : String(linha[campo]).trim()))
                .join(" » ");

            const valor = parseValorNumerico(linha["Valor Total"]);
            mapa.set(chave, (mapa.get(chave) || 0) + valor);
        });

        return [...mapa.entries()].sort((a, b) => b[1] - a[1]);
    }

    // Igual a agruparValorSimples, mas devolvendo o total quebrado por _Status
    // (usado nas tabelas em formato de matriz: linha x A Vencer/Vencido/Total).
    function agruparComStatusMatriz(linhas, campos) {
        const mapa = new Map();

        linhas.forEach((linha) => {
            const chave = campos
                .map((campo) => (isBlank(linha[campo]) ? NINF : String(linha[campo]).trim()))
                .join(" » ");

            const status = linha["_Status"];
            const valor = parseValorNumerico(linha["Valor Total"]);

            const atual = mapa.get(chave) || { total: 0, aVencer: 0, vencido: 0 };
            atual.total += valor;

            if (status === "A Vencer") atual.aVencer += valor;
            else if (status === "Vencido") atual.vencido += valor;

            mapa.set(chave, atual);
        });

        return [...mapa.entries()].sort((a, b) => b[1].total - a[1].total);
    }

    function seguradorasRecebidas(linhas) {
        const set = new Set();

        linhas.forEach((linha) => {
            if (!isBlank(linha["SEGURADORA"])) {
                set.add(String(linha["SEGURADORA"]).trim());
            }
        });

        return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
    }

    function escreverCelula(worksheet, linha, coluna, valor, estilo, formato) {
        const ref = XLSX.utils.encode_cell({ r: linha, c: coluna });
        const ehNumero = typeof valor === "number";

        const celula = { t: ehNumero ? "n" : "s", v: valor };

        if (estilo) celula.s = estilo;
        if (formato) celula.z = formato;

        worksheet[ref] = celula;
    }

    function mesclar(worksheet, linhaIni, colIni, linhaFim, colFim) {
        worksheet["!merges"] = worksheet["!merges"] || [];

        worksheet["!merges"].push({
            s: { r: linhaIni, c: colIni },
            e: { r: linhaFim, c: colFim }
        });
    }

    // Escreve um bloco (título opcional + cabeçalho + linhas) a partir de
    // { linha, coluna }. Devolve a próxima linha livre logo abaixo do bloco.
    // O bloco recebe contorno fechado (topo/base/laterais) + divisórias
    // verticais entre todas as colunas, sem linhas horizontais entre as
    // linhas de dados — simulando o efeito de "Formatar como Tabela".
    function escreverTabela(worksheet, { linha, coluna, titulo, colunas, linhas, comMoeda = [] }) {
        let linhaAtual = linha;
        const ultimaColuna = coluna + colunas.length - 1;

        if (titulo) {
            for (let c = coluna; c <= ultimaColuna; c++) {
                const estilo = combinarEstilo(
                    c === coluna ? ESTILO_TITULO_PAINEL : null,
                    { border: bordaTabela(true, true) }
                );
                escreverCelula(worksheet, linhaAtual, c, c === coluna ? titulo : "", estilo);
            }
            linhaAtual++;
        }

        const topoNoCabecalho = !titulo;
        colunas.forEach((nomeColuna, indice) => {
            const estilo = combinarEstilo(ESTILO_CABECALHO_TABELA, { border: bordaTabela(topoNoCabecalho, true) });
            escreverCelula(worksheet, linhaAtual, coluna + indice, nomeColuna, estilo);
        });
        linhaAtual++;

        linhas.forEach((valoresLinha, indiceLinha) => {
            const estiloFundo = indiceLinha % 2 === 1 ? ESTILO_LINHA_PAR : null;
            const ehUltimaLinha = indiceLinha === linhas.length - 1;

            valoresLinha.forEach((valor, indiceColuna) => {
                const estilo = combinarEstilo(estiloFundo, { border: bordaTabela(false, ehUltimaLinha) });

                escreverCelula(
                    worksheet,
                    linhaAtual,
                    coluna + indiceColuna,
                    valor,
                    estilo,
                    comMoeda.includes(indiceColuna) ? FORMATO_MOEDA : undefined
                );
            });

            linhaAtual++;
        });

        return linhaAtual;
    }

    function construirAbaDinamica(linhas, tituloRelatorio) {
        const worksheet = {};

        const valorTotal = linhas.reduce(
            (soma, linha) => soma + parseValorNumerico(linha["Valor Total"]),
            0
        );

        const totaisPorStatus = somarTotaisPorStatus(linhas);

        escreverCelula(worksheet, 0, 0, `Relatório Semanal Agro — ${tituloRelatorio}`, ESTILO_BANNER_TITULO);
        mesclar(worksheet, 0, 0, 0, 9);

        const dataGeracao = new Date().toLocaleDateString("pt-BR", {
            day: "2-digit", month: "2-digit", year: "numeric"
        });

        escreverCelula(
            worksheet, 1, 0,
            `Gerado em ${dataGeracao} — ${linhas.length} registro${linhas.length === 1 ? "" : "s"}`,
            ESTILO_BANNER_SUBTITULO
        );
        mesclar(worksheet, 1, 0, 1, 9);

        const kpis = [
            { coluna: 0, rotulo: "VALOR TOTAL", valor: valorTotal, cor: CORES.valorTotalKpi },
            { coluna: 3, rotulo: "TOTAL VENCIDO", valor: totaisPorStatus.Vencido, cor: CORES.error },
            { coluna: 6, rotulo: "TOTAL A VENCER", valor: totaisPorStatus["A Vencer"], cor: CORES.brand }
        ];

        kpis.forEach(({ coluna, rotulo, valor, cor }) => {
            const estilos = estiloKpi(cor);

            const bordaKpi = { border: bordaTabela() };

            for (let c = coluna; c <= coluna + 2; c++) {
                escreverCelula(worksheet, 3, c, c === coluna ? rotulo : "", combinarEstilo(estilos.label, bordaKpi));
                escreverCelula(worksheet, 4, c, c === coluna ? valor : "", combinarEstilo(estilos.valor, bordaKpi), c === coluna ? FORMATO_MOEDA : undefined);
            }

            mesclar(worksheet, 3, coluna, 3, coluna + 2);
            mesclar(worksheet, 4, coluna, 4, coluna + 2);
        });

        let proximaLinha = 6;

        const painel1 = agruparValorSimples(linhas, ["_Status"]);
        const totalPainel1 = painel1.reduce((soma, [, valor]) => soma + valor, 0);

        const fimPainel1 = escreverTabela(worksheet, {
            linha: proximaLinha,
            coluna: 0,
            titulo: "Status das Parcelas de Agro",
            colunas: ["Status", "Soma de Valor Total"],
            linhas: [...painel1.map(([status, valor]) => [status, valor]), ["Total Geral", totalPainel1]],
            comMoeda: [1]
        });

        const painel4 = agruparValorSimples(linhas, ["Filial"]);
        const fimPainel4 = escreverTabela(worksheet, {
            linha: proximaLinha,
            coluna: 3,
            titulo: "Parcelas Por Filial",
            colunas: ["Filial", "Soma de Valor Total"],
            linhas: painel4.map(([filial, valor]) => [filial, valor]),
            comMoeda: [1]
        });

        proximaLinha = Math.max(fimPainel1, fimPainel4) + 2;

        const painel3 = agruparComStatusMatriz(linhas, ["SEGURADORA"]);
        proximaLinha = escreverTabela(worksheet, {
            linha: proximaLinha,
            coluna: 0,
            titulo: "Parcelas Por Status e Seguradoras",
            colunas: ["Seguradora", "A Vencer", "Vencido", "Total"],
            linhas: painel3.map(([seguradora, valores]) => [
                seguradora, valores.aVencer, valores.vencido, valores.total
            ]),
            comMoeda: [1, 2, 3]
        }) + 2;

        const painel5 = seguradorasRecebidas(linhas);
        proximaLinha = escreverTabela(worksheet, {
            linha: proximaLinha,
            coluna: 0,
            titulo: "Seguradoras Recebidas",
            colunas: ["Seguradora"],
            linhas: painel5.map((seguradora) => [seguradora]),
            comMoeda: []
        }) + 2;

        const painel6 = agruparComStatusMatriz(linhas, ["Projeto"]);
        proximaLinha = escreverTabela(worksheet, {
            linha: proximaLinha,
            coluna: 0,
            titulo: "Status de parcelas A vencer e vencidas por Projeto",
            colunas: ["Projeto", "A Vencer", "Vencido", "Total"],
            linhas: painel6.map(([chave, valores]) => [
                chave, valores.aVencer, valores.vencido, valores.total
            ]),
            comMoeda: [1, 2, 3]
        });

        // Esconde as linhas de grade: pinta de branco toda a área da aba
        // (a biblioteca não grava a opção "ocultar linhas de grade").
        const ultimaLinhaFundo = proximaLinha + 60;
        const ultimaColunaFundo = 29;

        for (let r = 0; r <= ultimaLinhaFundo; r++) {
            for (let c = 0; c <= ultimaColunaFundo; c++) {
                const ref = XLSX.utils.encode_cell({ r, c });

                if (!worksheet[ref]) {
                    worksheet[ref] = { t: "s", v: "" };
                }

                const estilo = Object.assign({}, worksheet[ref].s);

                if (!estilo.fill) {
                    estilo.fill = { patternType: "solid", fgColor: { rgb: CORES.branco } };
                }

                worksheet[ref].s = estilo;
            }
        }

        worksheet["!ref"] = XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: ultimaLinhaFundo, c: ultimaColunaFundo }
        });

        worksheet["!cols"] = [
            { wch: 42 }, { wch: 18 }, { wch: 18 }, { wch: 42 },
            { wch: 18 }, { wch: 18 }, { wch: 30 }, { wch: 18 },
            { wch: 18 }, { wch: 18 }
        ];

        return worksheet;
    }

    function aplicarFormatoMonetarioGenerico(worksheet, colunas, totalLinhas) {
        const indice = colunas.indexOf("Valor Total");
        if (indice < 0) return;

        const letra = XLSX.utils.encode_col(indice);

        for (let linha = 2; linha <= totalLinhas + 1; linha++) {
            const ref = `${letra}${linha}`;
            const celula = worksheet[ref];

            if (celula && celula.t === "n") {
                celula.z = FORMATO_MOEDA;
            }
        }
    }

    function construirAbaDados(linhas, comColunaAtualizarStatus) {
        const colunas = comColunaAtualizarStatus
            ? [...COLUNAS_ABA_AGENTE, COLUNA_ATUALIZAR_STATUS]
            : [...COLUNAS_ABA_AGENTE];

        const linhasFormatadas = linhas.map((linha) => {
            const nova = {};

            COLUNAS_ABA_AGENTE.forEach((coluna) => {
                nova[coluna] = linha[coluna];
            });

            if (comColunaAtualizarStatus) {
                nova[COLUNA_ATUALIZAR_STATUS] = "";
            }

            return nova;
        });

        const worksheet = XLSX.utils.json_to_sheet(linhasFormatadas, { header: [...colunas] });

        aplicarFormatoMonetarioGenerico(worksheet, colunas, linhasFormatadas.length);

        colunas.forEach((nomeColuna, indice) => {
            const ref = XLSX.utils.encode_cell({ r: 0, c: indice });
            if (worksheet[ref]) {
                worksheet[ref].s = nomeColuna === COLUNA_ATUALIZAR_STATUS
                    ? ESTILO_CABECALHO_ABA_EXTRA
                    : ESTILO_CABECALHO_ABA_DADOS;
            }
        });

        worksheet["!cols"] = colunas.map((nomeColuna) => {
            if (nomeColuna === "Valor Total") return { wch: 18 };

            if (["SEGURADORA", "Corretor", "Tomador", "SEGURADO"].includes(nomeColuna)) {
                return { wch: 42 };
            }

            return { wch: 20 };
        });

        return worksheet;
    }

    // Fonte Aptos Narrow 11 + alinhamento centralizado em todas as células
    // do relatório (preserva cor, negrito, preenchimento, borda e formato).
    function padronizarFonteEAlinhamento(worksheet) {
        Object.keys(worksheet).forEach((ref) => {
            if (ref.charAt(0) === "!") return;

            const celula = worksheet[ref];
            const estilo = Object.assign({}, celula.s);

            const ehTitulo =
                estilo.font === ESTILO_TITULO_PAINEL.font ||
                estilo.font === ESTILO_BANNER_TITULO.font;

            estilo.font = Object.assign({}, estilo.font, {
                name: "Aptos Narrow",
                sz: ehTitulo ? estilo.font.sz : 11
            });
            estilo.alignment = Object.assign({}, estilo.alignment, {
                horizontal: "center",
                vertical: "center"
            });

            celula.s = estilo;
        });

        return worksheet;
    }

    // Ajusta a largura de cada coluna ao maior conteúdo (cabeçalho incluso).
    // Células mescladas (banners e KPIs da DINÂMICA) ficam de fora do cálculo.
    function ajustarLarguraColunas(worksheet) {
        const ancorasMescladas = new Set(
            (worksheet["!merges"] || []).map((m) => XLSX.utils.encode_cell(m.s))
        );

        const larguras = [];

        Object.keys(worksheet).forEach((ref) => {
            if (ref.charAt(0) === "!" || ancorasMescladas.has(ref)) return;

            const celula = worksheet[ref];
            if (celula.v === undefined || celula.v === null || celula.v === "") return;

            let texto;

            if (typeof celula.v === "number") {
                texto = celula.v.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });

                if (celula.z) texto = `R$ ${texto}`;
            } else {
                texto = String(celula.v);
            }

            const coluna = XLSX.utils.decode_cell(ref).c;
            const tamanho = texto.length + (celula.z ? 4 : 3);

            larguras[coluna] = Math.max(larguras[coluna] || 0, tamanho);
        });

        const ultimaColuna = XLSX.utils.decode_range(worksheet["!ref"]).e.c;
        const cols = [];

        for (let c = 0; c <= ultimaColuna; c++) {
            cols.push({ wch: Math.max(larguras[c] || 0, 12) });
        }

        worksheet["!cols"] = cols;

        return worksheet;
    }

    function finalizarAbaRelatorio(worksheet) {
        return ajustarLarguraColunas(padronizarFonteEAlinhamento(worksheet));
    }

    function gerarRelatorioCompleto(linhas, tituloRelatorio) {
        const workbook = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(workbook, finalizarAbaRelatorio(construirAbaDinamica(linhas, tituloRelatorio)), NOME_ABA_DINAMICA);
        XLSX.utils.book_append_sheet(workbook, finalizarAbaRelatorio(construirAbaDados(linhas, false)), NOME_ABA_CONSOLIDADO);

        const aVencer = linhas.filter((linha) => linha["_Status"] === "A Vencer");
        XLSX.utils.book_append_sheet(workbook, finalizarAbaRelatorio(construirAbaDados(aVencer, false)), NOME_ABA_A_VENCER);

        const vencido = linhas.filter((linha) => linha["_Status"] === "Vencido");
        XLSX.utils.book_append_sheet(workbook, finalizarAbaRelatorio(construirAbaDados(vencido, true)), NOME_ABA_VENCIDO);

        return workbook;
    }

    /*
     * Nome do relatório por agente: [trecho do nome do Agente (normalizado), nome do relatório].
     */
    const NOME_RELATORIO_POR_AGENTE = [
        ["alexandre", "Agente Alexandre"],
        ["ril representacoes", "Agente Andrey Ril"],
        ["andrey", "Agente Andrey Ril"],
        ["marczewski", "Agente Armando Marczewski"],
        ["bienert", "Agente Carlos Eduardo Bienert"],
        ["assuncao", "Agente Fábio Assunção"],
        ["bellett", "Agente Jean Mark"],
        ["jean mark", "Agente Jean Mark"],
        ["noe felipe", "Agente Noé Felipe"],
        ["miotto", "Agente Rodrigo Miotto"],
        ["barbara magalhaes", "Barbara Magalhaes"],
        ["daniella", "Daniella Gomes Costa"],
        ["graziele", "Graziele da Rosa Rodrigues"],
        ["pbm agrogestao", "Graziele da Rosa Rodrigues"],
        ["kamila", "Kamila Frison Cocco"],
        ["ligia", "Ligia Dornelles"]
    ];

    function nomeRelatorioAgente(agente) {
        const chave = normalize(agente);
        const regra = NOME_RELATORIO_POR_AGENTE.find(([trecho]) => chave.includes(trecho));
        return regra ? regra[1] : agente;
    }

    function popularSelectAgentes(linhas) {
        const select = document.getElementById("dash-agente-select");
        if (!select) return;

        const agentes = agentesDisponiveis(linhas);

        select.innerHTML = `
            <option value="">Selecionar agente</option>
            ${agentes.map((agente) => `<option value="${agente}">${agente}</option>`).join("")}
        `;

        atualizarBotoesRelatorioAgente();
    }

    function atualizarBotoesRelatorioAgente() {
        const select = document.getElementById("dash-agente-select");
        const btnAgente = document.getElementById("dash-btn-baixar-agente");
        const btnGeral = document.getElementById("dash-btn-baixar-geral");

        if (btnAgente) btnAgente.disabled = !select || !select.value;

        const btnZenvia = document.getElementById("dash-btn-baixar-zenvia");
        if (btnZenvia) btnZenvia.disabled = !select || !select.value;

        const btnZenviaTodos = document.getElementById("dash-btn-baixar-zenvia-todos");
        if (btnZenviaTodos) btnZenviaTodos.disabled = !agentesDisponiveis(linhasAtuais).length;
        if (btnGeral) btnGeral.disabled = !linhasAtuais || !linhasAtuais.length;
    }

    function configurarRelatoriosPorAgente() {
        const select = document.getElementById("dash-agente-select");
        const btnAgente = document.getElementById("dash-btn-baixar-agente");
        const btnGeral = document.getElementById("dash-btn-baixar-geral");

        if (select) {
            select.addEventListener("change", atualizarBotoesRelatorioAgente);
        }

        if (btnAgente) {
            btnAgente.addEventListener("click", () => {
                if (!linhasAtuais || !select.value) return;

                const agente = select.value;

                const linhasDoAgente = linhasAtuais.filter(
                    (linha) => normalize(linha["Agente"]) === normalize(agente)
                );

                const nomeRelatorio = nomeRelatorioAgente(agente);

                const workbook = gerarRelatorioCompleto(linhasDoAgente, nomeRelatorio);

                XLSX.writeFile(workbook, `Relatório Semanal Agro – ${nomeRelatorio}.xlsx`, { cellStyles: true });
            });
        }

        if (btnGeral) {
            btnGeral.addEventListener("click", () => {
                if (!linhasAtuais || !linhasAtuais.length) return;

                const workbook = gerarRelatorioCompleto(linhasAtuais, "Consolidado Geral");

                XLSX.writeFile(workbook, "Relatório Semanal Agro - Consolidado Geral.xlsx", { cellStyles: true });
            });
        }
    }

    /* ================= ZENVIA (CSV por agente) ================= */

    const SEM_CORRESPONDENCIA = "Sem Correspondencia";

    const COLUNAS_ZENVIA = [
        "Telefone",
        "Nome",
        "Número da Parcela",
        "Valor",
        "Número da proposta",
        "Nome seguradora",
        "Data de vencimento"
    ];

    function textoZenvia(valor) {
        return isBlank(valor) || normalize(valor) === "sem correspondencia"
            ? SEM_CORRESPONDENCIA
            : String(valor).trim();
    }

    function telefonesZenvia(valor) {
        if (isBlank(valor) || normalize(valor) === "sem correspondencia") {
            return [SEM_CORRESPONDENCIA];
        }

        const lista = [...new Set(
            String(valor)
                .split(/[\/;,|\r\n]+/)
                .map((telefone) => telefone.replace(/\D/g, ""))
                .filter((telefone) => telefone)
        )];

        return lista.length ? lista : [SEM_CORRESPONDENCIA];
    }

    function propostaZenvia(linha) {
        if (!isBlank(linha["Proposta"]) && normalize(linha["Proposta"]) !== "sem correspondencia") {
            return String(linha["Proposta"]).trim();
        }

        return textoZenvia(linha["Numero Apolice"]);
    }

    function valorZenvia(valor) {
        if (isBlank(valor)) return SEM_CORRESPONDENCIA;

        return parseValorNumerico(valor).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
            useGrouping: false
        });
    }

    function dataZenvia(linha) {
        const base = chaveData(linha["Data do ultimo vencimento"])
            ? linha["Data do ultimo vencimento"]
            : linha["Data Vencimento"];

        const chave = chaveData(base);
        if (!chave) return SEM_CORRESPONDENCIA;

        const [ano, mes, dia] = chave.split("-");
        return `${dia}/${mes}/${ano}`;
    }

    function campoCsv(valor) {
        const texto = String(valor ?? "");
        return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    }

    function baixarZenvia(linhasDoAgente, nomeRelatorio) {
        const registros = [];

        linhasDoAgente
            .filter((linha) => normalize(linha["_Status"]) === "a vencer")
            .forEach((linha) => {
            telefonesZenvia(linha["Telefone"]).forEach((telefone) => {
                registros.push([
                    telefone,
                    textoZenvia(linha["SEGURADO"]),
                    textoZenvia(linha["Numero Parcela"]),
                    valorZenvia(linha["Valor Total"]),
                    propostaZenvia(linha),
                    textoZenvia(linha["SEGURADORA"]),
                    dataZenvia(linha)
                ]);
            });
        });

        const csv = [COLUNAS_ZENVIA, ...registros]
            .map((registro) => registro.map(campoCsv).join(";"))
            .join("\r\n");

        const hoje = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const dataDia = `${pad(hoje.getDate())}-${pad(hoje.getMonth() + 1)}-${hoje.getFullYear()}`;

        const nomeArquivo = `${dataDia} - Envio Cobrança Tovese ${nomeRelatorio}`
            .replace(/[\\/:*?"<>|]/g, "-") + ".csv";

        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");

        a.href = url;
        a.download = nomeArquivo;
        document.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function configurarZenvia() {
        const select = document.getElementById("dash-agente-select");
        const btnZenvia = document.getElementById("dash-btn-baixar-zenvia");
        const btnZenviaTodos = document.getElementById("dash-btn-baixar-zenvia-todos");

        if (btnZenvia) {
            btnZenvia.addEventListener("click", () => {
                if (!linhasAtuais || !select || !select.value) return;

                const agente = select.value;

                const linhasDoAgente = linhasAtuais.filter(
                    (linha) => normalize(linha["Agente"]) === normalize(agente)
                );

                baixarZenvia(linhasDoAgente, nomeRelatorioAgente(agente));
            });
        }

        if (btnZenviaTodos) {
            btnZenviaTodos.addEventListener("click", () => {
                if (!linhasAtuais || !linhasAtuais.length) return;

                const linhasComAgente = linhasAtuais.filter(
                    (linha) => !isBlank(String(linha["Agente"] ?? "").trim())
                );

                baixarZenvia(linhasComAgente, "Todos os Agentes");
            });
        }
    }

    configurarZenvia();

    configurarRelatoriosPorAgente();

    let linhasAtuais = null;
    let fileNameAtual = null;
    let ultimoSumiram = null;

    function normalize(value) {
        return String(value ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase();
    }

    function formatMoney(value) {
        const numero = Number(value);

        if (!Number.isFinite(numero)) {
            return "R$ 0,00";
        }

        return numero.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });
    }

    // Converte "Valor Total" pra número de forma robusta, aceitando tanto
    // número puro (vindo do Excel) quanto texto em formato brasileiro
    // (ex: "R$ 1.234,56", "1234,56").
    function parseValorNumerico(value) {

        if (typeof value === "number") {
            return Number.isFinite(value) ? value : 0;
        }

        if (value === null || value === undefined || value === "") {
            return 0;
        }

        let text = String(value).trim();

        if (!text) {
            return 0;
        }

        let negativo = false;

        if (text.startsWith("(") && text.endsWith(")")) {
            negativo = true;
            text = text.slice(1, -1).trim();
        }

        text = text.replace(/R\$/gi, "");
        text = text.replace(/\u00A0/g, "").replace(/\s/g, "");

        if (text.startsWith("-")) {
            negativo = true;
            text = text.slice(1);
        }

        if (text.includes(".") && text.includes(",")) {
            text = text.replace(/\./g, "").replace(",", ".");
        } else if (text.includes(",")) {
            text = text.replace(",", ".");
        }

        const numero = Number(text);

        if (!Number.isFinite(numero)) {
            return 0;
        }

        return negativo ? -numero : numero;
    }

    // Chave usada pra identificar "o mesmo registro" entre duas execuções.
    function chaveRegistro(linha) {
        const partes = [
            linha["SEGURADORA"],
            linha["Proposta"],
            linha["Numero Apolice"],
            linha["Endosso"],
            linha["Numero Parcela"]
        ].map((parte) => (isBlank(parte) ? "" : normalize(parte)));

        return partes.join("|");
    }

    async function readExcel(file) {
        const buffer = await file.arrayBuffer();

        const workbook = XLSX.read(buffer, {
            type: "array",
            cellDates: true
        });

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const linhas = XLSX.utils.sheet_to_json(sheet, {
            defval: "",
            raw: true
        });

        return linhas.map((linha) => {
            const limpa = {};
            Object.keys(linha).forEach((chave) => {
                const chaveLimpa = String(chave).replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
                limpa[chaveLimpa] = linha[chave];
            });
            return limpa;
        });
    }

    /* ================= VISÃO GERAL ================= */

    function somarPorCampoEStatus(linhas, campo) {
        const soma = new Map();

        linhas.forEach((linha) => {
            const chave = isBlank(linha[campo])
                ? NINF
                : String(linha[campo]).trim();

            const status = linha["_Status"];
            const valor = parseValorNumerico(linha["Valor Total"]);

            const atual = soma.get(chave) || { total: 0, aVencer: 0, vencido: 0 };

            atual.total += valor;

            if (status === "A Vencer") {
                atual.aVencer += valor;
            } else if (status === "Vencido") {
                atual.vencido += valor;
            }

            soma.set(chave, atual);
        });

        return soma;
    }

    function agingComValor(linhas) {
        const mapa = new Map();

        linhas.forEach((linha) => {
            const aging = isBlank(linha["_Aging"])
                ? NINF
                : String(linha["_Aging"]).trim();

            const valor = parseValorNumerico(linha["Valor Total"]);
            const atual = mapa.get(aging) || { registros: 0, valor: 0 };

            atual.registros += 1;
            atual.valor += valor;

            mapa.set(aging, atual);
        });

        return mapa;
    }

    function statusComValor(linhas) {
        const mapa = new Map();

        linhas.forEach((linha) => {
            const status = isBlank(linha["_Status"])
                ? NINF
                : String(linha["_Status"]).trim();

            const valor = parseValorNumerico(linha["Valor Total"]);
            const atual = mapa.get(status) || { registros: 0, valor: 0 };

            atual.registros += 1;
            atual.valor += valor;

            mapa.set(status, atual);
        });

        return mapa;
    }

    function somarTotaisPorStatus(linhas) {
        const totais = { Vencido: 0, "A Vencer": 0 };

        linhas.forEach((linha) => {
            const status = linha["_Status"];
            const valor = parseValorNumerico(linha["Valor Total"]);

            if (status === "Vencido") {
                totais.Vencido += valor;
            } else if (status === "A Vencer") {
                totais["A Vencer"] += valor;
            }
        });

        return totais;
    }

    function topCorretores(linhas, limite = 8) {
        const porCorretor = new Map();

        linhas.forEach((linha) => {
            const corretor = isBlank(linha["Corretor"])
                ? NINF
                : String(linha["Corretor"]).trim();

            const status = linha["_Status"];
            const valor = parseValorNumerico(linha["Valor Total"]);

            const atual = porCorretor.get(corretor) || {
                registros: 0,
                valor: 0,
                aVencer: 0,
                vencido: 0
            };

            atual.registros += 1;
            atual.valor += valor;

            if (status === "A Vencer") {
                atual.aVencer += valor;
            } else if (status === "Vencido") {
                atual.vencido += valor;
            }

            porCorretor.set(corretor, atual);
        });

        return [...porCorretor.entries()]
            .sort((a, b) => b[1].valor - a[1].valor)
            .slice(0, limite);
    }

    function agruparPorSeguradora(linhas) {
        const mapa = new Map();

        linhas.forEach((linha) => {
            const seguradora = isBlank(linha["SEGURADORA"])
                ? NINF
                : String(linha["SEGURADORA"]).trim();

            const valor = parseValorNumerico(linha["Valor Total"]);
            const atual = mapa.get(seguradora) || { registros: 0, valor: 0 };

            atual.registros += 1;
            atual.valor += valor;

            mapa.set(seguradora, atual);
        });

        return [...mapa.entries()].sort((a, b) => b[1].valor - a[1].valor);
    }

    const CORES_STATUS = {
        "Vencido": "var(--error)",
        "A Vencer": "var(--success)",
        [NINF]: "var(--ink-faint)"
    };

    function renderTabela(container, headers, linhas, opcoes = {}) {
        const { mostrarRanking = false, alinharRotulo = "centro" } = opcoes;

        container.innerHTML = "";

        if (!linhas.length) {
            container.innerHTML =
                '<p class="dash-empty-msg">Sem dados para exibir.</p>';

            return;
        }

        const colunasValor = headers.length - 1;

        const tabela = document.createElement("div");
        tabela.className = "dash-table";

        if (alinharRotulo === "esquerda") {
            tabela.classList.add("dash-table--label-left");
        }

        tabela.style.setProperty(
            "--cols",
            `minmax(0,1.6fr) repeat(${colunasValor}, minmax(0,1fr))`
        );

        const head = document.createElement("div");
        head.className = "dash-table__head";

        headers.forEach((texto) => {
            const celula = document.createElement("span");
            celula.textContent = texto;
            head.appendChild(celula);
        });

        tabela.appendChild(head);

        linhas.forEach((linha, indice) => {
            const row = document.createElement("div");
            row.className = "dash-table__row";

            const labelCell = document.createElement("div");
            labelCell.className = "dash-table__label-wrap";

            const rankHTML = mostrarRanking
                ? `<span class="dash-table__rank">${indice + 1}</span>`
                : "";

            labelCell.innerHTML = `
                <span class="dash-table__label-row">
                    ${rankHTML}
                    <span class="dash-table__label" title="${linha.label}">${linha.label}</span>
                </span>
                <span class="dash-table__bar-track">
                    <span class="dash-table__bar-fill" style="width:${linha.percentual}%; background-color:${linha.cor || "var(--brand)"}"></span>
                </span>
            `;

            row.appendChild(labelCell);

            linha.valores.forEach((valor, indiceValor) => {
                const celula = document.createElement("span");
                celula.className = "dash-table__cell";
                celula.setAttribute("data-label", headers[indiceValor + 1]);
                celula.textContent = valor;
                row.appendChild(celula);
            });

            tabela.appendChild(row);
        });

        container.appendChild(tabela);
    }

    function renderVisaoGeral(linhas) {
        const totalRegistrosGeral = Math.max(linhas.length, 1);

        const valorTotalGeral = linhas.reduce((soma, linha) => {
            return soma + parseValorNumerico(linha["Valor Total"]);
        }, 0);

        const baseValorGeral = valorTotalGeral || 1;

        const porStatus = statusComValor(linhas);
        const statusOrdenado = [...porStatus.entries()]
            .sort((a, b) => b[1].valor - a[1].valor);

        renderTabela(
            document.getElementById("dash-status-body"),
            ["Status", "Registros", "Valor"],
            statusOrdenado.map(([rotulo, valor]) => ({
                label: rotulo,
                percentual: (valor.registros / totalRegistrosGeral) * 100,
                valores: [valor.registros, formatMoney(valor.valor)],
                cor: CORES_STATUS[rotulo] || "var(--brand)"
            }))
        );

        const porAging = agingComValor(linhas);
        const agingOrdenado = [...porAging.entries()]
            .sort((a, b) => b[1].valor - a[1].valor);

        renderTabela(
            document.getElementById("dash-aging-body"),
            ["Faixa", "Registros", "Valor"],
            agingOrdenado.map(([rotulo, valor]) => ({
                label: rotulo,
                percentual: (valor.registros / totalRegistrosGeral) * 100,
                valores: [valor.registros, formatMoney(valor.valor)]
            }))
        );

        const valorPorSeguradora = somarPorCampoEStatus(linhas, "SEGURADORA");
        const seguradoraOrdenada = [...valorPorSeguradora.entries()]
            .sort((a, b) => b[1].total - a[1].total);

        renderTabela(
            document.getElementById("dash-seguradora-body"),
            ["Seguradora", "Valor Total", "A Vencer", "Vencido"],
            seguradoraOrdenada.map(([rotulo, valor]) => ({
                label: rotulo,
                percentual: (valor.total / baseValorGeral) * 100,
                valores: [
                    formatMoney(valor.total),
                    formatMoney(valor.aVencer),
                    formatMoney(valor.vencido)
                ]
            })),
            { mostrarRanking: true, alinharRotulo: "esquerda" }
        );

        const corretores = topCorretores(linhas);

        renderTabela(
            document.getElementById("dash-corretores-body"),
            ["Corretor", "Valor Total", "Registros", "A Vencer", "Vencido"],
            corretores.map(([rotulo, valor]) => ({
                label: rotulo,
                percentual: (valor.valor / baseValorGeral) * 100,
                valores: [
                    formatMoney(valor.valor),
                    valor.registros,
                    formatMoney(valor.aVencer),
                    formatMoney(valor.vencido)
                ]
            })),
            { mostrarRanking: true, alinharRotulo: "esquerda" }
        );

        const totaisPorStatus = somarTotaisPorStatus(linhas);

        document.getElementById("dash-total-valor").textContent =
            formatMoney(valorTotalGeral);

        document.getElementById("dash-total-vencido").textContent =
            formatMoney(totaisPorStatus.Vencido);

        document.getElementById("dash-total-a-vencer").textContent =
            formatMoney(totaisPorStatus["A Vencer"]);
    }

    /* ================= COMPARAÇÃO COM A EXECUÇÃO SALVA ================= */

    function calcularDiff(anteriores, atuais) {
        const mapaAnterior = new Map();

        anteriores.forEach((linha) => {
            mapaAnterior.set(chaveRegistro(linha), linha);
        });

        const mapaAtual = new Map();

        atuais.forEach((linha) => {
            mapaAtual.set(chaveRegistro(linha), linha);
        });

        const novos = [];
        let existentes = 0;

        mapaAtual.forEach((linha, chave) => {
            if (mapaAnterior.has(chave)) {
                existentes++;
            } else {
                novos.push(linha);
            }
        });

        const removidos = [];

        mapaAnterior.forEach((linha, chave) => {
            if (!mapaAtual.has(chave)) {
                removidos.push(linha);
            }
        });

        return { novos, removidos, existentes };
    }

    function calcularComparacaoCompleta(anteriores, atuais) {
        const diff = calcularDiff(anteriores, atuais);

        const valorNovos = diff.novos.reduce(
            (soma, linha) => soma + parseValorNumerico(linha["Valor Total"]),
            0
        );

        const valorRemovidos = diff.removidos.reduce(
            (soma, linha) => soma + parseValorNumerico(linha["Valor Total"]),
            0
        );

        const somaPorStatus = (linhas, status) =>
            linhas
                .filter((linha) => linha["_Status"] === status)
                .reduce((soma, linha) => soma + parseValorNumerico(linha["Valor Total"]), 0);

        const removidosVencido = somaPorStatus(diff.removidos, "Vencido");
        const removidosAVencer = somaPorStatus(diff.removidos, "A Vencer");

        const valorTotalAnterior = anteriores.reduce(
            (soma, linha) => soma + parseValorNumerico(linha["Valor Total"]),
            0
        );

        const valorTotalAtual = atuais.reduce(
            (soma, linha) => soma + parseValorNumerico(linha["Valor Total"]),
            0
        );

        return {
            ...diff,
            valorNovos,
            valorRemovidos,
            removidosVencido,
            removidosAVencer,
            valorTotalAnterior,
            valorTotalAtual,
            statusAnterior: somarTotaisPorStatus(anteriores),
            statusAtual: somarTotaisPorStatus(atuais),
            porSeguradoraNovos: agruparPorSeguradora(diff.novos),
            porSeguradoraRemovidos: agruparPorSeguradora(diff.removidos)
        };
    }

    function identificarLinha(linha) {
        const partes = [
            linha["SEGURADORA"],
            linha["Proposta"],
            linha["Numero Apolice"],
            linha["Numero Parcela"]
        ].filter((parte) => !isBlank(parte));

        if (partes.length) {
            return partes.join(" · ");
        }

        return linha["SEGURADO"] || "Registro sem identificação";
    }

    function renderListaSimples(container, linhas, mensagemVazio) {
        container.innerHTML = "";

        if (!linhas.length) {
            container.innerHTML =
                `<p class="dash-empty-msg">${mensagemVazio}</p>`;

            return;
        }

        const lista = document.createElement("ul");
        lista.className = "dash-diff-list";

        linhas.forEach((linha) => {
            const item = document.createElement("li");
            item.textContent = identificarLinha(linha);
            lista.appendChild(item);
        });

        container.appendChild(lista);
    }

    function formatarDataRelatorio(savedAt) {
        return new Date(savedAt).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
    }

    /* ================= DOWNLOAD: CASOS QUE SUMIRAM ================= */

    function aplicarFormatoMonetarioSumiram(worksheet, colunas, totalLinhas) {
        const indiceValorTotal = colunas.indexOf("Valor Total");

        if (indiceValorTotal < 0) return;

        const letraColuna = XLSX.utils.encode_col(indiceValorTotal);

        for (let rowNumber = 2; rowNumber <= totalLinhas + 1; rowNumber++) {
            const cellAddress = `${letraColuna}${rowNumber}`;
            const excelCell = worksheet[cellAddress];

            if (excelCell && excelCell.t === "n") {
                excelCell.z = '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';
            }
        }
    }

    function gerarWorkbookSumiram(rows) {
        const colunas = (CONSOLIDADO_COLUMNS || []).filter(
            (coluna) =>
                coluna !== "origem Busca" &&
                coluna !== "Chave para Localização"
        );

        /*
         * json_to_sheet + header só define a ORDEM das colunas — chaves do
         * objeto que não estejam no header não são removidas, são só
         * jogadas pro final da planilha. Por isso precisa montar as linhas
         * já sem "origem Busca" / "Chave para Localização" antes de gerar.
         */
        const linhasFiltradas = rows.map((linha) => {
            const nova = {};

            colunas.forEach((coluna) => {
                nova[coluna] = linha[coluna];
            });

            return nova;
        });

        const worksheet = XLSX.utils.json_to_sheet(linhasFiltradas, { header: [...colunas] });

        aplicarFormatoMonetarioSumiram(worksheet, colunas, linhasFiltradas.length);

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Não Localizados");

        return workbook;
    }

    function baixarSumiram() {
        if (!ultimoSumiram || !ultimoSumiram.length) return;

        const workbook = gerarWorkbookSumiram(ultimoSumiram);

        XLSX.writeFile(workbook, "Não Localizados Agro.xlsx");
    }

    /* ================= PERSISTÊNCIA LOCAL (1 execução salva por vez) ================= */

    function carregarSnapshot() {
        try {
            const bruto = window.localStorage.getItem(STORAGE_KEY);

            if (!bruto) return null;

            return JSON.parse(bruto);
        } catch (error) {
            console.error("Erro ao ler o relatório salvo:", error);
            return null;
        }
    }

    function salvarSnapshot(linhas, fileName) {
        try {
            window.localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify({ linhas, fileName, savedAt: Date.now() })
            );
        } catch (error) {
            console.error("Não foi possível salvar esta execução:", error);
        }
    }

    function removerSnapshot() {
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch (error) {
            console.error("Não foi possível remover o relatório salvo:", error);
        }
    }

    /* ================= RENDER: BARRA DE SALVAR/REMOVER ================= */

    function renderSnapshotBar(snapshot) {
        const container = document.getElementById("dash-diff-snapshot");
        if (!container) return;

        const infoHTML = snapshot
            ? `
                <span class="dash-diff-snapshot__info">
                    <i class="ri-database-2-line"></i>
                    Relatório salvo: ${formatarDataRelatorio(snapshot.savedAt)} (${snapshot.fileName})
                </span>
                <button type="button" class="dash-diff-snapshot__remove" id="dash-btn-remover-snapshot">
                    <i class="ri-delete-bin-line"></i> Remover
                </button>
            `
            : `
                <span class="dash-diff-snapshot__info dash-diff-snapshot__info--empty">
                    <i class="ri-information-line"></i>
                    Nenhum relatório salvo para comparação ainda.
                </span>
            `;

        container.innerHTML = `
            <div class="dash-diff-snapshot__row">${infoHTML}</div>
            <button type="button" class="dash-diff-snapshot__save" id="dash-btn-salvar-snapshot" ${linhasAtuais ? "" : "disabled"}>
                <i class="ri-save-line"></i> Salvar esta execução para comparação
            </button>
        `;

        const btnSalvar = document.getElementById("dash-btn-salvar-snapshot");
        const btnRemover = document.getElementById("dash-btn-remover-snapshot");

        if (btnSalvar) {
            btnSalvar.addEventListener("click", () => {
                if (!linhasAtuais) return;
                salvarSnapshot(linhasAtuais, fileNameAtual);
                atualizarComparacao();
            });
        }

        if (btnRemover) {
            btnRemover.addEventListener("click", () => {
                removerSnapshot();
                atualizarComparacao();
            });
        }
    }

    /* ================= RENDER: ABA "SEMANA ANTERIOR" ================= */

    function renderPainelAnterior(snapshot) {
        const container = document.getElementById("dash-diff-anterior");
        if (!container) return;

        if (!snapshot) {
            container.innerHTML =
                '<p class="dash-empty-msg">Nenhum relatório salvo ainda. Use "Salvar esta execução para comparação" para guardar a semana atual.</p>';

            return;
        }

        const totais = somarTotaisPorStatus(snapshot.linhas);

        const valorTotal = snapshot.linhas.reduce(
            (soma, linha) => soma + parseValorNumerico(linha["Valor Total"]),
            0
        );

        container.innerHTML = `
            <p class="dash-diff-panel__label">Relatório de ${formatarDataRelatorio(snapshot.savedAt)} (${snapshot.fileName})</p>
            <div class="dash-totals">
                <div class="dash-total">
                    <span>Valor Total</span>
                    <strong>${formatMoney(valorTotal)}</strong>
                </div>
                <div class="dash-total">
                    <span>Vencido</span>
                    <strong>${formatMoney(totais.Vencido)}</strong>
                </div>
                <div class="dash-total">
                    <span>A Vencer</span>
                    <strong>${formatMoney(totais["A Vencer"])}</strong>
                </div>
            </div>
        `;
    }

    /* ================= RENDER: ABA "COMPARAÇÃO" ================= */

    function renderPainelComparacao(snapshot, linhasAtuaisParam) {
        const container = document.getElementById("dash-diff-comparacao");
        if (!container) return;

        esconderPreviewPagos();

        if (!snapshot) {
            container.innerHTML =
                '<p class="dash-empty-msg">Nenhum relatório salvo ainda. Use "Salvar esta execução para comparação" para guardar a semana atual e comparar na próxima.</p>';

            return;
        }

        const comp = calcularComparacaoCompleta(snapshot.linhas, linhasAtuaisParam);

        ultimoSumiram = comp.removidos;

        const variacaoValor = comp.valorTotalAtual - comp.valorTotalAnterior;

        const variacaoPercentual = comp.valorTotalAnterior
            ? (variacaoValor / comp.valorTotalAnterior) * 100
            : 0;

        container.innerHTML = `
            <p class="dash-diff-panel__label">Comparando com ${formatarDataRelatorio(snapshot.savedAt)} (${snapshot.fileName})</p>
 
            <div class="dash-diff-summary">
                <div class="dash-diff-stat">
                    <strong>${comp.novos.length}</strong>
                    <span>Novos (${formatMoney(comp.valorNovos)})</span>
                </div>
                <div class="dash-diff-stat">
                    <strong>${comp.removidos.length}</strong>
                    <span>Não Localizados (${formatMoney(comp.valorRemovidos)})</span>
                </div>
                <div class="dash-diff-stat">
                    <strong>${comp.existentes}</strong>
                    <span>Já existiam</span>
                </div>
                <div class="dash-diff-stat">
                    <strong>${variacaoValor >= 0 ? "+" : ""}${formatMoney(variacaoValor)}</strong>
                    <span>Variação do Valor Total (${variacaoPercentual >= 0 ? "+" : ""}${variacaoPercentual.toFixed(1)}%)</span>
                </div>
            </div>
 
            <div class="dash-grid">
                <div class="dash-panel dash-panel--wide">
                    <h3>Variação por Status</h3>
                    <div class="dash-panel__body" id="dash-comp-status"></div>
                </div>
 
                                <div class="dash-panel dash-panel--wide">
                    <div class="dash-panel__head">
                        <h3>Não Localizados — valor por status anterior</h3>
                        <div class="dash-panel__actions">
                            <button
                                type="button"
                                class="dash-panel__download"
                                id="dash-btn-comparar-pagos"
                                aria-label="Comparar com Pagos"
                                title="Comparar com Pagos"
                                ${comp.removidos.length ? "" : "disabled"}
                            >
                                <i class="ri-search-eye-line"></i>
                            </button>
                            <button
                                type="button"
                                class="dash-panel__download"
                                id="dash-btn-baixar-sumiram"
                                aria-label="Baixar relatório dos casos não localizados"
                                title="Baixar relatório dos casos não localizados"
                                ${comp.removidos.length ? "" : "disabled"}
                            >
                                <i class="ri-file-excel-2-fill"></i>
                            </button>
                        </div>
                    </div>
                    <div class="dash-panel__body" id="dash-comp-sumiram-status"></div>
                </div>
            </div>
        `;

        const btnBaixarSumiram = document.getElementById("dash-btn-baixar-sumiram");

        if (btnBaixarSumiram) {
            btnBaixarSumiram.addEventListener("click", baixarSumiram);
        }

        const btnCompararPagos = document.getElementById("dash-btn-comparar-pagos");

        if (btnCompararPagos) {
            btnCompararPagos.addEventListener("click", abrirModalPagos);
        }

        const statusOrdemBase = ["Vencido", "A Vencer"];

        const somaStatusAtual = Math.max(
            1,
            statusOrdemBase.reduce((soma, s) => soma + comp.statusAtual[s], 0)
        );

        const statusList = [...statusOrdemBase].sort(
            (a, b) => comp.statusAtual[b] - comp.statusAtual[a]
        );

        renderTabela(
            document.getElementById("dash-comp-status"),
            ["Status", "Anterior", "Atual", "Diferença"],
            statusList.map((s) => {
                const diferenca = comp.statusAtual[s] - comp.statusAnterior[s];

                return {
                    label: s,
                    percentual: (comp.statusAtual[s] / somaStatusAtual) * 100,
                    valores: [
                        formatMoney(comp.statusAnterior[s]),
                        formatMoney(comp.statusAtual[s]),
                        `${diferenca >= 0 ? "+" : ""}${formatMoney(diferenca)}`
                    ],
                    cor: CORES_STATUS[s] || "var(--brand)"
                };
            })
        );

        const contarRemovidosPorStatus = (status) =>
            comp.removidos.filter((linha) => linha["_Status"] === status).length;

        const sumiramStatusEntradas = [
            ["Vencido", comp.removidosVencido, contarRemovidosPorStatus("Vencido")],
            ["A Vencer", comp.removidosAVencer, contarRemovidosPorStatus("A Vencer")]
        ].filter(([, valor]) => valor !== 0);

        const totalSumiuStatus = Math.max(
            1,
            comp.removidosVencido +
            comp.removidosAVencer
        );

        renderTabela(
            document.getElementById("dash-comp-sumiram-status"),
            ["Status", "Registros", "Valor"],
            sumiramStatusEntradas.map(([label, valor, registros]) => ({
                label,
                percentual: (Math.abs(valor) / totalSumiuStatus) * 100,
                valores: [registros, formatMoney(valor)],
                cor: CORES_STATUS[label] || "var(--brand)"
            }))
        );
    }

    /* ================= COMPARAR COM PAGOS ================= */

    let arquivosPagos = new Map();
    let companhiaPagosSelecionada = null;
    let modalPagosPausado = false;

    async function readExcelGenerico(file) {
        const { data } = await window.ISA_XLSX_WORKER.parseWorkbook(file, {
            xlsxOptions: { type: "array", cellDates: true },
            sheetToJsonOptions: { defval: "" }
        });

        return data || [];
    }

    const PAGOS_CONFIG = (window.ISA_CONFIG && window.ISA_CONFIG.pagos) || {};

    const COLUNA_STATUS_PAGAMENTO = "Status Pagamento";
    const STATUS_PAGO = "Pago";
    const STATUS_NAO_ENCONTRADO = "Nenhum registro encontrado";

    let ultimoPagos = null;

    function configPagosDaCompanhia(seguradora) {
        const alvo = normalize(seguradora);

        const entrada = Object.entries(window.COMPANY_MAPPINGS || {}).find(
            ([, empresa]) => normalize(empresa.officialName) === alvo
        );

        return entrada ? PAGOS_CONFIG[entrada[0]] || null : null;
    }

    function companhiasSumiram() {
        if (!ultimoSumiram) return [];

        return [...new Set(
            ultimoSumiram
                .map((linha) => linha["SEGURADORA"])
                .filter((valor) => !isBlank(valor))
                .filter((valor) => configPagosDaCompanhia(valor))
        )];
    }

    function textoChave(valor) {
        return isBlank(valor) ? "" : normalize(valor);
    }

    // Apólice/Proposta: ignora zeros à esquerda e ".0" em números
    // (ex: "0123" no consolidado x 123 numérico no relatório de pagos).
    function normalizarIdentificador(valor) {
        if (isBlank(valor)) return "";

        const texto = String(valor).trim().replace(/\.0+$/, "");

        return /^\d+$/.test(texto)
            ? texto.replace(/^0+(?=\d)/, "")
            : normalize(texto);
    }

    // Endosso vazio, N/INF e 0 são equivalentes.
    function normalizarEndosso(valor) {
        if (isBlank(valor)) return "0";

        const numero = Number(String(valor).trim().replace(",", "."));

        return Number.isFinite(numero) ? String(numero) : normalize(valor);
    }

    function normalizarParcela(valor) {
        const texto = String(valor ?? "").trim();
        const numero = Number(texto.replace(",", "."));

        return texto !== "" && Number.isFinite(numero)
            ? String(numero)
            : normalize(texto);
    }

    function chaveData(valor) {
        const pad = (n) => String(n).padStart(2, "0");

        if (valor instanceof Date) {
            return Number.isNaN(valor.getTime())
                ? ""
                : `${valor.getFullYear()}-${pad(valor.getMonth() + 1)}-${pad(valor.getDate())}`;
        }

        if (typeof valor === "number") {
            const data = XLSX.SSF.parse_date_code(valor);
            return data ? `${data.y}-${pad(data.m)}-${pad(data.d)}` : "";
        }

        const texto = String(valor ?? "").trim();

        let m = texto.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);

        if (m) {
            const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
            return `${ano}-${pad(m[2])}-${pad(m[1])}`;
        }

        m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);

        return m ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : "";
    }

    function prepararRelatorioPagos(linhas, config) {
        return linhas.map((linha) => {
            const normalizada = {};

            Object.keys(linha).forEach((chave) => {
                normalizada[normalize(chave)] = linha[chave];
            });

            const valor = (coluna) =>
                coluna ? normalizada[normalize(coluna)] : "";

            return {
                segurado: textoChave(valor(config.segurado)),
                apolice: normalizarIdentificador(valor(config.apolice)),
                proposta: normalizarIdentificador(valor(config.proposta)),
                endosso: normalizarEndosso(valor(config.endosso)),
                parcela: normalizarParcela(valor(config.parcela)),
                vencimentos: (config.vencimentos || [])
                    .map((coluna) => chaveData(valor(coluna)))
                    .filter(Boolean)
            };
        });
    }

    // O relatório só traz pagos: localizar a linha = Pago.
    function localizarPagamento(linha, relatorio, config) {
        const segurado = textoChave(linha["SEGURADO"]);
        const apolice = normalizarIdentificador(linha["Numero Apolice"]);
        const proposta = normalizarIdentificador(linha["Proposta"]);
        const endosso = normalizarEndosso(linha["Endosso"]);
        const parcela = normalizarParcela(linha["Numero Parcela"]);

        const datas = [
            chaveData(linha["Data Vencimento"]),
            chaveData(linha["Data do ultimo vencimento"])
        ].filter(Boolean);

        return relatorio.some((item) => {
            if (!segurado || item.segurado !== segurado) return false;

            if (config.apolice || config.proposta) {
                const bateApolice = !!(config.apolice && apolice && item.apolice === apolice);
                const bateProposta = !!(config.proposta && proposta && item.proposta === proposta);

                if (!bateApolice && !bateProposta) return false;
            }

            if (config.endosso && item.endosso !== endosso) return false;
            if (config.parcela && item.parcela !== parcela) return false;

            if (config.vencimentos) {
                if (!item.vencimentos.some((data) => datas.includes(data))) return false;
            }

            return true;
        });
    }

    async function executarBuscaPagos() {
        const companhiasComArquivo = [...arquivosPagos.keys()];

        const companhiasFaltando = companhiasSumiram().filter(
            (companhia) => !arquivosPagos.has(companhia)
        );

        const prosseguir = async () => {
            pausarModalPagos();
            window.ISA_UI.showLoading("Buscando status de pagamento...");

            try {
                const relatorios = new Map();

                for (const companhia of companhiasComArquivo) {
                    const linhas = await readExcelGenerico(arquivosPagos.get(companhia));

                    relatorios.set(
                        companhia,
                        prepararRelatorioPagos(linhas, configPagosDaCompanhia(companhia))
                    );
                }

                ultimoPagos = ultimoSumiram.map((linha) => {
                    const relatorio = relatorios.get(linha["SEGURADORA"]);

                    if (!relatorio) {
                        return { ...linha, [COLUNA_STATUS_PAGAMENTO]: STATUS_NAO_ENCONTRADO };
                    }

                    const encontrado = localizarPagamento(
                        linha,
                        relatorio,
                        configPagosDaCompanhia(linha["SEGURADORA"])
                    );

                    return {
                        ...linha,
                        [COLUNA_STATUS_PAGAMENTO]: encontrado ? STATUS_PAGO : STATUS_NAO_ENCONTRADO
                    };
                });

                fecharModalPagos();
                renderPreviewPagos(ultimoPagos);
            } catch (error) {
                console.error("Erro ao buscar status de pagamento:", error);

                retomarModalPagos();

                window.ISA_UI.showErrorModal(
                    "Ocorreu um erro ao buscar o status de pagamento.",
                    [error.message]
                );
            } finally {
                window.ISA_UI.hideLoading();
            }
        };

        if (companhiasFaltando.length) {
            pausarModalPagos();

            const listaFaltando = companhiasFaltando
                .map((companhia, index) => `<br>${index + 1} - ${companhia}`)
                .join("");

            window.ISA_UI.showConfirmModal(
                `Faltou o(s) relatório(s) de:${listaFaltando}`,
                prosseguir,
                retomarModalPagos
            );

            return;
        }

        await prosseguir();
    }

    /* ---------- Pré-visualização e download ---------- */

    function colunasPagos() {
        return [...COLUNAS_RELATORIO_AGENTE, COLUNA_STATUS_PAGAMENTO];
    }

    function esconderPreviewPagos() {
        ultimoPagos = null;

        const section = document.getElementById("pagos-preview");
        const wrap = document.getElementById("preview-pagos-table-wrap");

        if (section) section.hidden = true;
        if (wrap) wrap.innerHTML = "";
    }

    function renderPreviewPagos(rows) {
        const section = document.getElementById("pagos-preview");
        const wrap = document.getElementById("preview-pagos-table-wrap");
        const countEl = document.getElementById("pagos-preview-count");
        const btnLimpar = document.getElementById("btn-limpar-filtros-pagos");

        if (!section || !wrap) return;

        const tabelaApi = window.ISA_PREVIEW_TABLE.renderFilterableTable(
            wrap,
            colunasPagos(),
            rows,
            {
                formatCell: (valor, columnName) =>
                    columnName === "Valor Total" && typeof valor === "number"
                        ? formatMoney(valor)
                        : (valor ?? ""),
                onCount: (visiveis, total) => {
                    const textEl = countEl && countEl.querySelector("span");
                    if (!textEl) return;

                    textEl.textContent = visiveis === total
                        ? `${total.toLocaleString("pt-BR")} registro${total === 1 ? "" : "s"}`
                        : `${visiveis.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} registros`;
                }
            }
        );

        if (btnLimpar) {
            btnLimpar.onclick = () => tabelaApi.limparFiltros();
        }

        section.hidden = false;
        section.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function baixarPagos() {
        if (!ultimoPagos || !ultimoPagos.length) return;

        const colunas = colunasPagos();

        const linhas = ultimoPagos.map((linha) => {
            const nova = {};

            colunas.forEach((coluna) => {
                nova[coluna] = linha[coluna] ?? "";
            });

            return nova;
        });

        const worksheet = XLSX.utils.json_to_sheet(linhas, { header: [...colunas] });

        aplicarFormatoMonetarioGenerico(worksheet, colunas, linhas.length);

        worksheet["!cols"] = colunas.map((coluna) => ({
            wch: coluna === "Valor Total" ? 18 : (coluna === COLUNA_STATUS_PAGAMENTO ? 28 : 20)
        }));

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Não Localizados");

        XLSX.writeFile(workbook, "Não Localizados com Status.xlsx");
    }

    function renderListaCompanhiasPagos() {
        const select = document.getElementById("pagos-modal-company-select");
        const filesContainer = document.getElementById("pagos-modal-files");

        if (!select || !filesContainer) return;

        const companhias = companhiasSumiram();

        select.innerHTML = `
        <option value="">Selecionar companhia</option>
        ${companhias
                .filter((companhia) => !arquivosPagos.has(companhia))
                .map((companhia) => `
        <option value="${companhia}">
            ${companhia}
        </option>
    `)
                .join("")}
    `;

        filesContainer.innerHTML = [...arquivosPagos.entries()]
            .map(([companhia, arquivo]) => `
            <div class="pagos-modal__file">
                <div class="pagos-modal__file-info">
                    <i class="ri-file-excel-2-line"></i>
 
                    <div>
                        <strong>Arquivo ${companhia} selecionado</strong>
                        <span>${arquivo.name}</span>
                    </div>
                </div>
 
                <button
                    type="button"
                    class="pagos-modal__file-remove"
                    data-remover-pagos="${companhia}"
                    aria-label="Remover arquivo ${companhia}"
                >
                    <i class="ri-close-line"></i>
                </button>
            </div>
        `)
            .join("");

        filesContainer.querySelectorAll("[data-remover-pagos]").forEach((botao) => {
            botao.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();

                const companhia = botao.dataset.removerPagos;

                arquivosPagos.delete(companhia);

                if (companhiaPagosSelecionada === companhia) {
                    companhiaPagosSelecionada = null;

                    const uploadSection = document.getElementById("pagos-modal-upload");
                    if (uploadSection) uploadSection.hidden = true;
                }

                renderListaCompanhiasPagos();
                atualizarBotaoBuscarPagos();
            });
        });
    }

    function selecionarCompanhiaPagos(companhia) {
        companhiaPagosSelecionada = companhia;

        const uploadSection = document.getElementById("pagos-modal-upload");
        const label = document.getElementById("pagos-modal-upload-label");
        const input = document.getElementById("pagos-modal-input");

        if (!uploadSection || !label || !input) return;

        if (!companhia) {
            uploadSection.hidden = true;
            input.value = "";
            return;
        }

        uploadSection.hidden = false;
        label.textContent = `Relatório de pagos — ${companhia}`;

        // Sempre permite selecionar um novo arquivo para a companhia escolhida.
        input.value = "";
    }

    function atualizarBotaoBuscarPagos() {
        const botao = document.getElementById("pagos-modal-buscar");
        if (botao) botao.disabled = arquivosPagos.size === 0;
    }

    function pausarModalPagos() {
        const modal = document.getElementById("pagos-modal");
        if (!modal) return;

        modal.classList.remove("is-active");
        modal.setAttribute("aria-hidden", "true");

        modalPagosPausado = true;
    }

    function retomarModalPagos() {
        const modal = document.getElementById("pagos-modal");
        if (!modal) return;

        renderListaCompanhiasPagos();
        atualizarBotaoBuscarPagos();

        modal.classList.add("is-active");
        modal.setAttribute("aria-hidden", "false");

        modalPagosPausado = false;
    }

    function fecharModalPagos() {
        const modal = document.getElementById("pagos-modal");
        if (!modal) return;

        modal.classList.remove("is-active");
        modal.setAttribute("aria-hidden", "true");

        arquivosPagos = new Map();
        companhiaPagosSelecionada = null;

        const uploadSection = document.getElementById("pagos-modal-upload");
        if (uploadSection) uploadSection.hidden = true;

        const resultado = document.getElementById("pagos-modal-resultado");
        if (resultado) {
            resultado.hidden = true;
            resultado.innerHTML = "";
        }
    }

    function abrirModalPagos() {
        const modal = document.getElementById("pagos-modal");
        if (!modal || !ultimoSumiram || !ultimoSumiram.length) return;

        companhiaPagosSelecionada = null;
        arquivosPagos = new Map();

        renderListaCompanhiasPagos();
        atualizarBotaoBuscarPagos();

        const uploadSection = document.getElementById("pagos-modal-upload");
        if (uploadSection) uploadSection.hidden = true;

        const resultado = document.getElementById("pagos-modal-resultado");
        if (resultado) {
            resultado.hidden = true;
            resultado.innerHTML = "";
        }

        modal.classList.add("is-active");
        modal.setAttribute("aria-hidden", "false");
    }

    // Busca genérica (sem mapeamento de colunas ainda): procura o valor de
    // Proposta ou Numero Apolice em qualquer célula do relatório de pagos
    // e, se achar a linha, tenta identificar uma coluna de status/pagamento.
    function configurarModalPagos() {
        const modal = document.getElementById("pagos-modal");
        if (!modal) return;

        document
            .getElementById("pagos-modal-cancel")
            .addEventListener("click", fecharModalPagos);

        modal.addEventListener("click", (e) => {
            if (e.target === modal) fecharModalPagos();
        });

        const select = document.getElementById("pagos-modal-company-select");

        select.addEventListener("change", (e) => {
            selecionarCompanhiaPagos(e.target.value);
        });

        const pagosInput = document.getElementById("pagos-modal-input");
        const pagosDropzone = pagosInput.closest(".dropzone");

        const receberArquivoPagos = async (file) => {
            if (!file || !companhiaPagosSelecionada) return;

            const companhia = companhiaPagosSelecionada;
            const config = configPagosDaCompanhia(companhia);

            try {
                const resultado = await window.ISA_VALIDACAO.validarPagos(config.columns, file);

                if (!resultado.valido) {
                    pagosInput.value = "";

                    window.ISA_UI.showErrorModal(
                        `O arquivo "${file.name}" não parece ser o relatório de pagos da ${companhia}. Confira as colunas abaixo:`,
                        resultado.mensagens
                    );

                    return;
                }
            } catch (error) {
                pagosInput.value = "";

                window.ISA_UI.showErrorModal(
                    `Não foi possível ler o arquivo "${file.name}". Verifique se é uma planilha Excel válida.`,
                    [error.message]
                );

                return;
            }

            arquivosPagos.set(companhia, file);
            companhiaPagosSelecionada = null;

            const uploadSection = document.getElementById("pagos-modal-upload");
            if (uploadSection) {
                uploadSection.hidden = true;
            }

            renderListaCompanhiasPagos();
            atualizarBotaoBuscarPagos();
        };

        pagosInput.addEventListener("change", () => {
            receberArquivoPagos(pagosInput.files[0]);
        });

        if (pagosDropzone) {
            ["dragenter", "dragover"].forEach((evt) => {
                pagosDropzone.addEventListener(evt, (e) => {
                    e.preventDefault();
                    pagosDropzone.classList.add("is-dragover");
                });
            });

            ["dragleave", "drop"].forEach((evt) => {
                pagosDropzone.addEventListener(evt, (e) => {
                    e.preventDefault();
                    pagosDropzone.classList.remove("is-dragover");
                });
            });

            pagosDropzone.addEventListener("drop", (e) => {
                const file = e.dataTransfer.files[0];

                if (file) {
                    pagosInput.files = e.dataTransfer.files;
                    receberArquivoPagos(file);
                }
            });
        }

        document
            .getElementById("pagos-modal-buscar")
            .addEventListener("click", executarBuscaPagos);

        const btnBaixarPagos = document.getElementById("btn-baixar-pagos");

        if (btnBaixarPagos) {
            btnBaixarPagos.addEventListener("click", baixarPagos);
        }
    }

    configurarModalPagos();

    /* ================= ABAS ================= */

    function configurarTabs() {
        let trocandoPainel = false;

        document.querySelectorAll(".dash-diff-tab").forEach((botao) => {
            botao.addEventListener("click", () => {
                if (trocandoPainel) return;

                const painelAlvo = document.querySelector(
                    `[data-diff-panel="${botao.dataset.diffTab}"]`
                );

                const painelAtual = document.querySelector(
                    ".dash-diff-panel.is-active"
                );

                if (!painelAlvo || painelAlvo === painelAtual) return;

                document.querySelectorAll(".dash-diff-tab").forEach((b) => {
                    b.classList.toggle("is-active", b === botao);
                });

                const mostrarAlvo = () => {
                    painelAlvo.classList.add("is-active");
                    trocandoPainel = false;
                };

                if (!painelAtual) {
                    mostrarAlvo();
                    return;
                }

                trocandoPainel = true;

                painelAtual.classList.remove("is-active");
                painelAtual.classList.add("is-leaving");

                let jaTrocou = false;

                const concluirSaida = () => {
                    if (jaTrocou) return;
                    jaTrocou = true;

                    painelAtual.removeEventListener(
                        "animationend",
                        concluirSaida
                    );

                    painelAtual.classList.remove("is-leaving");
                    mostrarAlvo();
                };

                painelAtual.addEventListener(
                    "animationend",
                    concluirSaida,
                    { once: true }
                );

                // Fallback (ex: prefers-reduced-motion, onde a animação não
                // roda e "animationend" nunca dispara) pra não travar o
                // clique na aba pra sempre.
                setTimeout(concluirSaida, 220);
            });
        });
    }

    /* ================= FLUXO PRINCIPAL ================= */

    function atualizarComparacao() {
        const snapshot = carregarSnapshot();

        renderSnapshotBar(snapshot);
        renderPainelAnterior(snapshot);
        renderPainelComparacao(snapshot, linhasAtuais || []);
    }

    /* ================= TRANSIÇÃO: ESTADO VAZIO <-> CONTEÚDO ================= */

    function trocarParaConteudo() {
        return new Promise((resolve) => {
            const empty = document.getElementById("dash-empty");
            const content = document.getElementById("dash-content");

            if (!empty || !content) {
                resolve();
                return;
            }

            if (empty.hidden) {
                content.hidden = false;
                resolve();
                return;
            }

            let jaTrocou = false;

            const concluir = () => {
                if (jaTrocou) return;
                jaTrocou = true;

                empty.removeEventListener("animationend", concluir);
                empty.classList.remove("is-leaving");
                empty.hidden = true;

                content.hidden = false;
                resolve();
            };

            empty.classList.add("is-leaving");
            empty.addEventListener("animationend", concluir, { once: true });

            // Fallback (ex: prefers-reduced-motion) pra não travar o fluxo
            // caso "animationend" nunca dispare.
            setTimeout(concluir, 220);
        });
    }

    function voltarParaVazio() {
        const empty = document.getElementById("dash-empty");
        const content = document.getElementById("dash-content");

        if (!empty || !content) return;

        linhasAtuais = null;
        fileNameAtual = null;
        popularSelectAgentes([]);

        if (content.hidden) {
            empty.hidden = false;
            return;
        }

        let jaTrocou = false;

        const concluir = () => {
            if (jaTrocou) return;
            jaTrocou = true;

            content.removeEventListener("animationend", concluir);
            content.classList.remove("is-leaving");
            content.hidden = true;

            empty.hidden = false;
        };

        content.classList.add("is-leaving");
        content.addEventListener("animationend", concluir, { once: true });

        setTimeout(concluir, 220);
    }

    // Monta a visão geral a partir de linhas já lidas (arquivo real ou o
    // Consolidado Enriquecido desta sessão, vindo da Fase 02).
    async function processarLinhas(linhas, nomeArquivo) {
        await trocarParaConteudo();

        linhasAtuais = linhas;
        fileNameAtual = nomeArquivo;

        popularSelectAgentes(linhasAtuais);

        renderVisaoGeral(linhasAtuais);
        atualizarComparacao();
    }

    async function processarArquivo(file) {
        const linhas = await readExcel(file);
        await processarLinhas(linhas, file.name);
    }

    configurarTabs();

    window.ISA_DASHBOARD = { processarArquivo, processarLinhas, voltarParaVazio };
})();