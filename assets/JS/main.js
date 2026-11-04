/*
  main.js
  Só cuida do COMPORTAMENTO DA PÁGINA: menu lateral, tema claro/escuro,
  troca de view, upload visual (drag-over, seleção, remoção) e a tela
  de carregamento. Nenhuma leitura, validação ou consolidação real de
  planilha acontece aqui — isso entra depois, em módulos próprios
  (ex: /assets/js/core/*.js).
*/

/*=============== SIDEBAR (mobile toggle) ===============*/
const headerToggle = document.getElementById("header-toggle");
const sidebar = document.getElementById("sidebar");

headerToggle.addEventListener("click", () => {
  sidebar.classList.toggle("show-sidebar");
});

/*=============== NAVEGAÇÃO: Consolidar / Buscar / Histórico / Dashboard ===============*/
const sidebarLinks = document.querySelectorAll(".sidebar__link");
const views = document.querySelectorAll(".view");

// Ordem das views na sidebar — define a direção da transição
// (indo pra frente nessa ordem = sobe; indo pra trás = desce).
const ORDEM_VIEWS = ["consolidar", "buscar", "dashboard", "historico"];

let trocandoView = false;

const iniciarTransicaoView = (viewAtual, viewAlvo) => {
  trocandoView = true;

  const indiceAtual = ORDEM_VIEWS.indexOf(viewAtual.dataset.view);
  const indiceAlvo = ORDEM_VIEWS.indexOf(viewAlvo.dataset.view);
  const direcao = indiceAlvo > indiceAtual ? "dir-forward" : "dir-backward";

  viewAtual.classList.remove("dir-forward", "dir-backward");
  viewAlvo.classList.remove("dir-forward", "dir-backward");
  viewAtual.classList.add(direcao);
  viewAlvo.classList.add(direcao);

  viewAtual.classList.remove("is-active");
  viewAtual.classList.add("is-leaving");

  let jaTrocou = false;

  const concluirTransicao = () => {
    if (jaTrocou) return;
    jaTrocou = true;

    viewAtual.removeEventListener("animationend", concluirTransicao);
    viewAtual.classList.remove("is-leaving", "dir-forward", "dir-backward");
    viewAlvo.classList.add("is-active");
    trocandoView = false;
  };

  viewAtual.addEventListener("animationend", concluirTransicao, { once: true });

  // Fallback (ex: prefers-reduced-motion, onde a animação não roda e
  // "animationend" nunca dispara) pra não travar a navegação pra sempre.
  setTimeout(concluirTransicao, 260);
};

const setActiveView = (target) => {
  const viewAlvo = [...views].find((view) => view.dataset.view === target);
  const viewAtual = document.querySelector(".view.is-active");

  if (!viewAlvo || viewAlvo === viewAtual) return;

  if (!viewAtual) {
    viewAlvo.classList.add("is-active");
    return;
  }

  iniciarTransicaoView(viewAtual, viewAlvo);
};

sidebarLinks.forEach((link) => {
  link.addEventListener("click", () => {
    if (trocandoView) return;

    sidebarLinks.forEach((l) => l.classList.remove("is-active"));
    link.classList.add("is-active");
    setActiveView(link.dataset.target);

    // No mobile, fecha o menu depois de escolher
    sidebar.classList.remove("show-sidebar");
  });
});

/*=============== CARDS: upload visual (drag & drop, seleção, remoção) ===============*/
const cards = document.querySelectorAll(".card");

// Marca (ou limpa) o campo "Recebido em" como erro. Só é obrigatório quando
// a companhia já tem arquivo selecionado — sem arquivo, o campo fica neutro.
const checkReceivedRequirement = (card) => {
  const receivedLabel = card.querySelector(".card__received");
  if (!receivedLabel) return true; // cards sem esse campo (ex: view Buscar/Dashboard) não têm exigência

  const receivedInput = receivedLabel.querySelector("[data-received]");
  const hasFile = card.classList.contains("has-file");
  const missing = hasFile && !receivedInput.value;

  receivedLabel.classList.toggle("card__received--error", missing);
  return !missing;
};

// Views que têm uma barra de resumo com botão de ação (Consolidar/Buscar/
// Histórico). O Dashboard (Fase 04) não tem botão — o processamento roda
// sozinho assim que o arquivo é validado — então fica de fora desse mapa.
const SUMMARY_SUFFIX_BY_VIEW = {
  consolidar: "",
  buscar: "-buscar",
  historico: "-historico"
};

