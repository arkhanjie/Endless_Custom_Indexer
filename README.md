# 🔗 Endless Custom Indexer

<p align="center">
  <strong>A high-performance, real-time blockchain indexer for the Endless Network</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/PostgreSQL-15%2B-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Endless-Blockchain-00ff88?style=for-the-badge" alt="Endless">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge" alt="License">
</p>

---

A lightweight custom indexer that continuously parses transactions and events from the **Endless Blockchain RPC**, stores them in **PostgreSQL**, and serves them through a **REST API** with a built-in **real-time visual dashboard**.

## ✨ Features

| Feature | Description |
|---------|-------------|
| ⛓️ **Real-time Indexing** | Continuously polls the Endless RPC starting from the last processed block — no transactions missed |
| 🗄️ **PostgreSQL Storage** | Relational storage with proper indexes for fast lookups on transactions and events |
| 🚀 **REST API** | Clean HTTP endpoints for querying indexed data with pagination and filtering |
| 📊 **Visual Dashboard** | Built-in dark-mode web UI with live stats, transaction/event tables, and detail modals |
| 🔄 **Auto-Recovery** | Automatically resumes from the last processed block on restart |
| ⚡ **Event Parsing** | Extracts and stores all on-chain events with JSON data support |

## 📐 Architecture

```mermaid
graph TB
    subgraph Endless Network
        RPC["🌐 Endless RPC<br/>rpc.endless.link/v1"]
    end

    subgraph Indexer Service
        WORKER["⛓️ Indexer Worker<br/>src/indexer/index.ts"]
        API["🚀 REST API Server<br/>src/api/server.ts"]
        UI["📊 Dashboard UI<br/>public/index.html"]
        ENTRY["🏁 Entry Point<br/>src/index.ts"]
    end

    subgraph Database
        PG["🗄️ PostgreSQL"]
        TX_TABLE["transactions"]
        EV_TABLE["events"]
        STATE["indexer_state"]
    end

    subgraph Client
        BROWSER["🌐 Web Browser"]
        CURL["💻 API Consumer"]
    end

    RPC -->|"GET /transactions"| WORKER
    WORKER -->|"INSERT"| TX_TABLE
    WORKER -->|"INSERT"| EV_TABLE
    WORKER -->|"UPDATE state"| STATE
    ENTRY --> WORKER
    ENTRY --> API
    API -->|"Query"| PG
    API -->|"Serve static"| UI
    BROWSER -->|"HTTP"| UI
    BROWSER -->|"fetch() API calls"| API
    CURL -->|"HTTP REST"| API
    PG --> TX_TABLE
    PG --> EV_TABLE
    PG --> STATE
```

### Data Flow

1. **Indexer Worker** polls the Endless RPC for new transactions starting from the last processed version
2. Each transaction and its events are parsed and inserted into PostgreSQL within a database transaction
3. The `indexer_state` table tracks the last processed block version for resumability
4. The **REST API** serves the indexed data through HTTP endpoints
5. The **Dashboard UI** is served as a static file and communicates with the API via `fetch()`

## 📁 Project Structure

```
Endless_Custom_Indexer/
├── public/
│   └── index.html          # 📊 Visual dashboard (dark-mode, responsive)
├── src/
│   ├── index.ts             # 🏁 Main entry point
│   ├── api/
│   │   └── server.ts        # 🚀 Express REST API + static file serving
│   ├── db/
│   │   ├── index.ts         # 🔌 PostgreSQL connection pool
│   │   └── init.ts          # 📋 Database schema initialization
│   └── indexer/
│       └── index.ts         # ⛓️ Blockchain polling worker
├── .env                     # 🔑 Environment variables (not committed)
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** v18 or higher
- **PostgreSQL** database (local or hosted — [Neon](https://neon.tech), [Supabase](https://supabase.com), etc.)

### 1. Clone the Repository

```bash
git clone https://github.com/arkhanjie/Endless_Custom_Indexer.git
cd Endless_Custom_Indexer
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
PORT=3001
ENDLESS_RPC_URL=https://rpc.endless.link/v1
POLL_INTERVAL_MS=3000
```

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | *required* |
| `PORT` | HTTP server port | `3000` |
| `ENDLESS_RPC_URL` | Endless blockchain RPC endpoint | `https://rpc.endless.link/v1` |
| `POLL_INTERVAL_MS` | Polling interval in milliseconds | `3000` |

### 4. Run the Indexer

```bash
# Development (with hot-reload)
npm run dev

# Production
npm run build && npm start
```

### 5. Open the Dashboard

Navigate to `http://localhost:3001` in your browser to see the **real-time visual dashboard**.

## 📡 API Reference

### `GET /api/status`

Returns the indexer health and statistics.

**Response:**
```json
{
  "status": "UP",
  "last_processed_version": 158420,
  "total_transactions": "12847",
  "total_events": "34291"
}
```

---

### `GET /api/transactions`

Returns paginated transactions, newest first.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | int | `20` | Number of results |
| `offset` | int | `0` | Pagination offset |

