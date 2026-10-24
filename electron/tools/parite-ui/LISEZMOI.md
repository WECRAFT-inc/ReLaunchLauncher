# Parité de l'interface (lot E6)

Compare le DOM de l'ancienne interface (prototype, avant E6) et de la nouvelle (React) sur des scénarios
identiques, dans Chromium (Playwright), avec la même CSP et un faux processus principal.

1. Construire l'ancienne interface (commit `b5738a7`, branche `electron/e5-mise-a-jour`) dans `/tmp/claude-0/old-renderer`.
2. Construire la nouvelle (`npm run build`).
3. `node tools/parite-ui/run.mjs tools/parite-ui/sc1.json` (puis sc2…sc5) ; `python3 tools/parite-ui/diff.py <scénario>`
   montre les différences d'un scénario.

Différences attendues : contenu laissé par l'ancienne version dans des éléments cachés, et les changements voulus
notés dans docs/SUIVI_MISE_A_JOUR.md (lot E6).