let consolidacaoConcluida = false;
let buscaConcluida = false;
let consolidadoSessionDismissed = false;
let dashboardSessionDismissed = false;
let dashboardSessionAppliedFor = null;

const consolidadoSessionRevertBtn = document.getElementById("consolidado-session-revert");

if (consolidadoSessionRevertBtn) {
  consolidadoSessionRevertBtn.addEventListener("click", () => {
    consolidadoSessionDismissed = false;
    updateSummary();
  });
}

const dashboardSessionRevertBtn = document.getElementById("dashboard-session-revert");

if (dashboardSessionRevertBtn) {
  dashboardSessionRevertBtn.addEventListener("click", () => {
    dashboardSessionDismissed = false;
    updateSummary();
  });
}

const limparCardsDoGrupo = (containerId) => {
  document
    .querySelectorAll(`#${containerId} .card [data-remove]`)
    .forEach((btn) => btn.click());
};

const marcarConsolidacaoConcluida = () => {
  consolidacaoConcluida = true;
  consolidadoSessionDismissed = false;
  document.getElementById("company-cards").hidden = true;

  const btn = document.getElementById("btn-consolidar");
  btn.querySelector(".button-inner-static").textContent = "Refazer Consolidação";
  btn.querySelector(".button-inner-hover").textContent = "Refazer Consolidação";

  updateSummary();
};

const resetarConsolidacao = () => {
  consolidacaoConcluida = false;
  document.getElementById("company-cards").hidden = false;

  const btn = document.getElementById("btn-consolidar");
  btn.querySelector(".button-inner-static").textContent = "Consolidar";
  btn.querySelector(".button-inner-hover").textContent = "Consolidar";

  document.getElementById("consolidado-preview").hidden = true;
  document.getElementById("btn-baixar-consolidado").disabled = true;
  document.getElementById("duplicados-preview").hidden = true;
  document.getElementById("btn-baixar-duplicados").disabled = true;

  limparCardsDoGrupo("company-cards");
  updateSummary();
};

const marcarBuscaConcluida = () => {
  buscaConcluida = true;
  document.getElementById("buscar-cards").hidden = true;

  const btn = document.getElementById("btn-buscar");
  btn.querySelector(".button-inner-static").textContent = "Refazer Busca";
  btn.querySelector(".button-inner-hover").textContent = "Refazer Busca";

  updateSummary();
};

const resetarBusca = () => {
  buscaConcluida = false;
  document.getElementById("buscar-cards").hidden = false;

  const btn = document.getElementById("btn-buscar");
  btn.querySelector(".button-inner-static").textContent = "Buscar";
  btn.querySelector(".button-inner-hover").textContent = "Buscar";

  document.getElementById("enriquecido-preview").hidden = true;
  document.getElementById("btn-baixar-enriquecido").disabled = true;

  limparCardsDoGrupo("buscar-cards");
  updateSummary();
};

let historicoConcluida = false;

const marcarHistoricoConcluida = () => {
  historicoConcluida = true;
  document.getElementById("historico-cards").hidden = true;

  const btn = document.getElementById("btn-historico");
  btn.querySelector(".button-inner-static").textContent = "Refazer Atualização";
  btn.querySelector(".button-inner-hover").textContent = "Refazer Atualização";

  updateSummary();
};

const resetarHistorico = () => {
  historicoConcluida = false;
  document.getElementById("historico-cards").hidden = false;

  const btn = document.getElementById("btn-historico");
  btn.querySelector(".button-inner-static").textContent = "Atualizar e baixar";
  btn.querySelector(".button-inner-hover").textContent = "Atualizar e baixar";

  document.getElementById("historico-preview").hidden = true;

  limparCardsDoGrupo("historico-cards");
  updateSummary();
};

