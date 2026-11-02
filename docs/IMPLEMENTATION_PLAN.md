# Kowope Prototype Implementation Plan

## Source of truth

- Use `design/ledgerly-prototype.html` for copy, visual tokens, layout, and interaction behavior.
- Keep the existing Vite/React frontend and Node/Express API stack.

## Frontend files

- `src/main.jsx` — route state, screens, editor, preview, drawers, modals, and state hooks.
- `src/styles.css` — shared prototype tokens, responsive shell, cards, tables, pills, editor, preview, and dark mode.
- `src/components/` — reusable shell, buttons, pills, cards, tables, dialogs, drawers, toasts, and loaders.
- `src/services/api.js` — typed client API helpers for invoices, clients, payments, businesses, currencies, integrations, and recurring schedules.

## Backend files

- `server/index.js` — Express route registration only.
- `server/db/schema.js` — fresh schema.
- `server/db/migrations.js` — versioned migrations only.
- `server/db/index.js` — SQLite connection and migration runner.
- `server/services/` — invoice totals, PDF rendering, provider interfaces, payment handling, and recurring generation.
- `server/routes/` — invoices, clients, payments, businesses, currencies, integrations, recurring, and webhook routes.

## Delivery phases

1. Port the prototype shell, tokens, routing, reusable UI, screens, and invoice editor/preview.
2. Extend persistence for businesses, currencies, line items, taxes, discounts, payments, integrations, and recurring schedules.
3. Implement invoice actions, payments, client drawer, settings, and live PDF-preview parity.
4. Implement provider interfaces, setup flows, encrypted credentials, and webhooks.
5. Implement recurring generation, CLI runner, tests, fidelity screenshots, and documentation.

## Verification

- Preserve existing local data with versioned migrations.
- Run lint, type checks, tests, and production build after each phase.
- Compare prototype and implementation at desktop/mobile light/dark sizes.
