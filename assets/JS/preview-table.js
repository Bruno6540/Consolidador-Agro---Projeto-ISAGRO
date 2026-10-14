/*
  preview-table.js
  Componente compartilhado de tabela de pré-visualização com filtro por
  coluna (clique no ícone de funil no cabeçalho -> checkboxes com os
  valores únicos daquela coluna). Usado tanto na pré-visualização do
  Consolidado (Fase 01) quanto na do Consolidado Enriquecido (Fase 02).
 
  O filtro afeta só o que é exibido na tabela — os arquivos baixados
  (.xlsx) sempre usam os dados completos, sem filtro aplicado.
*/
 
(() => {
    "use strict";
 
    function valorBruto(row, coluna) {
        const v = row[coluna];
        return (v === undefined || v === null || v === "") ? "(vazio)" : String(v);
    }
 
    function normalizarBusca(valor) {
        return String(valor ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .toLowerCase();
    }
 
    // container: elemento onde a tabela será montada (ex: .preview__table-wrap)
    // columns: array com a ordem das colunas
    // rows: dados completos (sem filtro)
    // options.formatCell(valorOriginal, coluna, row): texto exibido na célula
    function renderFilterableTable(container, columns, rows, options = {}) {
        const { formatCell, onCount } = options;
 
        container.innerHTML = "";
 
        // coluna -> Set de valores marcados (ausente/vazio = sem filtro = mostra tudo)
        const filtros = new Map();
 
        let popoverAtual = null;
        let outsideClickHandler = null;
        let scrollCloseHandler = null;
 
        function fecharPopover() {
            if (popoverAtual) {
                popoverAtual.remove();
                popoverAtual = null;
            }
 
            if (outsideClickHandler) {
                document.removeEventListener("click", outsideClickHandler);
                outsideClickHandler = null;
            }
 
            if (scrollCloseHandler) {
                container.removeEventListener("scroll", scrollCloseHandler);
                window.removeEventListener("resize", scrollCloseHandler);
                scrollCloseHandler = null;
            }
        }
 
        function linhasFiltradas() {
            if (!filtros.size) return rows;
 
            return rows.filter((row) => {
                for (const [coluna, selecionados] of filtros.entries()) {
                    if (!selecionados.size) return false;
                    if (!selecionados.has(valorBruto(row, coluna))) return false;
                }
 
                return true;
            });
        }
 
        // Igual a linhasFiltradas(), mas ignorando o filtro da própria coluna
        // que está sendo aberta no popover — assim as opções de uma coluna
        // continuam refletindo os filtros já aplicados nas outras colunas,
        // permitindo empilhar filtros (ex: Seguradora = Essor E DEPOIS
        // Apólice = X) em vez de resetar as opções pro dataset inteiro.
        function linhasFiltradasExceto(colunaExcluida) {
            return rows.filter((row) => {
                for (const [coluna, selecionados] of filtros.entries()) {
                    if (coluna === colunaExcluida) continue;
                    if (!selecionados.size) return false;
                    if (!selecionados.has(valorBruto(row, coluna))) return false;
                }
 
                return true;
            });
        }
 
        function valoresUnicos(coluna) {
            const base = linhasFiltradasExceto(coluna);
            const set = new Set();
            base.forEach((row) => set.add(valorBruto(row, coluna)));
            return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
        }
 
        function abrirPopover(coluna, thEl, botaoEl) {
            const jaAberto = popoverAtual && popoverAtual.dataset.coluna === coluna;
 
            fecharPopover();
 
            if (jaAberto) return;
 
            const todosValores = valoresUnicos(coluna);
            const selecionadosAtuais = filtros.get(coluna);
 
            const popover = document.createElement("div");
            popover.className = "preview-filter-popover";
            popover.dataset.coluna = coluna;
 
            popover.innerHTML = `
                <div class="preview-filter-popover__search">
                    <input type="text" placeholder="Buscar..." data-busca>
                </div>
                <div class="preview-filter-popover__actions">
                    <button type="button" data-acao="todos">Marcar todos</button>
                    <button type="button" data-acao="limpar">Limpar</button>
                </div>
                <div class="preview-filter-popover__list">
                    ${todosValores.map((valor) => {
                const marcado = !selecionadosAtuais || selecionadosAtuais.has(valor);
                const valorEscapado = valor.replace(/"/g, "&quot;");
 
                return `
                            <label class="preview-filter-popover__item">
                                <input type="checkbox" value="${valorEscapado}" ${marcado ? "checked" : ""}>
                                <span>${valor}</span>
                            </label>
                        `;
            }).join("")}
                </div>
                <div class="preview-filter-popover__confirm">
                    <button type="button" data-acao="aplicar">Aplicar filtro</button>
                </div>
            `;
 
            document.body.appendChild(popover);
 
            const rectBotao = botaoEl.getBoundingClientRect();
 
            let left = Math.min(
                rectBotao.left,
                window.innerWidth - popover.offsetWidth - 12
            );
            left = Math.max(12, left);
 
            let top = rectBotao.bottom + 6;
 
            if (top + popover.offsetHeight > window.innerHeight - 12) {
                top = rectBotao.top - popover.offsetHeight - 6;
            }
 
            top = Math.max(12, top);
 
            popover.style.left = `${left}px`;
            popover.style.top = `${top}px`;
 
            function aplicarSelecao() {
                const marcados = new Set(
                    [...popover.querySelectorAll('input[type="checkbox"]:checked')]
                        .map((el) => el.value)
                );
 
                if (marcados.size === todosValores.length) {
                    filtros.delete(coluna);
                } else {
                    filtros.set(coluna, marcados);
                }
 
                thEl.classList.toggle("is-filtered", filtros.has(coluna));
                renderCorpo();
            }
 
            popover.querySelector("[data-busca]").addEventListener("input", (event) => {
                const termo = normalizarBusca(event.target.value);
 
                popover.querySelectorAll(".preview-filter-popover__item").forEach((item) => {
                    const texto = normalizarBusca(item.querySelector("span").textContent);
                    const combina = texto.includes(termo);
 
                    item.style.display = combina ? "" : "none";
                    item.querySelector('input[type="checkbox"]').checked = combina;
                });
            });
 
            popover.querySelector("[data-busca]").addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    aplicarSelecao();
                    fecharPopover();
                }
            });
 
            popover.querySelector('[data-acao="todos"]').addEventListener("click", () => {
                popover.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
                    chk.checked = true;
                });
            });
 
            popover.querySelector('[data-acao="limpar"]').addEventListener("click", () => {
                popover.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
                    chk.checked = false;
                });
            });
 
            popover.querySelector('[data-acao="aplicar"]').addEventListener("click", () => {
                aplicarSelecao();
                fecharPopover();
            });
 
            outsideClickHandler = (event) => {
                if (!popover.contains(event.target) && event.target !== botaoEl) {
                    fecharPopover();
                }
            };
 
            scrollCloseHandler = () => fecharPopover();
 
            setTimeout(() => {
                document.addEventListener("click", outsideClickHandler);
                container.addEventListener("scroll", scrollCloseHandler);
                window.addEventListener("resize", scrollCloseHandler);
            }, 0);
 
            popoverAtual = popover;
        }
 
        const table = document.createElement("table");
        table.className = "preview-table";
 
        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
 
        columns.forEach((coluna) => {
            const th = document.createElement("th");
            th.className = "preview-th";
 
            const label = document.createElement("span");
            label.className = "preview-th__label";
            label.textContent = coluna;
 
            const botaoFiltro = document.createElement("button");
            botaoFiltro.type = "button";
            botaoFiltro.className = "preview-th__filter-btn";
            botaoFiltro.innerHTML = '<i class="ri-filter-3-line"></i>';
            botaoFiltro.setAttribute("aria-label", `Filtrar por ${coluna}`);
 
            botaoFiltro.addEventListener("click", (event) => {
                event.stopPropagation();
                abrirPopover(coluna, th, botaoFiltro);
            });
 
            th.appendChild(label);
            th.appendChild(botaoFiltro);
            headRow.appendChild(th);
        });
 
        thead.appendChild(headRow);
        table.appendChild(thead);
 
        const tbody = document.createElement("tbody");
        table.appendChild(tbody);
 
        function renderCorpo() {
            const linhas = linhasFiltradas();
 
            if (onCount) {
                onCount(linhas.length, rows.length);
            }
 
            tbody.innerHTML = "";
 
            if (!linhas.length) {
                const tr = document.createElement("tr");
                const td = document.createElement("td");
 
                td.colSpan = columns.length;
                td.className = "preview-empty-cell";
                td.textContent = "Nenhum registro encontrado para os filtros selecionados.";
 
                tr.appendChild(td);
                tbody.appendChild(tr);
                return;
            }
 
            linhas.forEach((row) => {
                const tr = document.createElement("tr");
 
                columns.forEach((coluna) => {
                    const td = document.createElement("td");
                    const valor = row[coluna];
 
                    td.textContent = formatCell
                        ? formatCell(valor, coluna, row)
                        : (valor ?? "");
 
                    tr.appendChild(td);
                });
 
                tbody.appendChild(tr);
            });
        }
 
        function limparFiltros() {
            fecharPopover();
 
            filtros.clear();
 
            container.querySelectorAll(".preview-th.is-filtered").forEach((th) => {
                th.classList.remove("is-filtered");
            });
 
            renderCorpo();
        }
 
        renderCorpo();
 
        container.appendChild(table);
 
        return { limparFiltros };
    }
 
    window.ISA_PREVIEW_TABLE = { renderFilterableTable };
})();