const updateConsolidadoSessionHint = () => {
  const card = document.querySelector('#view-buscar [data-company="consolidado"]');
  if (!card) return;

  const input = card.querySelector("[data-input]");
  const dropzone = card.querySelector(".dropzone");
  const fileRow = card.querySelector("[data-filerow]");
  const filenameEl = card.querySelector("[data-filename]");
  const hint = document.getElementById("consolidado-session-hint");
  const revertBtn = document.getElementById("consolidado-session-revert");
  const statusEl = card.querySelector("[data-status]");

  if (hint) hint.hidden = true;

  // Já tem um arquivo real selecionado — essa lógica de sessão não se aplica.
  if (input.files.length > 0) {
    if (revertBtn) revertBtn.hidden = true;
    return;
  }

  const sessionRows =
    window.ISA_CONSOLIDACAO &&
      typeof window.ISA_CONSOLIDACAO.getUltimoConsolidado === "function"
      ? window.ISA_CONSOLIDACAO.getUltimoConsolidado()
      : null;

  const hasRawSession = !!(sessionRows && sessionRows.length);

  // Sessão disponível e não removida: mostra como se fosse o arquivo selecionado.
  if (hasRawSession && !consolidadoSessionDismissed) {
    dropzone.hidden = true;
    fileRow.hidden = false;
    filenameEl.textContent = "Consolidado desta sessão";
    card.classList.add("has-file");
    statusEl.textContent = "Sessão";
    statusEl.className = "status status--valid";
    if (revertBtn) revertBtn.hidden = true;
    return;
  }

  // Sessão disponível mas removida pelo usuário: volta pro dropzone normal
  // (pra poder enviar outro arquivo) e mostra o botão de reverter ao lado.
  if (hasRawSession && consolidadoSessionDismissed) {
    dropzone.hidden = false;
    fileRow.hidden = true;
    card.classList.remove("has-file");
    statusEl.textContent = "Vazio";
    statusEl.className = "status status--empty";
    if (revertBtn) revertBtn.hidden = false;
    return;
  }

  // Sem sessão nenhuma: estado padrão vazio.
  dropzone.hidden = false;
  fileRow.hidden = true;
  card.classList.remove("has-file");
  statusEl.textContent = "Vazio";
  statusEl.className = "status status--empty";
  if (revertBtn) revertBtn.hidden = true;
};

// Mesmo esquema do card do Consolidado acima, mas pro Consolidado Agro
// Enriquecido gerado na Fase 02 (Buscar e enriquecer): assim que a busca
// termina, o card do Dashboard já mostra esse arquivo como selecionado
// (sem precisar baixar e reenviar) — com botão pra trocar/remover e outro
// pra trazer a sessão de volta caso tenha sido removida.
const updateDashboardSessionCard = () => {
  const card = document.querySelector('#view-dashboard [data-company="dashboard"]');
  if (!card) return;

  const input = card.querySelector("[data-input]");
  const dropzone = card.querySelector(".dropzone");
  const fileRow = card.querySelector("[data-filerow]");
  const filenameEl = card.querySelector("[data-filename]");
  const revertBtn = document.getElementById("dashboard-session-revert");
  const statusEl = card.querySelector("[data-status]");

  // Já tem um arquivo real selecionado — essa lógica de sessão não se aplica.
  if (input.files.length > 0) {
    if (revertBtn) revertBtn.hidden = true;
    return;
  }

  const sessionRows =
    window.ISA_BUSCA &&
      typeof window.ISA_BUSCA.getUltimoEnriquecido === "function"
      ? window.ISA_BUSCA.getUltimoEnriquecido()
      : null;

  const hasSession = !!(sessionRows && sessionRows.length);

  // Sessão disponível e não removida: mostra como se fosse o arquivo
  // selecionado e (re)monta o dashboard com essas linhas.
  if (hasSession && !dashboardSessionDismissed) {
    dropzone.hidden = true;
    fileRow.hidden = false;
    filenameEl.textContent = "Consolidado Agro Enriquecido desta sessão";
    card.classList.add("has-file");
    statusEl.textContent = "Sessão";
    statusEl.className = "status status--valid";
    if (revertBtn) revertBtn.hidden = true;

    if (dashboardSessionAppliedFor !== sessionRows) {
      dashboardSessionAppliedFor = sessionRows;

      if (
        window.ISA_DASHBOARD &&
        typeof window.ISA_DASHBOARD.processarLinhas === "function"
      ) {
        window.ISA_DASHBOARD
          .processarLinhas(sessionRows, "Consolidado Agro Enriquecido desta sessão")
          .catch((error) => {
            console.error("Erro ao montar o dashboard a partir da sessão:", error);
          });
      }
    }

    return;
  }

  // Deixou de mostrar a sessão (removida ou ainda não existe) — próxima vez
  // que ela reaparecer, reprocessa (não fica "grudado" num estado antigo).
  dashboardSessionAppliedFor = null;

  // Sessão disponível mas removida pelo usuário: volta pro dropzone normal
  // (pra poder enviar outro arquivo) e mostra o botão de reverter ao lado.
  if (hasSession && dashboardSessionDismissed) {
    dropzone.hidden = false;
    fileRow.hidden = true;
    card.classList.remove("has-file");
    statusEl.textContent = "Vazio";
    statusEl.className = "status status--empty";
    if (revertBtn) revertBtn.hidden = false;
    return;
  }

  // Sem sessão nenhuma: estado padrão vazio.
  dropzone.hidden = false;
  fileRow.hidden = true;
  card.classList.remove("has-file");
  statusEl.textContent = "Vazio";
  statusEl.className = "status status--empty";
  if (revertBtn) revertBtn.hidden = true;
};

