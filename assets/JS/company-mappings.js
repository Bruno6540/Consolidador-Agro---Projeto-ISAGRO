/*
  company-mappings.js
 
  Carrega assets/JS/data/config.json (cards das companhias, mapeamento
  "coluna da companhia" -> "coluna do Consolidado Agro" e o de-para de
  Filial por Agente) e monta:
    - window.COMPANY_MAPPINGS (mesmo formato de antes, usado pela
      consolidação e pela validação de cabeçalho)
    - window.ISA_FILIAL_MAP (usado na Fase 02 pra preencher Filial)
    - os cards da Fase 01 (#company-cards), que antes eram fixos no
      index.html
 
  Carregamento é síncrono (XMLHttpRequest) de propósito: este script
  roda antes de rules.js/consolidacao.js/main.js, que dependem de
  window.COMPANY_MAPPINGS já existir na primeira execução.
*/
 
(() => {
  "use strict";
 
  const CONFIG_PATH = "assets/JS/data/config.json";
 
  function carregarConfigSync() {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", CONFIG_PATH, false);
    xhr.send(null);
 
    if (xhr.status !== 200 && xhr.status !== 0) {
      throw new Error(
        `Não foi possível carregar ${CONFIG_PATH} (status ${xhr.status}).`
      );
    }
 
    return JSON.parse(xhr.responseText);
  }
 
  function montarCards(companies) {
    const container = document.getElementById("company-cards");
    if (!container) return;
 
    let indice = 0;
 
    Object.entries(companies).forEach(([key, empresa]) => {
      const article = document.createElement("article");
      article.className = "card reveal";
      article.dataset.company = key;
      article.style.setProperty("--i", indice);
 
      article.innerHTML = `
                <div class="card__tab">${empresa.tab}</div>
                <div class="card__body">
                    <div class="card__head">
                        <h3>${empresa.label}</h3>
                        <span class="status status--empty" data-status>Vazio</span>
                    </div>
                    <label class="dropzone">
                        <input type="file" accept=".xlsx,.xls,.xlsm" hidden data-input>
                        <i class="ri-upload-cloud-2-line"></i>
                        <span class="dropzone__text">Arraste o arquivo ou <em>clique para selecionar</em></span>
                    </label>
                    <div class="card__file" hidden data-filerow>
                        <i class="ri-file-excel-2-line"></i>
                        <span class="card__filename" data-filename></span>
                        <button class="card__remove" type="button" data-remove aria-label="Remover arquivo">
                            <i class="ri-close-line"></i>
                        </button>
                    </div>
                    <label class="card__received" hidden>
                        <span>Recebido em:</span>
                        <input type="date" data-received>
                    </label>
                </div>
            `;
 
      container.appendChild(article);
      indice++;
    });
  }
 
  const config = carregarConfigSync();
 
  const COMPANY_MAPPINGS = {};
 
  Object.entries(config.companies).forEach(([key, empresa]) => {
    COMPANY_MAPPINGS[key] = {
      label: empresa.label,
      officialName: empresa.officialName,
      columns: empresa.columns,
      mapTo: empresa.mapTo
    };
  });
 
  montarCards(config.companies);
 
  window.COMPANY_MAPPINGS = COMPANY_MAPPINGS;
  window.ISA_FILIAL_MAP = config.filialPorAgente || {};
  window.ISA_CONFIG = config;
 
})();