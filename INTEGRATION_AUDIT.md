# Kowope integration audit — baseline application vs prior patches

## Source precedence

The user's `kowope.zip` is the functional baseline. The separately supplied
`index(2).js`, `index(3).js`, `settings(1).js`, `invoice-numbering(1).js`,
`recurrence(2).js`, database adapters and versioned migrations were reviewed
and consolidated into the existing app structure. Original stylesheet and
security modules are retained. No `node_modules` is included.

## Findings corrected

| Finding in previous integration | Remediation in this source tree |
| --- | --- |
| Async PostgreSQL initializer with synchronous SQLite routes | API uses awaited database calls and a single async initializer |
| PostgreSQL-only guard blocked the SQLite application | Removed; adapter selected via `DATABASE_CLIENT` |
| `getDueRecurringSchedules`, `lockRecurring`, `lockInvoiceNumbering` inconsistent between service and adapters | Both adapters expose the required methods; common contract includes the locks |
| Recurring invoices hardcoded `INV-` and count-based numbering | Both recurring/manual invoices use `server/services/invoice-numbering.js` |
| Numbering settings modified business `0` regardless of selection | Settings select an explicit business, PATCH only numbering fields |
| Invoice editor omitted `businessProfileId` | Selected business ID transmitted on new invoices and schedules |
| Old invoice drafts used `editor.items` but editor state uses `lineItems` | Editor and preview share JSX components and common line item state |
| UI relied on inline HTML string templates and `innerHTML` | UI pages/modals now produce React elements; editor/preview/settings have JSX components |
| Existing SQLite ZIP backup relied on synchronous `better-sqlite3` | Only backup receives native SQLite handle; API and worker use async DB adapter |
| PostgreSQL initialization depended on local tools | Added remote connection-string initializer; existing PG uses versioned migration |
| Old `server/db/README.md` falsely claimed PG was disabled | Updated documentation for both database modes |

## Static source checks

- 65 original HTTP API routes retained; two scoped business-setting PATCH
  endpoints added.
- 48 frontend JS/JSX files parsed and transpiled with a TypeScript AST parser.
- 196 relative module import edges checked; 0 unresolved module exports.
- 7 focused Node tests passed; server and script files pass `node --check`.
- Fourteen UI route states rendered in an earlier mock React element smoke test.
- No runtime `innerHTML` or HTML-string rendering call remains in `src/`.

## Deferred, not silently rewritten

1. Live PostgreSQL and SQLite integration tests, HTTP regression tests,
   real Vite production build, and real browser E2E were not run; this
   environment has no installed package dependencies or remote DB credentials.
2. Existing SQLite data is **not** automatically uploaded to remote PG. Use a
   separate verified data-transfer operation; do not switch live traffic yet.
3. PostgreSQL provider-managed backups replace the SQLite file-ZIP backup.
4. Historical invoices with ambiguous business ownership retain NULL profile
   and require reconciliation. Do not assign them to the first business.
5. `invoices.number` remains globally unique due to original schema. Two
   businesses may share the same format, causing sequence gaps but not duplicate
   identifiers.
6. Legacy mutable frontend state and global action aliases remain beneath React
   event handlers as a compatibility bridge; a full domain-level state redesign
   needs further feature-by-feature integration testing.
7. The invoice editor exposes recurrence configuration carried forward from
   existing code; attaching new recurring schedules to save flow requires full
   user-flow validation, and is not certified by the unit tests.

Treat this as an integration candidate requiring staging validation, not as an
approved production release.