const updateSummary = () => {
  updateConsolidadoSessionHint();
  updateDashboardSessionCard();

  document.querySelectorAll(".cards").forEach((group) => {
    const viewName = group.closest(".view").dataset.view;

    if (!(viewName in SUMMARY_SUFFIX_BY_VIEW)) {
      // Sem barra de resumo/botão nessa view — só garante que o aviso de
      // "Recebido em" (quando existir esse campo) continue coerente.
      group.querySelectorAll(".card").forEach((card) => {
        checkReceivedRequirement(card);
      });

      return;
    }

    const groupCards = group.querySelectorAll(".card");
    const filled = [...groupCards].filter((c) => c.classList.contains("has-file")).length;
    const total = groupCards.length;

    const suffix = SUMMARY_SUFFIX_BY_VIEW[viewName];

    const countEl = document.getElementById(`summary-count${suffix}`);
    const statusEl = document.getElementById(`summary-status${suffix}`);
    const btnEl = document.getElementById(
      viewName === "consolidar" ? "btn-consolidar" :
        viewName === "buscar" ? "btn-buscar" :
          "btn-historico"
    );

    if (!countEl) return;

    countEl.textContent = `${filled} de ${total}`;

    let missingReceived = false;

    groupCards.forEach((card) => {
      const cardHasValidReceivedDate = checkReceivedRequirement(card);
      if (!cardHasValidReceivedDate) missingReceived = true;
    });

    let ready = false;

    if (viewName === "consolidar") {

      ready = filled > 0 && !missingReceived;

    } else if (viewName === "buscar") {

      const buscarCards = [...groupCards];
      const consolidado = buscarCards.find((c) => c.dataset.company === "consolidado");
      const historico = buscarCards.find((c) => c.dataset.company === "historico");
      const bi = buscarCards.find((c) => c.dataset.company === "bi");
      const hubspot = buscarCards.find((c) => c.dataset.company === "hubspot");

      const hasConsolidadoFile = consolidado?.classList.contains("has-file");

      const hasConsolidadoSession = !!(
        window.ISA_CONSOLIDACAO &&
        typeof window.ISA_CONSOLIDACAO.getUltimoConsolidado === "function" &&
        window.ISA_CONSOLIDACAO.getUltimoConsolidado()?.length
      );

      const hasConsolidado = hasConsolidadoFile || hasConsolidadoSession;
      const hasHistorico = historico?.classList.contains("has-file");
      const hasBI = bi?.classList.contains("has-file");
      const hasHubspot = hubspot?.classList.contains("has-file");

      ready = hasConsolidado && (hasHistorico || hasBI || hasHubspot);

    } else if (viewName === "historico") {

      // Fase 03 exige os 2 arquivos: Consolidado e Histórico.
      ready = filled === total;

    }

    if (filled === 0) {
      statusEl.textContent = "Aguardando arquivos";
      statusEl.className = "status status--empty";
    } else if (missingReceived) {
      statusEl.textContent = 'Falta informar "Recebido em"';
      statusEl.className = "status status--validating";
    } else if (ready) {
      statusEl.textContent = "Pronto para processar";
      statusEl.className = "status status--valid";
    } else {
      statusEl.textContent = "Faltam arquivos";
      statusEl.className = "status status--validating";
    }

    btnEl.disabled = !ready;

    if (viewName === "consolidar" && consolidacaoConcluida) {
      btnEl.disabled = false;
    }

    if (viewName === "buscar" && buscaConcluida) {
      btnEl.disabled = false;
    }

    if (viewName === "historico" && historicoConcluida) {
      btnEl.disabled = false;
    }
  });
};

