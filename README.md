# Endless Custom Indexer

A lightweight indexer for the Endless Blockchain that parses transactions and events, and serves them via a fast REST API. Built with Node.js, TypeScript, and PostgreSQL.

## Features
- **Indexer Worker**: Automatically polls the Endless RPC (`https://rpc.endless.link/v1`) starting from the last processed block, ensuring no transactions are missed.
- **Relational Database**: Stores transactions and extracted events efficiently in PostgreSQL.
- **REST API**: Provides easy-to-use HTTP endpoints to query indexed data.

## Prerequisites
- Node.js (v18+)
- PostgreSQL Database

## Setup

1. **Clone/Navigate to the project directory:**
   ```bash
   cd "Custom Indexer"
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   A `.env` file should be present in the project root with the following variables:
   ```env
   DATABASE_URL=postgresql://username:password@hostname:port/dbname?sslmode=require
   PORT=3000
   ENDLESS_RPC_URL=https://rpc.endless.link/v1
   POLL_INTERVAL_MS=3000
   ```

4. **Run the Indexer:**
   ```bash
   npm run dev
   ```
   This command starts the database initialization, the continuous indexer worker, and the REST API server on `http://localhost:3000`.

## API Endpoints

### `GET /api/status`
Returns the health of the indexer, the latest processed block version, and the total counts for transactions and events.

### `GET /api/transactions?limit=20&offset=0`
Returns a list of the most recent transactions.

### `GET /api/transactions/:version`
Returns details of a specific transaction along with its associated events.

### `GET /api/events?limit=20&offset=0&type=...`
Returns a list of the most recent events. You can optionally filter by event `type`.

## Architecture
- `src/db/`: Database connection wrapper and schema setup script.
- `src/indexer/`: Worker process that fetches from Endless RPC and writes to PostgreSQL.
- `src/api/`: Express.js server mapping database queries to REST endpoints.
- `src/index.ts`: The main entry point orchestrating the initialization and execution.
