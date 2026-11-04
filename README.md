# ISAgro — Integração de Seguros Agro

## Estrutura
```
ISAgro/
├── index.html
├── LEIAME.md
└── assets/
    ├── CSS/
    │   └── styles.css
    └── JS/
        ├── company-mappings.js     → window.COMPANY_MAPPINGS (lê data/config.json)
        ├── rules.js                → window.ISA_RULES
        ├── preview-table.js        → tabela de pré-visualização
        ├── validacao.js            → window.ISA_VALIDACAO
        ├── consolidacao.js         → window.ISA_CONSOLIDACAO (Fase 01)
        ├── busca-enriquecimento.js → window.ISA_BUSCA (Fase 02)
        ├── dashboard.js            → window.ISA_DASHBOARD (Fase 03)
        ├── atualizar-historico.js  → window.ISA_HISTORICO (Fase 04)
        ├── main.js                 → window.ISA_UI / navegação entre views
        ├── xlsx-worker-client.js   → window.ISA_XLSX_WORKER
        ├── data/
        │   └── config.json         → seguradoras, mapTo, pagos, hubspot, colunas, BI
        └── workers/
            └── xlsx-worker.js
```

## Ordem dos scripts no index.html
xlsx-js-style (CDN) → xlsx-worker-client → company-mappings → rules → preview-table → consolidacao → busca-enriquecimento → atualizar-historico → dashboard → validacao → main

## Fases
1. Consolidar → Consolidado Agro.xlsx
2. Buscar e enriquecer → Consolidado Agro Enriquecido.xlsx
3. Dashboard (localStorage: isaAgroDashboardHistory)
4. Atualizar histórico → Historico Agro.xlsx

## Status
Funcional (4 fases implementadas).