// Liga os eventos de upload de um card. Fica separado pra poder ser chamado
// também nos cards criados depois do carregamento (companhias adicionadas).
const inicializarCard = (card) => {
  const input = card.querySelector("[data-input]");
  const dropzone = card.querySelector(".dropzone");
  const fileRow = card.querySelector("[data-filerow]");
  const filenameEl = card.querySelector("[data-filename]");
  const statusEl = card.querySelector("[data-status]");
  const removeBtn = card.querySelector("[data-remove]");
  const receivedInput = card.querySelector("[data-received]");

  const showFile = (name) => {
    filenameEl.textContent = name;
    dropzone.hidden = true;
    fileRow.hidden = false;
    statusEl.textContent = "Selecionado";
    statusEl.className = "status status--valid";
    card.classList.add("has-file");

    const receivedLabel = card.querySelector(".card__received");
    if (receivedLabel) receivedLabel.hidden = false;

    updateSummary();
  };

  const clearFile = () => {
    input.value = "";
    filenameEl.textContent = "";

    if (receivedInput) {
      receivedInput.value = "";
    }

    dropzone.hidden = false;
    fileRow.hidden = true;

    statusEl.textContent = "Vazio";
    statusEl.className =
      "status status--empty";

    card.classList.remove("has-file");

    const receivedLabel =
      card.querySelector(
        ".card__received"
      );

    if (receivedLabel) {
      receivedLabel.classList.remove(
        "card__received--error"
      );
      receivedLabel.hidden = true;
    }

    // Dashboard (Fase 04): removendo o arquivo, volta pro estado vazio.
    if (card.dataset.company === "dashboard") {

      if (
        window.ISA_DASHBOARD &&
        typeof window.ISA_DASHBOARD.voltarParaVazio === "function"
      ) {

        window.ISA_DASHBOARD.voltarParaVazio();

      } else {

        const dashEmpty = document.getElementById("dash-empty");
        const dashContent = document.getElementById("dash-content");

        if (dashEmpty && dashContent) {
          dashContent.hidden = true;
          dashEmpty.hidden = false;
        }

      }

    }

    updateSummary();
  };

  const handleNovoArquivo = async (file) => {
    if (!file) return;

    const viewName = card.closest(".view").dataset.view;
    const companyKey = card.dataset.company;

    statusEl.textContent = "Validando...";
    statusEl.className = "status status--validating";

    let resultado;

    try {
      resultado = await window.ISA_VALIDACAO.validarArquivo(
        viewName,
        companyKey,
        file
      );
    } catch (error) {
      console.error("Erro ao validar arquivo:", error);

      input.value = "";
      statusEl.textContent = "Vazio";
      statusEl.className = "status status--empty";

      showErrorModal(
        `Não foi possível ler o arquivo "${file.name}". Verifique se é uma planilha Excel válida.`,
        [error.message]
      );

      return;
    }

    if (!resultado.valido) {
      input.value = "";
      statusEl.textContent = "Vazio";
      statusEl.className = "status status--empty";

      showErrorModal(
        `O arquivo "${file.name}" não parece ser um relatório de ${resultado.rotulo}. Confira as colunas abaixo:`,
        resultado.mensagens,
        "Arquivo inválido"
      );

      return;
    }

    showFile(file.name);

    if (companyKey === "consolidado") {
      consolidadoSessionDismissed = false;
    }

    // Dashboard (Fase 04): sem botão — assim que o arquivo é validado,
    // já monta a visão geral e a comparação com a execução anterior.
    if (companyKey === "dashboard") {
      dashboardSessionDismissed = false;

      try {
        await window.ISA_DASHBOARD.processarArquivo(file);
      } catch (error) {
        console.error("Erro ao montar o dashboard:", error);

        showErrorModal(
          "Não foi possível montar o dashboard a partir desse arquivo.",
          [error.message],
          "Não deu pra montar o dashboard"
        );
      }
    }
  };

  input.addEventListener("change", () => {
    if (input.files.length > 0) {
      handleNovoArquivo(input.files[0]);
    }
  });

  removeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (card.dataset.company === "consolidado" && !input.files.length) {
      consolidadoSessionDismissed = true;
      clearFile();
      return;
    }

    if (card.dataset.company === "dashboard" && !input.files.length) {
      dashboardSessionDismissed = true;
      clearFile();
      return;
    }

    clearFile();
  });

  if (receivedInput) {
    receivedInput.addEventListener("input", updateSummary);
  }

  ["dragenter", "dragover"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("is-dragover");
    });
  });

  ["dragleave", "drop"].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("is-dragover");
    });
  });

  dropzone.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files[0];
    if (file) {
      input.files = e.dataTransfer.files;
      handleNovoArquivo(file);
    }
  });
};

