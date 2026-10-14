/*
  xlsx-worker-client.js
  Ponte entre a main thread e assets/JS/workers/xlsx-worker.js.

  Expõe window.ISA_XLSX_WORKER.parseWorkbook(file, { xlsxOptions,
  sheetToJsonOptions }), que devolve uma Promise com
  { sheetExists, data } — mesmo formato que os módulos já esperavam de
  XLSX.read + XLSX.utils.sheet_to_json, só que rodando fora da main
  thread. Um único worker é reaproveitado entre chamadas; cada chamada
  tem um id próprio pra permitir várias leituras "em paralelo" (ex: os
  8 arquivos da Fase 01) sem misturar respostas.
*/

(() => {
    "use strict";

    const WORKER_PATH = "assets/JS/workers/xlsx-worker.js";

    let worker = null;
    let proximoId = 1;

    const pendentes = new Map();

    function obterWorker() {
        if (worker) return worker;

        worker = new Worker(WORKER_PATH);

        worker.onmessage = (event) => {
            const { id, ok, sheetExists, data, error } = event.data;

            const pendente = pendentes.get(id);
            if (!pendente) return;

            pendentes.delete(id);

            if (!ok) {
                pendente.reject(new Error(error));
                return;
            }

            pendente.resolve({ sheetExists, data });
        };

        worker.onerror = (event) => {
            const mensagem =
                event.message || "Erro inesperado no worker de planilhas.";

            pendentes.forEach((pendente) => {
                pendente.reject(new Error(mensagem));
            });

            pendentes.clear();
        };

        return worker;
    }

    async function parseWorkbook(file, options = {}) {
        const { xlsxOptions, sheetToJsonOptions } = options;

        const arrayBuffer = await file.arrayBuffer();

        const workerInstance = obterWorker();
        const id = proximoId++;

        return new Promise((resolve, reject) => {
            pendentes.set(id, { resolve, reject });

            workerInstance.postMessage(
                { id, arrayBuffer, xlsxOptions, sheetToJsonOptions },
                [arrayBuffer]
            );
        });
    }

    window.ISA_XLSX_WORKER = { parseWorkbook };

})();