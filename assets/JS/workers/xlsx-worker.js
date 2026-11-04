/*
  xlsx-worker.js
  Web Worker dedicado a rodar o parsing pesado do SheetJS (XLSX.read +
  sheet_to_json) fora da main thread, pra não travar a interface durante
  a leitura de arquivos grandes.

  Recebe { id, arrayBuffer, xlsxOptions, sheetToJsonOptions } e devolve
  { id, ok, sheetExists, data } ou { id, ok:false, error }. Não conhece
  nenhuma regra de negócio do ISA Agro — só faz a conversão bruta da
  planilha (a primeira aba do arquivo). Toda a lógica de negócio
  continua nos módulos da main thread, que só passam a receber os dados
  já convertidos em vez de convertê-los eles mesmos.
*/

let bibliotecaCarregada = false;
let erroCarregamento = null;

try {
    importScripts(
        "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"
    );
    bibliotecaCarregada = true;
} catch (error) {
    erroCarregamento = error;
}

self.onmessage = function (event) {
    const {
        id,
        arrayBuffer,
        xlsxOptions,
        sheetToJsonOptions
    } = event.data;

    if (!bibliotecaCarregada) {
        self.postMessage({
            id,
            ok: false,
            error:
                "Não foi possível carregar a biblioteca de planilhas no worker: " +
                (erroCarregamento
                    ? erroCarregamento.message
                    : "motivo desconhecido")
        });

        return;
    }

    try {
        const workbook = XLSX.read(
            arrayBuffer,
            xlsxOptions || { type: "array" }
        );

        const firstSheetName = workbook.SheetNames[0];
        const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;

        if (!sheet) {
            self.postMessage({ id, ok: true, sheetExists: false, data: null });
            return;
        }

        const data = XLSX.utils.sheet_to_json(
            sheet,
            sheetToJsonOptions || { defval: "" }
        );

        self.postMessage({ id, ok: true, sheetExists: true, data });

    } catch (error) {
        self.postMessage({ id, ok: false, error: error.message });
    }
};