cards.forEach(inicializarCard);

/*=============== TELA DE CARREGAMENTO ===============*/
const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-overlay-text");
const loadingProgress = document.getElementById("loading-overlay-progress");
const loadingCount = document.getElementById("loading-overlay-count");
const loadingBar = document.getElementById("loading-overlay-bar");

// progresso (opcional): { atual, total, rotulo } — mostra contador e barra.
const showLoading = (message, progresso = null) => {
  loadingText.textContent = message;

  if (progresso && progresso.total > 0) {
    const pct = Math.min(100, Math.round((progresso.atual / progresso.total) * 100));

    loadingCount.innerHTML =
      `<strong>${progresso.atual}</strong><span>de ${progresso.total} ${progresso.rotulo || ""}</span>`;
    loadingBar.style.width = `${pct}%`;
    loadingProgress.hidden = false;
    loadingOverlay.classList.add("has-progress");
  } else {
    loadingProgress.hidden = true;
    loadingOverlay.classList.remove("has-progress");
  }

  loadingOverlay.classList.add("is-active");
  loadingOverlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
};

const hideLoading = () => {
  loadingOverlay.classList.remove("is-active");
  loadingOverlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
};

/*=============== MODAIS (erro / informação / confirmação) ===============*/
const errorModal = document.getElementById("error-modal");
const errorModalTitle = document.getElementById("error-modal-title");
const errorModalIcon = document.getElementById("error-modal-icon");
const errorModalMessage = document.getElementById("error-modal-message");
const errorModalList = document.getElementById("error-modal-list");
const errorModalClose = document.getElementById("error-modal-close");

let focoAntesErro = null;
let focoAntesConfirm = null;

const restaurarFoco = (el) => {
  if (el && document.contains(el) && typeof el.focus === "function") {
    el.focus();
  }
};

const abrirModalMensagem = ({ titulo, mensagem, itens = [], tipo }) => {
  if (!errorModal.classList.contains("is-active")) {
    focoAntesErro = document.activeElement;
  }

  const info = tipo === "info";

  errorModalTitle.textContent = titulo;
  errorModalMessage.textContent = mensagem;
  errorModalList.innerHTML = "";
  itens.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    errorModalList.appendChild(li);
  });
  errorModalList.hidden = itens.length === 0;

  errorModal.classList.toggle("is-info", info);
  errorModalIcon.classList.toggle("modal__icon--ok", info);
  errorModalIcon.innerHTML =
    `<i class="${info ? "ri-checkbox-circle-line" : "ri-error-warning-line"}"></i>`;

  errorModal.classList.add("is-active");
  errorModal.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => errorModalClose.focus());
};

const showErrorModal = (message, items = [], title = "Atenção") => {
  abrirModalMensagem({ titulo: title, mensagem: message, itens: items, tipo: "erro" });
};

const showInfoModal = (title, message, items = []) => {
  abrirModalMensagem({ titulo: title, mensagem: message, itens: items, tipo: "info" });
};

const hideErrorModal = () => {
  errorModal.classList.remove("is-active");
  errorModal.setAttribute("aria-hidden", "true");

  restaurarFoco(focoAntesErro);
  focoAntesErro = null;
};

errorModalClose.addEventListener("click", hideErrorModal);
errorModal.addEventListener("click", (e) => {
  if (e.target === errorModal) hideErrorModal();
});

const confirmModal = document.getElementById("confirm-modal");
const confirmModalTitle = document.getElementById("confirm-modal-title");
const confirmModalMessage = document.getElementById("confirm-modal-message");
const confirmModalCancel = document.getElementById("confirm-modal-cancel");
const confirmModalConfirm = document.getElementById("confirm-modal-confirm");

const CONFIRM_PADRAO = {
  titulo: "Tem certeza?",
  cancelar: "Adicionar Mais",
  confirmar: "Continuar"
};

