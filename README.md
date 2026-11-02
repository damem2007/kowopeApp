# Kowope Invoice Hub

A Vite + React invoicing dashboard backed by a lightweight Node.js and Express API.

Invoices are persisted in a local SQLite database at `data/invoices.db`. The app can generate PDF invoices and email them as attachments through Gmail or Outlook SMTP.

## Features

- Invoice dashboard with outstanding, paid, overdue, and collection metrics
- Invoice list with client, amount, status, and due-date details
- Create invoice modal and draft workflow
- Send invoice workflow through connected providers
- Provider registry for Gmail, Outlook, Stripe, and QuickBooks
- Responsive layout for desktop and mobile screens

## Requirements

- Node.js 18 or newer
- npm

## Getting started

Install dependencies:

```bash
npm install
```

Configure email delivery:

```bash
cp .env.example .env
```

Then edit `.env`. For Gmail, use an App Password rather than your normal account password. For Outlook, use `smtp.office365.com` and your Microsoft 365 SMTP credentials.

Start the frontend and API together:

```bash
npm run dev
```

The Vite frontend runs on its default development port. The Express API runs on:

```text
http://localhost:3001
```

Create a production build:

```bash
npm run build
```

Start the API in production mode after building:

```bash
NODE_ENV=production npm start
```

## Project structure

```text
.
├── server/
│   └── index.js       Express API and provider routes
├── src/
│   ├── main.jsx       React application
│   └── styles.css     Application styles
├── index.html         Vite entry point
└── vite.config.js     Vite configuration
```

## API endpoints

### List providers

```http
GET /api/providers
```

Returns the configured provider registry and connection states.

### Send an invoice

```http
POST /api/invoices/:id/send
Content-Type: application/json
```

Example request:

```json
{
  "provider": "gmail",
  "recipient": "client@example.com"
}
```

Only providers marked as connected can currently send invoices. The provider records in `server/index.js` are intentionally structured as integration points for adding OAuth and real provider SDK calls.

## Sending a real invoice

1. Start the app with `npm run dev`.
2. Click **New invoice**.
3. Enter the employer/client email, description, amount, and due date.
4. Create the invoice.
5. Select the send icon beside the invoice.
6. Confirm sending. The app generates a PDF, emails it as an attachment, and marks the invoice as sent.

The database and generated invoice records remain available after restarting the app.

## Connecting real providers

The current Gmail connection is a demo connection. To make providers production-ready:

1. Add OAuth credentials through environment variables.
2. Add provider authorization and callback routes in `server/index.js`.
3. Store encrypted access and refresh tokens in a database.
4. Replace the send endpoint's confirmation response with the provider SDK/API call.
5. Add webhook handling for delivery, payment, and synchronization events.

Do not commit OAuth secrets, API keys, or access tokens to the repository.

## Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Starts Vite and the Express API together |
| `npm run build` | Builds the frontend for production |
| `npm start` | Starts the Express server |

# invoicingApp
