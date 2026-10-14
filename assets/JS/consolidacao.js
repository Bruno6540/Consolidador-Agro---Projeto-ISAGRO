/*
  consolidacao.js
  Lê os arquivos das companhias, aplica os mapeamentos,
  calcula as regras e gera o arquivo Consolidado Agro.xlsx.
*/

(() => {
    "use strict";

    const {
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
        calcTipoDocumento
    } = window.ISA_RULES;

    const AUTO_COLUMNS = [
        "_Origem",
        "_Análises de dia de vencimento",
        "_Aging",
        "_Status",
        "_Tipo Documento",
        "SEGURADORA",
        "Recebido em :"
    ];

    const CAMPOS_VAZIO_SEM_NINF = (window.ISA_CONFIG && window.ISA_CONFIG.camposSemNinf) || [];

    function normalizeHeader(text) {
        return String(text ?? "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, " ");
    }

    function parseDateFlexible(value) {
        if (
            value === undefined ||
            value === null ||
            value === ""
        ) {
            return null;
        }

        /*
          Quando o SheetJS já devolve um objeto Date.
        */
        if (value instanceof Date) {
            if (Number.isNaN(value.getTime())) {
                return null;
            }

            return new Date(
                value.getFullYear(),
                value.getMonth(),
                value.getDate()
            );
        }

        /*
          Quando o Excel devolve um número serial.
        */
        if (typeof value === "number") {
            const excelDate =
                XLSX.SSF.parse_date_code(value);

            if (!excelDate) {
                return null;
            }

            const date = new Date(
                excelDate.y,
                excelDate.m - 1,
                excelDate.d
            );

            return Number.isNaN(date.getTime())
                ? null
                : date;
        }

        const text = String(value).trim();

        if (
            text === "" ||
            text === "-" ||
            text.toUpperCase() === NINF
        ) {
            return null;
        }

        /*
          Formatos aceitos:
     
          15/08/2026
          15-08-2026
          15.08.2026
          15/08/2026 00:00:00
        */
        let match = text.match(
            /^(\d{1,2})\d{1,2}\d{2,4}(?:\s|$)/
        );

        if (match) {
            let [, day, month, year] = match;

            if (year.length === 2) {
                year = Number(year) >= 50
                    ? `19${year}`
                    : `20${year}`;
            }

            const numericDay = Number(day);
            const numericMonth = Number(month);
            const numericYear = Number(year);

            const date = new Date(
                numericYear,
                numericMonth - 1,
                numericDay
            );

            const valid =
                date.getFullYear() === numericYear &&
                date.getMonth() === numericMonth - 1 &&
                date.getDate() === numericDay;

            return valid ? date : null;
        }

        /*
          Formatos aceitos:
     
          2026-08-15
          2026-08-15T00:00:00
          2026-08-15 00:00:00
        */
        match = text.match(
            /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T|\s|$)/
        );

        if (match) {
            const [, year, month, day] = match;

            const numericYear = Number(year);
            const numericMonth = Number(month);
            const numericDay = Number(day);

            const date = new Date(
                numericYear,
                numericMonth - 1,
                numericDay
            );

            const valid =
                date.getFullYear() === numericYear &&
                date.getMonth() === numericMonth - 1 &&
                date.getDate() === numericDay;

            return valid ? date : null;
        }

        /*
          Última tentativa para outros formatos
          eventualmente reconhecidos pelo navegador.
        */
        const automaticDate = new Date(text);

        if (!Number.isNaN(automaticDate.getTime())) {
            return new Date(
                automaticDate.getFullYear(),
                automaticDate.getMonth(),
                automaticDate.getDate()
            );
        }

        return null;
    }

    function formatDateBR(date) {
        if (
            !(date instanceof Date) ||
            Number.isNaN(date.getTime())
        ) {
            return NINF;
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

    function parseNumberFlexible(value) {
        if (typeof value === "number") {
            return Number.isFinite(value)
                ? value
                : NINF;
        }

        if (isBlank(value)) {
            return NINF;
        }

        let text = String(value)
            .trim()
            .replace(/\s/g, "")
            .replace(/R\$/gi, "");

        /*
          Exemplos:
     
          1.500,51 -> 1500.51
          1500,51  -> 1500.51
          1500.51  -> 1500.51
        */
        if (
            text.includes(".") &&
            text.includes(",")
        ) {
            text = text
                .replace(/\./g, "")
                .replace(",", ".");
        } else if (text.includes(",")) {
            text = text.replace(",", ".");
        }

        const numericValue = Number(text);

        return Number.isFinite(numericValue)
            ? numericValue
            : NINF;
    }

    async function readCompanyRows(file) {
        const { sheetExists, data: matrix } =
            await window.ISA_XLSX_WORKER.parseWorkbook(file, {
                xlsxOptions: { type: "array", cellDates: true },
                sheetToJsonOptions: {
                    header: 1,
                    defval: "",
                    raw: true,
                    blankrows: false
                }
            });

        if (!sheetExists) {
            throw new Error(
                `O arquivo "${file.name}" não possui uma planilha válida.`
            );
        }

        if (matrix.length < 2) {
            return {
                dataRows: [],
                headerIndex: {}
            };
        }

        const headerRow = matrix[0];
        const headerIndex = {};

        headerRow.forEach((header, index) => {
            const key = normalizeHeader(header);

            if (
                key &&
                !(key in headerIndex)
            ) {
                headerIndex[key] = index;
            }
        });

        const dataRows = matrix
            .slice(1)
            .filter((row) => {
                return row.some((cellValue) => {
                    return String(
                        cellValue ?? ""
                    ).trim() !== "";
                });
            });

        return {
            dataRows,
            headerIndex
        };
    }

    function cell(
        dataRow,
        headerIndex,
        headerName
    ) {
        const normalizedHeader =
            normalizeHeader(headerName);

        const columnIndex =
            headerIndex[normalizedHeader];

        return columnIndex === undefined
            ? ""
            : dataRow[columnIndex];
    }

    function pickMapped(
        dataRow,
        headerIndex,
        mapTo,
        targetColumn
    ) {
        const entries = mapTo.filter(
            (mapping) => {
                return mapping.to === targetColumn;
            }
        );

        for (const entry of entries) {
            const value = cell(
                dataRow,
                headerIndex,
                entry.from
            );

            if (!isBlank(value)) {
                return value;
            }
        }

        return NINF;
    }

    function buildRowsForCompany(
        companyKey,
        dataRows,
        headerIndex,
        recebidoEmDate
    ) {
        const company =
            window.COMPANY_MAPPINGS[companyKey];

        if (!company) {
            throw new Error(
                `Mapeamento não encontrado para a companhia "${companyKey}".`
            );
        }

        const seguradora =
            company.officialName ||
            company.label.toUpperCase();

        const recebidoEmText =
            formatDateBR(recebidoEmDate);

        return dataRows.map((dataRow) => {
            const row = {};

            /*
              Primeiro preenche todas as colunas do
              consolidado com N/INF.
            */
            CONSOLIDADO_COLUMNS.forEach(
                (columnName) => {
                    row[columnName] =
                        CAMPOS_VAZIO_SEM_NINF.includes(columnName)
                            ? ""
                            : NINF;
                }
            );

            /*
              Aplica os mapeamentos da companhia.
            */
            CONSOLIDADO_COLUMNS.forEach(
                (columnName) => {
                    if (
                        AUTO_COLUMNS.includes(columnName)
                    ) {
                        return;
                    }

                    const mappedValue = pickMapped(
                        dataRow,
                        headerIndex,
                        company.mapTo,
                        columnName
                    );

                    if (!isBlank(mappedValue)) {
                        row[columnName] =
                            mappedValue;
                    }
                }
            );

            /*
              Reforça os campos que devem iniciar
              obrigatoriamente como N/INF.
            */
            NINF_COLUMNS.forEach(
                (columnName) => {
                    if (
                        !company.mapTo.some(
                            (mapping) =>
                                mapping.to === columnName
                        )
                    ) {
                        row[columnName] = NINF;
                    }
                }
            );

            /*
              Campos fixos.
            */
            Object.entries(
                FIXED_COLUMNS
            ).forEach(([columnName, value]) => {
                row[columnName] = value;
            });

            /*
              Nome oficial da seguradora.
            */
            row["SEGURADORA"] = seguradora;

            /*
              Data informada manualmente pelo usuário.
            */
            row["Recebido em :"] =
                recebidoEmText;

            /*
              Padronização do corretor e cálculo da origem.
            */
            row["Corretor"] =
                normalizeBrokerName(
                    row["Corretor"]
                );

            row["_Origem"] =
                calcOrigem(
                    row["Corretor"]
                );

            /*
              Datas usadas no cálculo.
            */
            const valorDataVencimento =
                row["Data Vencimento"];

            const valorDataUltimoVencimento =
                row["Data do ultimo vencimento"];

            const dataVencimento =
                parseDateFlexible(
                    isBlank(valorDataVencimento)
                        ? null
                        : valorDataVencimento
                );

            const dataUltimoVencimento =
                parseDateFlexible(
                    isBlank(
                        valorDataUltimoVencimento
                    )
                        ? null
                        : valorDataUltimoVencimento
                );

            const possuiUltimoVencimento =
                dataUltimoVencimento instanceof Date &&
                !Number.isNaN(
                    dataUltimoVencimento.getTime()
                );

            /*
              Prioridade:
       
              1. Data do ultimo vencimento
              2. Data Vencimento
            */
            const dataBaseCalculo =
                possuiUltimoVencimento
                    ? dataUltimoVencimento
                    : dataVencimento;

            const dias = diffDays(
                recebidoEmDate,
                dataBaseCalculo
            );

            row[
                "_Análises de dia de vencimento"
            ] = dias === null
                    ? NINF
                    : dias;

            row["_Aging"] =
                calcAging(dias);

            row["_Status"] =
                calcStatus(dias);

            /*
              Tipo do documento.
            */
            row["_Tipo Documento"] =
                calcTipoDocumento(
                    row["Endosso"],
                    row["Proposta"],
                    row["Numero Apolice"]
                );

            /*
              Converte Valor Total para número real.
            */
            row["Valor Total"] =
                parseNumberFlexible(
                    row["Valor Total"]
                );

            /*
              Formata as datas para dd/mm/aaaa.
            */
            [
                "Data Vencimento",
                "Data do ultimo vencimento",
                "Inicio de Vigência",
                "Final de Vigência"
            ].forEach((columnName) => {
                if (!isBlank(row[columnName])) {
                    const parsedDate =
                        parseDateFlexible(
                            row[columnName]
                        );

                    if (parsedDate) {
                        row[columnName] =
                            formatDateBR(parsedDate);
                    }
                }
            });

            return row;
        });
    }

    function normalizeDup(value) {
        return String(value ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase();
    }

    function chaveDuplicidade(row) {
        return [
            row["SEGURADORA"],
            row["Numero Apolice"],
            row["Endosso"],
            row["Tomador"],
            row["Numero Parcela"],
            row["Proposta"]
        ]
            .map(normalizeDup)
            .join("|");
    }

    /*
      Mantém o primeiro registro de cada grupo (o "original") no
      Consolidado — só os demais registros repetidos do mesmo grupo
      vão para a lista de duplicados.
    */
    function separarDuplicados(rows) {
        const grupos = new Map();

        rows.forEach((row) => {
            const chave = chaveDuplicidade(row);

            if (!grupos.has(chave)) {
                grupos.set(chave, []);
            }

            grupos.get(chave).push(row);
        });

        const unicos = [];
        const duplicados = [];

        grupos.forEach((grupo) => {
            unicos.push(grupo[0]);

            if (grupo.length > 1) {
                duplicados.push(...grupo.slice(1));
            }
        });

        return { unicos, duplicados };
    }

    let ultimoConsolidado = null;
    let ultimoDuplicados = null;

    function renderPreview(rows) {
        const wrap = document.getElementById("preview-table-wrap");
        const previewSection = document.getElementById("consolidado-preview");
        const downloadBtn = document.getElementById("btn-baixar-consolidado");
        const countEl = document.getElementById("consolidado-preview-count");

        if (!wrap || !previewSection) return;

        const tabelaApi = window.ISA_PREVIEW_TABLE.renderFilterableTable(
            wrap,
            CONSOLIDADO_COLUMNS,
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

        const btnLimparFiltrosConsolidado = document.getElementById("btn-limpar-filtros-consolidado");

        if (btnLimparFiltrosConsolidado) {
            btnLimparFiltrosConsolidado.onclick = () => tabelaApi.limparFiltros();
        }

        previewSection.hidden = false;

        if (downloadBtn) {
            downloadBtn.disabled = false;
        }
    }

    function renderPreviewDuplicados(rows) {
        const wrap = document.getElementById("preview-duplicados-table-wrap");
        const previewSection = document.getElementById("duplicados-preview");
        const titleEl = document.getElementById("duplicados-preview-title");
        const downloadBtn = document.getElementById("btn-baixar-duplicados");
        const countEl = document.getElementById("duplicados-preview-count");

        if (!wrap || !previewSection) return;

        if (!rows.length) {
            previewSection.hidden = true;
            wrap.innerHTML = "";

            if (downloadBtn) {
                downloadBtn.disabled = true;
            }

            return;
        }

        if (titleEl) {
            titleEl.textContent = `${rows.length} caso${rows.length > 1 ? "s" : ""} duplicado${rows.length > 1 ? "s" : ""} encontrado${rows.length > 1 ? "s" : ""}`;
        }

        const tabelaApi = window.ISA_PREVIEW_TABLE.renderFilterableTable(
            wrap,
            CONSOLIDADO_COLUMNS,
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

        const btnLimparFiltrosDuplicados = document.getElementById("btn-limpar-filtros-duplicados");

        if (btnLimparFiltrosDuplicados) {
            btnLimparFiltrosDuplicados.onclick = () => tabelaApi.limparFiltros();
        }

        previewSection.hidden = false;

        if (downloadBtn) {
            downloadBtn.disabled = false;
        }
    }

    function aplicarFormatoMonetario(worksheet, totalLinhas) {
        const valorTotalColumnIndex = CONSOLIDADO_COLUMNS.indexOf("Valor Total");

        if (valorTotalColumnIndex < 0) return;

        const valorTotalColumnLetter = XLSX.utils.encode_col(valorTotalColumnIndex);

        for (let rowNumber = 2; rowNumber <= totalLinhas + 1; rowNumber++) {
            const cellAddress = `${valorTotalColumnLetter}${rowNumber}`;
            const excelCell = worksheet[cellAddress];

            if (excelCell && excelCell.t === "n") {
                excelCell.z = '_-"R$" * #,##0.00_-;-"R$" * #,##0.00_-;_-"R$" * "-"??_-;_-@_-';
            }
        }
    }

    function colunasLargura() {
        return CONSOLIDADO_COLUMNS.map((columnName) => {
            if (columnName === "Valor Total") {
                return { wch: 18 };
            }

            if (
                columnName === "SEGURADORA" ||
                columnName === "Corretor" ||
                columnName === "Tomador" ||
                columnName === "SEGURADO"
            ) {
                return { wch: 42 };
            }

            return { wch: 20 };
        });
    }

    function gerarWorkbook(allRows) {
        const worksheet = XLSX.utils.json_to_sheet(allRows, { header: [...CONSOLIDADO_COLUMNS] });

        aplicarFormatoMonetario(worksheet, allRows.length);

        worksheet["!cols"] = colunasLargura();

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Consolidado Agro");

        return workbook;
    }

    function gerarWorkbookDuplicados(rows) {
        const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...CONSOLIDADO_COLUMNS] });

        aplicarFormatoMonetario(worksheet, rows.length);

        worksheet["!cols"] = colunasLargura();

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Duplicados Agro");

        return workbook;
    }

    function baixarConsolidado() {
        if (!ultimoConsolidado || !ultimoConsolidado.length) return;

        const workbook = gerarWorkbook(ultimoConsolidado);

        XLSX.writeFile(workbook, "Consolidado Agro.xlsx", { cellStyles: true });
    }

    function baixarDuplicados() {
        if (!ultimoDuplicados || !ultimoDuplicados.length) return;

        const workbook = gerarWorkbookDuplicados(ultimoDuplicados);

        XLSX.writeFile(workbook, "Duplicados Agro.xlsx", { cellStyles: true });
    }

    function getUltimoConsolidado() {
        return ultimoConsolidado;
    }

    async function runConsolidacao() {
        const cards =
            document.querySelectorAll(
                "#company-cards .card"
            );

        const missingDates = [];
        const withFiles = [];

        cards.forEach((card) => {
            const input =
                card.querySelector(
                    "[data-input]"
                );

            const receivedInput =
                card.querySelector(
                    "[data-received]"
                );

            const companyKey =
                card.dataset.company;

            if (
                input &&
                input.files.length > 0
            ) {
                withFiles.push({
                    companyKey,
                    file: input.files[0],
                    receivedValue:
                        receivedInput?.value || ""
                });

                if (!receivedInput?.value) {
                    missingDates.push(
                        window.COMPANY_MAPPINGS[
                            companyKey
                        ]?.label || companyKey
                    );
                }
            }
        });

        if (withFiles.length === 0) {
            window.ISA_UI.showErrorModal(
                "Selecione pelo menos um arquivo para consolidar.",
                []
            );

            return;
        }

        if (missingDates.length > 0) {
            window.ISA_UI.showErrorModal(
                'Antes de consolidar, informe "Recebido em:" para:',
                missingDates
            );

            return;
        }

        const previewSection = document.getElementById("consolidado-preview");
        const downloadBtn = document.getElementById("btn-baixar-consolidado");
        const duplicadosSection = document.getElementById("duplicados-preview");
        const downloadDuplicadosBtn = document.getElementById("btn-baixar-duplicados");

        if (previewSection) previewSection.hidden = true;
        if (downloadBtn) downloadBtn.disabled = true;
        if (duplicadosSection) duplicadosSection.hidden = true;
        if (downloadDuplicadosBtn) downloadDuplicadosBtn.disabled = true;

        window.ISA_UI.showLoading(
            "Consolidando arquivos..."
        );

        await new Promise(
            (resolve) => setTimeout(resolve, 50)
        );

        try {
            let allRows = [];

            for (const item of withFiles) {
                const {
                    dataRows,
                    headerIndex
                } = await readCompanyRows(
                    item.file
                );

                if (dataRows.length === 0) {
                    const companyLabel =
                        window.COMPANY_MAPPINGS[
                            item.companyKey
                        ]?.label || item.companyKey;

                    throw new Error(
                        `${companyLabel}: o arquivo não possui registros para consolidar.`
                    );
                }

                const [year, month, day] =
                    item.receivedValue
                        .split("-")
                        .map(Number);

                const recebidoEmDate =
                    new Date(
                        year,
                        month - 1,
                        day
                    );

                const rows =
                    buildRowsForCompany(
                        item.companyKey,
                        dataRows,
                        headerIndex,
                        recebidoEmDate
                    );

                allRows =
                    allRows.concat(rows);
            }

            if (allRows.length === 0) {
                throw new Error(
                    "Nenhum registro foi encontrado nos arquivos selecionados."
                );
            }

            const { unicos, duplicados } = separarDuplicados(allRows);

            ultimoConsolidado = unicos;
            ultimoDuplicados = duplicados;

            renderPreview(unicos);
            renderPreviewDuplicados(duplicados);
        } catch (error) {
            console.error(
                "Erro na consolidação:",
                error
            );

            window.ISA_UI.showErrorModal(
                error?.message ||
                "Não foi possível concluir a consolidação.",
                []
            );
        } finally {
            window.ISA_UI.hideLoading();
        }
    }

    window.ISA_CONSOLIDACAO = {
        runConsolidacao,
        baixarConsolidado,
        baixarDuplicados,
        getUltimoConsolidado
    };
})();