let confirmCallback = null;
let confirmCancelCallback = null;

const showConfirmModal = (message, onConfirm, onCancel = null, rotulos = {}) => {
  const r = { ...CONFIRM_PADRAO, ...rotulos };

  if (!confirmModal.classList.contains("is-active")) {
    focoAntesConfirm = document.activeElement;
  }

  confirmModalTitle.textContent = r.titulo;
  confirmModalCancel.textContent = r.cancelar;
  confirmModalConfirm.textContent = r.confirmar;
  confirmModalMessage.innerHTML = message;
  confirmCallback = onConfirm;
  confirmCancelCallback = onCancel;

  confirmModal.classList.add("is-active");
  confirmModal.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => confirmModalConfirm.focus());
};

const hideConfirmModal = () => {
  confirmModal.classList.remove("is-active");
  confirmModal.setAttribute("aria-hidden", "true");

  confirmCallback = null;
  confirmCancelCallback = null;

  restaurarFoco(focoAntesConfirm);
  focoAntesConfirm = null;
};

confirmModalCancel.addEventListener("click", () => {
  const callback = confirmCancelCallback;

  hideConfirmModal();

  if (callback) callback();
});

confirmModal.addEventListener("click", (e) => {
  if (e.target === confirmModal) confirmModalCancel.click();
});

confirmModalConfirm.addEventListener("click", () => {
  const callback = confirmCallback;
  hideConfirmModal();
  if (callback) callback();
});

/*=============== MODAL: RELATÓRIOS GERADOS ===============*/
const relatoriosModal = document.getElementById("relatorios-modal");
const relatoriosModalTitle = document.getElementById("relatorios-modal-title");
const relatoriosModalContador = document.getElementById("relatorios-modal-contador");
const relatoriosModalBarra = document.getElementById("relatorios-modal-barra");
const relatoriosModalLista = document.getElementById("relatorios-modal-lista");
const relatoriosModalAviso = document.getElementById("relatorios-modal-aviso");
const relatoriosModalClose = document.getElementById("relatorios-modal-close");

let focoAntesRelatorios = null;

// gerados: [{ nome, arquivo }]; aviso: texto opcional exibido no rodapé.
const showRelatoriosModal = ({ titulo, gerados = [], total, aviso = "" }) => {
  if (!relatoriosModal.classList.contains("is-active")) {
    focoAntesRelatorios = document.activeElement;
  }

  const qtd = gerados.length;
  const totalReal = total || qtd;
  const pct = totalReal ? Math.round((qtd / totalReal) * 100) : 0;

  relatoriosModalTitle.textContent =
    titulo || (totalReal === 1 ? "Relatório gerado" : "Relatórios gerados");

  relatoriosModalContador.innerHTML =
    `<strong>${qtd}</strong>` +
    `<span>de ${totalReal} relatório${totalReal === 1 ? "" : "s"} ` +
    `gerado${totalReal === 1 ? "" : "s"}</span>`;

  relatoriosModalBarra.style.width = `${pct}%`;

  relatoriosModalLista.innerHTML = "";
  gerados.forEach((item) => {
    const li = document.createElement("li");
    li.className = "rel-modal__item";

    const textos = document.createElement("div");
    textos.className = "rel-modal__textos";

    const nome = document.createElement("strong");
    nome.textContent = item.nome;
    textos.appendChild(nome);

    if (item.arquivo) {
      const arquivo = document.createElement("span");
      arquivo.textContent = item.arquivo;
      textos.appendChild(arquivo);
    }

    const icone = document.createElement("i");
    icone.className = item.arquivo && /\.csv$/i.test(item.arquivo)
      ? "ri-file-text-line"
      : "ri-file-excel-2-line";
    icone.setAttribute("aria-hidden", "true");

    li.append(textos, icone);
    relatoriosModalLista.appendChild(li);
  });
  relatoriosModalLista.hidden = qtd === 0;

  relatoriosModalAviso.querySelector("span").textContent = aviso;
  relatoriosModalAviso.hidden = !aviso;

  relatoriosModal.classList.add("is-active");
  relatoriosModal.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => relatoriosModalClose.focus());
};

const hideRelatoriosModal = () => {
  relatoriosModal.classList.remove("is-active");
  relatoriosModal.setAttribute("aria-hidden", "true");

  restaurarFoco(focoAntesRelatorios);
  focoAntesRelatorios = null;
};

