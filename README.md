# AI Business Intelligence Assistant

An AI-first business intelligence workspace for asking natural-language questions about imported sales data. The application imports CSV records into MySQL, exposes a REST API, and provides a React interface where users receive calculated answers with supporting figures.

## Evaluation Summary

| Area | Implementation |
| --- | --- |
| Working functionality | CSV import, AI questions, filters, charts, report export, scheduled refresh, authentication, and health checks. |
| Programming fundamentals | Modular functions, async/await, validation, data normalization, reusable API calls, and separation of UI, routes, database access, and analytics logic. |
| Backend and database design | Express REST routes, MySQL tables, unique transaction IDs, indexes, JWT authentication, and idempotent imports. |
| Correctness and reliability | Consistent revenue calculation, numeric normalization, safe read-only operations, duplicate protection, and regression tests. |
| Appropriate use of AI | Natural-language interpretation maps questions to safe analytics operations; answers are calculated from records rather than invented. |
| Testing and error handling | Node tests cover valid, invalid, destructive, edge-case, ranking, comparison, status, and alias questions. APIs return meaningful errors. |
| Explainability and modification | Architecture, data flow, supported behavior, boundaries, and extension points are documented below. |

## Working Functionality

1. A user imports the supplied CSV or uploads a compatible CSV.
2. The backend parses and normalizes each row.
3. Records are upserted into MySQL using `Transaction_Id` as the unique key.
4. The dashboard loads records through `/api/dashboard/sales`.
5. The user asks a natural-language question.
6. The analytics engine detects the metric, dimension, filter, and operation.
7. The engine calculates the answer and returns supporting figures.
8. The UI displays the answer, evidence, charts, filters, and recent analysis.

Additional features include region/category filters, clickable chart bars, CSV report export, scheduled imports, fixed sidebar navigation, and loading/error states.

## Technology Stack

- React 19 + Vite
- Node.js + Express 5
- MySQL with `mysql2/promise`
- JWT authentication
- `bcryptjs` password hashing
- Node.js built-in test runner
- `concurrently` for client/server development

## Project Structure

```text
.
├── client/src/App.jsx                 # AI-first dashboard UI
├── client/src/App.css                 # Layout, responsive styling, states
├── server/data/                       # Bundled CSV source
├── server/src/config/db.js            # MySQL pool and table initialization
├── server/src/controllers/            # Authentication handlers
├── server/src/middleware/             # Auth and error middleware
├── server/src/routes/                 # API endpoints
├── server/src/scripts/importSales.js  # CLI data importer
├── server/src/utils/analyticsEngine.js# Question interpretation/calculation
└── server/tests/analytics.test.js     # Analytics tests
```

## Setup

Requirements: Node.js 18+, npm, and MySQL 8 or compatible.

```bash
npm install
```

Create `server/.env` from `server/.env.example`, then configure:

```env
PORT=5000
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=ai_bi_assistant
JWT_SECRET=change_this_secret
CLIENT_URL=http://localhost:5173
```

The backend creates the `users` and `sales_transactions` tables automatically. If MySQL is unavailable, the dashboard can read the bundled CSV in fallback mode, but database import and authentication require MySQL.

Start the application:

```bash
npm run dev
```

URLs:

- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- Health: http://localhost:5000/api/health

## Deploy to Vercel

This repository is configured as a single Vercel project:

- The React/Vite frontend is built from `client/` into `client/dist`.
- The Express API is exposed through the serverless function in `api/index.js`.
- `/api/*` requests are routed to Express, and all other routes fall back to the React app.

Production deployment: [AI Business Intelligence Assistant](https://ai-business-intelligence-assistant-n9i8mr750.vercel.app/)

### 1. Import the repository

1. Push the repository to GitHub.
2. In Vercel, choose **Add New Project** and import the repository.
3. Keep the repository root as the project root.
4. Leave the detected build settings unchanged. The committed `vercel.json` supplies:
   - Build command: `npm run build`
   - Output directory: `client/dist`

### 2. Add production environment variables

In **Project Settings > Environment Variables**, add these variables for Production (and Preview if needed):

```env
MYSQL_HOST=your-mysql-host
MYSQL_PORT=3306
MYSQL_USER=your-mysql-user
MYSQL_PASSWORD=your-mysql-password
MYSQL_DATABASE=ai_bi_assistant
JWT_SECRET=replace-with-a-long-random-secret
CLIENT_URL=https://your-project.vercel.app
```

Use a MySQL provider that allows connections from Vercel and permits remote TLS connections when required by that provider. Do not upload `.env` files or commit production credentials.

### 3. Deploy and verify

Deploy from the Vercel dashboard or with the Vercel CLI:

```bash
npx vercel
npx vercel --prod
```

Verify the API and frontend after deployment:

```text
https://ai-business-intelligence-assistant-n9i8mr750.vercel.app/api/health
https://ai-business-intelligence-assistant-n9i8mr750.vercel.app/
```

The database tables are created automatically when the API receives its first request. The bundled CSV remains available as a read-only fallback for dashboard queries, but MySQL is required for authentication and CSV imports.

## Data Import

Import the bundled CSV:

```bash
npm --prefix server run import-data
```

The dashboard also supports CSV upload, manual import, and scheduled refreshes of the configured server-side CSV source. Imports use an idempotent upsert, so re-importing the same transaction updates it instead of creating duplicates.

## API Endpoints

```text
GET  /api/health
GET  /api/dashboard/sales
POST /api/dashboard/ask
POST /api/dashboard/import
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

Example AI request:

```json
{
  "question": "What is the average order value?"
}
```

The response contains `success`, `question`, `answer`, and `supportingFigures`.

## AI Analyst Design

`server/src/utils/analyticsEngine.js`:

1. Normalizes the question.
2. Detects a metric such as revenue, units, orders, discounts, or price.
3. Detects a dimension such as product, category, region, channel, status, customer, or date.
4. Executes a read-only aggregate, average, breakdown, ranking, or comparison.

Supported examples:

```text
What is the total revenue?
How much did we make overall?
What is the average order value?
Show revenue by category.
Which product sold the most?
What are the top 3 products by sales?
Compare North and South regions by revenue.
How many completed orders do we have?
How many units were sold?
What was the average price?
```

The system does not execute arbitrary SQL or invent unsupported values. Destructive requests and unsupported future predictions are rejected. Profit and margin are unavailable because the source data has no cost fields.

## Backend and Database Design

`users` stores identity, hashed password, role, and timestamps. `sales_transactions` stores normalized transaction fields and indexes for region, category, and date. `Transaction_Id` is unique.

Revenue is calculated consistently as:

```text
Revenue = Quantity * Unit_price - Discount_amount
```

MySQL is preferred when connected; the bundled CSV is a development fallback.

## Correctness and Reliability

- Numeric values are normalized; missing numeric values become zero.
- Empty, destructive, unsupported, and future-looking questions return clear errors.
- Imports use a unique transaction key to prevent duplicates.
- Status fields are retained through import and retrieval.
- Comparison questions use explicitly named groups.
- API failures return structured responses.
- The frontend shows loading, import, backend, and empty-data states.

## Testing and Validation

```bash
npm --prefix server test
npm --prefix client run lint
npm --prefix client run build
```

Tests cover total revenue, regions, top products, empty questions, destructive requests, aliases, grouped breakdowns, rankings, comparisons, statuses, average order value, and unsupported forecasting.
