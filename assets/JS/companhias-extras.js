/*
  companhias-extras.js
  Fase 01 — companhias que ainda não têm layout próprio.

  - Monta o card tracejado "Adicionar companhia" no fim de #company-cards.
  - O modal lista as companhias de config.companhiasAdicionais (ordem
    alfabética) e a opção "Outra", que pede o nome e cria a companhia na hora.
  - Toda companhia criada aqui usa o modelo do ISAgro
    (config.modeloCompanhiaNova): as colunas do modelo já têm o nome das
    colunas do Consolidado, então validação e consolidação seguem o fluxo normal.
  - "Baixar modelo" gera a planilha em branco, só com o cabeçalho.
*/

(() => {
    "use strict";

    const config = window.ISA_CONFIG || {};
    const EXTRAS = config.companhiasAdicionais || {};
    const MODELO = config.modeloCompanhiaNova || { colunas: [] };

    const container = document.getElementById("company-cards");
    const modal = document.getElementById("companhias-modal");
    const lista = document.getElementById("companhias-modal-lista");
    const escolha = document.getElementById("companhias-modal-escolha");
    const btnCancelar = document.getElementById("companhias-modal-cancel");
    const formOutra = document.getElementById("companhias-modal-outra");
    const inputNome = document.getElementById("companhias-modal-nome");
    const erroNome = document.getElementById("companhias-modal-erro");
    const btnVoltar = document.getElementById("companhias-modal-voltar");

    if (!container || !modal) return;

    // Companhias com card na tela: key -> { label, tab, officialName }.
    const ativas = new Map();
    let sequenciaOutra = 0;
    let focoAntes = null;

    const escapeHtml = (texto) =>
        String(texto ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");

    const normalizar = (texto) =>
        String(texto ?? "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .replace(/\s+/g, " ")
            .toLowerCase();

    const ordenadas = () =>
        Object.entries(EXTRAS).sort(([, a], [, b]) =>
            a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" })
        );

    function mapToModelo() {
        const mapTo = [];

        (MODELO.colunas || []).forEach((coluna) => {
            (coluna.destinos || [coluna.coluna]).forEach((destino) => {
                mapTo.push({ from: coluna.coluna, to: destino });
            });
        });

        return mapTo;
    }

    /* ================= CARD "ADICIONAR" ================= */

    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "card-add";
    tile.id = "btn-adicionar-companhia";
    tile.innerHTML = `
        <span class="card-add__plus"><i class="ri-add-line"></i></span>
        <span class="card-add__label">Adicionar companhia</span>
        <span class="card-add__hint">Para companhias sem layout próprio</span>
    `;
    container.appendChild(tile);

    /* ================= MODAL ================= */

    function renderLista() {
        const itens = ordenadas().map(([key, empresa]) => {
            const jaAdicionada = ativas.has(key);

            return `
                <li>
                    <button type="button" class="cia-modal__opcao" data-key="${key}" ${jaAdicionada ? "disabled" : ""}>
                        <span class="cia-modal__sigla">${escapeHtml(empresa.tab)}</span>
                        <span class="cia-modal__nome">
                            <strong>${escapeHtml(empresa.label)}</strong>
                            <span>${escapeHtml(empresa.officialName)}</span>
                        </span>
                        ${jaAdicionada
                    ? '<span class="cia-modal__tag">Adicionada</span>'
                    : '<i class="ri-add-line" aria-hidden="true"></i>'}
                    </button>
                </li>
            `;
        });

        itens.push(`
            <li>
                <button type="button" class="cia-modal__opcao cia-modal__opcao--outra" data-outra>
                    <span class="cia-modal__sigla"><i class="ri-add-line"></i></span>
                    <span class="cia-modal__nome">
                        <strong>Outra</strong>
                        <span>Companhia que não está na lista</span>
                    </span>
                    <i class="ri-arrow-right-s-line" aria-hidden="true"></i>
                </button>
            </li>
        `);

        lista.innerHTML = itens.join("");
    }

    function mostrarEscolha() {
        formOutra.hidden = true;
        escolha.hidden = false;
        erroNome.hidden = true;
    }

    function mostrarFormOutra() {
        escolha.hidden = true;
        formOutra.hidden = false;
        inputNome.value = "";
        erroNome.hidden = true;
        requestAnimationFrame(() => inputNome.focus());
    }

    function abrirModal() {
        focoAntes = document.activeElement;
        renderLista();
        mostrarEscolha();

        modal.classList.add("is-active");
        modal.setAttribute("aria-hidden", "false");

        requestAnimationFrame(() => {
            const primeira = lista.querySelector(".cia-modal__opcao:not(:disabled)");
            (primeira || btnCancelar).focus();
        });
    }

    function fecharModal() {
        modal.classList.remove("is-active");
        modal.setAttribute("aria-hidden", "true");

        if (focoAntes && document.contains(focoAntes) && !focoAntes.hidden) {
            focoAntes.focus();
        }

        focoAntes = null;
    }

    tile.addEventListener("click", abrirModal);
    btnCancelar.addEventListener("click", fecharModal);

    btnVoltar.addEventListener("click", () => {
        mostrarEscolha();
        const outra = lista.querySelector("[data-outra]");
        if (outra) outra.focus();
    });

    modal.addEventListener("click", (e) => {
        if (e.target === modal) fecharModal();
    });

    lista.addEventListener("click", (e) => {
        const opcao = e.target.closest(".cia-modal__opcao");
        if (!opcao || opcao.disabled) return;

        if (opcao.hasAttribute("data-outra")) {
            mostrarFormOutra();
            return;
        }

        const card = adicionarCompanhia(opcao.dataset.key, EXTRAS[opcao.dataset.key]);

        focoAntes = card ? card.querySelector("[data-modelo]") : null;
        fecharModal();
    });

    /* ================= "OUTRA" ================= */

    function siglaDe(nome) {
        const palavras = nome
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^A-Za-z0-9 ]/g, " ")
            .trim()
            .split(/\s+/)
            .filter(Boolean);

        if (!palavras.length) return "??";

        const sigla = palavras.length > 1
            ? palavras[0][0] + palavras[1][0]
            : palavras[0].slice(0, 2);

        return sigla.toUpperCase();
    }

    // Nome já usado por alguma companhia fixa, da lista ou já criada como "Outra".
    function nomeJaExiste(nome) {
        const alvo = normalizar(nome);

        const nomesFixos = Object.values(window.COMPANY_MAPPINGS || {})
            .flatMap((empresa) => [empresa.label, empresa.officialName]);

        const nomesLista = Object.values(EXTRAS)
            .flatMap((empresa) => [empresa.label, empresa.officialName]);

        return [...nomesFixos, ...nomesLista].some((n) => normalizar(n) === alvo);
    }

    function mostrarErroNome(mensagem) {
        erroNome.textContent = mensagem;
        erroNome.hidden = false;
        inputNome.focus();
    }

    formOutra.addEventListener("submit", (e) => {
        e.preventDefault();

        const nome = inputNome.value.trim().replace(/\s+/g, " ");

        if (nome.length < 2) {
            mostrarErroNome("Informe o nome da companhia (mínimo de 2 caracteres).");
            return;
        }

        if (nomeJaExiste(nome)) {
            mostrarErroNome(`"${nome}" já existe. Escolha na lista ou use outro nome.`);
            return;
        }

        sequenciaOutra++;

        const key = `outra-${sequenciaOutra}`;
        const empresa = {
            label: nome,
            tab: siglaDe(nome),
            officialName: nome.toUpperCase()
        };

        const card = adicionarCompanhia(key, empresa);

        focoAntes = card ? card.querySelector("[data-modelo]") : null;
        fecharModal();
    });

    /* ================= CARD DA COMPANHIA ================= */

    function adicionarCompanhia(key, empresa) {
        if (!empresa || ativas.has(key)) return null;

        window.COMPANY_MAPPINGS[key] = {
            label: empresa.label,
            officialName: empresa.officialName,
            columns: (MODELO.colunas || []).map((c) => c.coluna),
            mapTo: mapToModelo()
        };

        const indice = container.querySelectorAll(".card").length;
        const card = window.ISA_CRIAR_CARD(key, empresa, indice, { extra: true });

        container.insertBefore(card, tile);
        window.ISA_UI.inicializarCard(card);

        ativas.set(key, empresa);
        window.ISA_UI.atualizarResumo();

        return card;
    }

    function removerCompanhia(card) {
        const key = card.dataset.company;

        card.remove();
        delete window.COMPANY_MAPPINGS[key];
        ativas.delete(key);

        window.ISA_UI.atualizarResumo();
        tile.focus();
    }

    container.addEventListener("click", (e) => {
        const btnModelo = e.target.closest("[data-modelo]");

        if (btnModelo) {
            baixarModelo(btnModelo.closest(".card").dataset.company);
            return;
        }

        const btnDescartar = e.target.closest("[data-descartar]");
        if (!btnDescartar) return;

        const card = btnDescartar.closest(".card");
        const label = ativas.get(card.dataset.company)?.label || card.dataset.company;

        if (!card.classList.contains("has-file")) {
            removerCompanhia(card);
            return;
        }

        window.ISA_UI.showConfirmModal(
            `O campo da ${escapeHtml(label)} e o arquivo selecionado vão sair da consolidação. Deseja remover?`,
            () => removerCompanhia(card),
            null,
            { titulo: "Remover companhia", cancelar: "Cancelar", confirmar: "Remover" }
        );
    });

    /* ================= PLANILHA MODELO ================= */

    const BORDA = { style: "thin", color: { rgb: "A9CFF2" } };
    const BORDAS = { top: BORDA, bottom: BORDA, left: BORDA, right: BORDA };

    const ESTILO_OBRIGATORIA = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { patternType: "solid", fgColor: { rgb: "1D5FA6" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: BORDAS
    };

    const ESTILO_OPCIONAL = {
        font: { bold: true, color: { rgb: "124985" } },
        fill: { patternType: "solid", fgColor: { rgb: "E3F0FD" } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: BORDAS
    };

    function montarAbaModelo() {
        const colunas = MODELO.colunas || [];
        const ws = XLSX.utils.aoa_to_sheet([colunas.map((c) => c.coluna)]);

        colunas.forEach((coluna, i) => {
            const ref = XLSX.utils.encode_cell({ r: 0, c: i });
            ws[ref].s = coluna.obrigatoria ? ESTILO_OBRIGATORIA : ESTILO_OPCIONAL;
        });

        ws["!cols"] = colunas.map((c) => ({ wch: Math.max(16, c.coluna.length + 6) }));
        ws["!rows"] = [{ hpt: 30 }];

        return ws;
    }

    function baixarModelo(key) {
        const empresa = ativas.get(key);
        if (!empresa) return;

        try {
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, montarAbaModelo(), "Modelo");

            const nomeArquivo = `Modelo ISAgro – ${empresa.label}`.replace(/[\\/:*?"<>|]/g, "-");

            XLSX.writeFile(wb, `${nomeArquivo}.xlsx`, { cellStyles: true });
        } catch (error) {
            console.error("Erro ao gerar o modelo:", error);

            window.ISA_UI.showErrorModal(
                `Não foi possível gerar o modelo da ${empresa.label}.`,
                [error.message],
                "Não deu pra gerar o modelo"
            );
        }
    }

    window.ISA_COMPANHIAS_EXTRAS = { adicionarCompanhia, baixarModelo };
})();