relatoriosModalClose.addEventListener("click", hideRelatoriosModal);
relatoriosModal.addEventListener("click", (e) => {
  if (e.target === relatoriosModal) hideRelatoriosModal();
});

// Esc fecha o modal que estiver por cima (erro > confirmação > comparar com pagos > menu mobile).
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;

  if (errorModal.classList.contains("is-active")) {
    hideErrorModal();
    return;
  }

  if (confirmModal.classList.contains("is-active")) {
    confirmModalCancel.click();
    return;
  }

  if (relatoriosModal.classList.contains("is-active")) {
    hideRelatoriosModal();
    return;
  }

  const companhiasModal = document.getElementById("companhias-modal");

  if (companhiasModal && companhiasModal.classList.contains("is-active")) {
    const btnFechar = document.getElementById("companhias-modal-cancel");
    if (btnFechar) btnFechar.click();
    return;
  }

  const pagosModal = document.getElementById("pagos-modal");

  if (pagosModal && pagosModal.classList.contains("is-active")) {
    const btnFechar = document.getElementById("pagos-modal-cancel");
    if (btnFechar) btnFechar.click();
    return;
  }

  sidebar.classList.remove("show-sidebar");
});

// Expõe pros demais módulos usarem sem duplicar código.
window.ISA_UI = {
  showLoading,
  hideLoading,
  showErrorModal,
  showInfoModal,
  hideErrorModal,
  showConfirmModal,
  showRelatoriosModal,
  inicializarCard,
  atualizarResumo: updateSummary
};

/*=============== AÇÕES DOS BOTÕES ===============*/
document
  .getElementById("btn-consolidar")
  .addEventListener(
    "click",
    async () => {
      if (consolidacaoConcluida) {
        showConfirmModal(
          "A pré-visualização atual vai desaparecer e os campos de upload vão reaparecer — você vai precisar enviar os arquivos novamente. Deseja continuar?",
          resetarConsolidacao,
          null,
          { cancelar: "Cancelar" }
        );

        return;
      }

      if (
        !window.ISA_CONSOLIDACAO ||
        typeof window.ISA_CONSOLIDACAO
          .runConsolidacao !== "function"
      ) {
        showErrorModal(
          "O módulo de consolidação não foi carregado.",
          [
            "Verifique o arquivo consolidacao.js",
            "Atualize a página com Ctrl + F5"
          ]
        );

        return;
      }

      await window.ISA_CONSOLIDACAO
        .runConsolidacao();

      if (!document.getElementById("consolidado-preview").hidden) {
        marcarConsolidacaoConcluida();
      }
    }
  );

document.getElementById("btn-baixar-consolidado").addEventListener(
  "click",
  () => {
    window.ISA_CONSOLIDACAO.baixarConsolidado();
  }
);

document.getElementById("btn-baixar-duplicados").addEventListener(
  "click",
  () => {
    window.ISA_CONSOLIDACAO.baixarDuplicados();
  }
);

document.getElementById("btn-buscar").addEventListener(
  "click",
  async () => {

    if (buscaConcluida) {
      showConfirmModal(
        "A pré-visualização atual vai desaparecer e os campos de upload vão reaparecer — você vai precisar enviar os arquivos novamente. Deseja continuar?",
        resetarBusca,
        null,
        { cancelar: "Cancelar" }
      );

      return;
    }

    await window.ISA_BUSCA.runBusca();

    if (!document.getElementById("enriquecido-preview").hidden) {
      marcarBuscaConcluida();
    }

  }
);

document.getElementById("btn-baixar-enriquecido").addEventListener(
  "click",
  () => {
    window.ISA_BUSCA.baixarEnriquecido();
  }
);

document.getElementById("btn-historico").addEventListener(
  "click",
  async () => {
    if (historicoConcluida) {
      showConfirmModal(
        "O resultado atual vai desaparecer e os campos de upload vão reaparecer — você vai precisar enviar os arquivos novamente. Deseja continuar?",
        resetarHistorico,
        null,
        { cancelar: "Cancelar" }
      );

      return;
    }

    await window.ISA_HISTORICO.runAtualizarHistorico();

    if (!document.getElementById("historico-preview").hidden) {
      marcarHistoricoConcluida();
    }
  }
);