**Response:**
```json
[
  {
    "version": 158420,
    "hash": "0xabc123...",
    "sender": "0x1234...abcd",
    "sequence_number": 42,
    "success": true,
    "vm_status": "Executed successfully",
    "gas_used": 1200,
    "timestamp": "2026-03-24T10:30:00.000Z"
  }
]
```

---

### `GET /api/transactions/:version`

Returns a specific transaction with its associated events.

**Response:**
```json
{
  "version": 158420,
  "hash": "0xabc123...",
  "sender": "0x1234...abcd",
  "success": true,
  "events": [
    {
      "id": 1,
      "transaction_version": 158420,
      "type": "0x1::coin::WithdrawEvent",
      "account_address": "0x1234...abcd",
      "data": { "amount": "1000000" }
    }
  ]
}
```

---

### `GET /api/events`

Returns paginated events with optional type filtering.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | int | `20` | Number of results |
| `offset` | int | `0` | Pagination offset |
| `type` | string | — | Filter by event type |

---

### `GET /api/events/types`

Returns distinct event types with their counts.

**Response:**
```json
[
  { "type": "0x1::coin::WithdrawEvent", "count": "4521" },
  { "type": "0x1::coin::DepositEvent", "count": "4210" }
]
```

---

### `GET /api/stats/timeline`

Returns hourly transaction counts for the last 24 hours.

**Response:**
```json
[
  { "hour": "2026-03-24T09:00:00.000Z", "count": "142" },
  { "hour": "2026-03-24T10:00:00.000Z", "count": "198" }
]
```

## 🗄️ Database Schema

```sql
-- Tracks the last indexed block version
CREATE TABLE indexer_state (
  id SERIAL PRIMARY KEY,
  last_processed_version BIGINT NOT NULL
);

-- All indexed transactions
CREATE TABLE transactions (
  version BIGINT PRIMARY KEY,
  hash VARCHAR(255) NOT NULL,
  sender VARCHAR(255),
  sequence_number BIGINT,
  success BOOLEAN NOT NULL,
  vm_status TEXT,
  gas_used BIGINT,
  timestamp TIMESTAMP WITH TIME ZONE
);

-- All indexed events (linked to transactions)
CREATE TABLE events (
  id SERIAL PRIMARY KEY,
  transaction_version BIGINT REFERENCES transactions(version) ON DELETE CASCADE,
  creation_number BIGINT,
  sequence_number BIGINT,
  account_address VARCHAR(255),
  type VARCHAR(255),
  data JSONB
);

-- Performance indexes
CREATE INDEX idx_events_tx_version ON events(transaction_version);
CREATE INDEX idx_events_type ON events(type);
CREATE INDEX idx_events_account ON events(account_address);
```

## 🚢 Deployment

### Local Development

```bash
npm run dev
```

### Docker (Recommended for Production)

```Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

```bash
docker build -t endless-indexer .
docker run -d --env-file .env -p 3001:3001 endless-indexer
```

### Cloud Deployment

The indexer can be deployed on any Node.js-compatible platform:

| Platform | Guide |
|----------|-------|
| **Railway** | Connect your GitHub repo → add `DATABASE_URL` env → deploy |
| **Render** | Create a Web Service → link repo → set env vars → deploy |
| **DigitalOcean App Platform** | Import from GitHub → configure env → deploy |
| **VPS (Ubuntu)** | Clone → install Node.js & PM2 → `pm2 start dist/index.js` |

## 🔧 How to Extend

### Add a New Event Parser

To parse specific event types (e.g., token transfers), extend the `processTransaction` function in `src/indexer/index.ts`:

```typescript
// In processTransaction(), after inserting events:
if (event.type === '0x1::coin::TransferEvent') {
  const amount = event.data?.amount;
  const receiver = event.data?.receiver;
  // Store in a custom transfers table, emit webhook, etc.
}
```

### Add a New API Endpoint

Add routes to `src/api/server.ts`:

```typescript
// Example: Get transactions by sender
app.get('/api/transactions/by-sender/:address', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM transactions WHERE sender = $1 ORDER BY version DESC LIMIT 20',
    [req.params.address]
  );
  res.json(result.rows);
});
```

### Add Custom Database Tables

Extend `src/db/init.ts` with new `CREATE TABLE` statements for domain-specific data (token balances, NFT metadata, DeFi positions, etc.).

### Add WebSocket Real-time Updates

```typescript
import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ server });
// In processTransaction(), broadcast new data:
wss.clients.forEach(client => client.send(JSON.stringify(tx)));
```

## 🛠️ Tech Stack

| Technology | Role |
|------------|------|
| **Node.js** | Runtime environment |
| **TypeScript** | Type-safe development |
| **Express.js** | HTTP server & REST API |
| **PostgreSQL** | Relational database |
| **Axios** | HTTP client for RPC calls |
| **node-postgres (pg)** | PostgreSQL driver |
| **nodemon** | Development hot-reload |

## 📄 License

This project is open source under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ for the <strong>Endless Blockchain</strong> ecosystem
</p>
