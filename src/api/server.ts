import express from 'express';
import cors from 'cors';
import pool from '../db/index';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Get indexer status
app.get('/api/status', async (req, res) => {
  try {
    const result = await pool.query('SELECT last_processed_version FROM indexer_state WHERE id = 1');
    const lastProcessedVersion = result.rows.length > 0 ? result.rows[0].last_processed_version : 0;
    
    // Get transaction count
    const countResult = await pool.query('SELECT COUNT(*) FROM transactions');
    const txCount = countResult.rows[0].count;

    // Get event count
    const eventResult = await pool.query('SELECT COUNT(*) FROM events');
    const eventCount = eventResult.rows[0].count;

    res.json({
      status: 'UP',
      last_processed_version: lastProcessedVersion,
      total_transactions: txCount,
      total_events: eventCount
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await pool.query(
      'SELECT * FROM transactions ORDER BY version DESC LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get specific transaction
app.get('/api/transactions/:version', async (req, res) => {
  try {
    const version = parseInt(req.params.version);
    const txResult = await pool.query('SELECT * FROM transactions WHERE version = $1', [version]);
    
    if (txResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const tx = txResult.rows[0];
    
    // Fetch associated events
    const eventsResult = await pool.query('SELECT * FROM events WHERE transaction_version = $1', [version]);
    tx.events = eventsResult.rows;

    res.json(tx);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent events
app.get('/api/events', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const type = req.query.type as string;

    let query = 'SELECT * FROM events';
    const params: any[] = [];
    
    if (type) {
      query += ' WHERE type = $1';
      params.push(type);
      query += ` ORDER BY id DESC LIMIT $2 OFFSET $3`;
      params.push(limit, offset);
    } else {
      query += ' ORDER BY id DESC LIMIT $1 OFFSET $2';
      params.push(limit, offset);
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export function startApiServer() {
  app.listen(PORT, () => {
    console.log(`Indexer REST API server listening on port ${PORT}`);
  });
}

if (require.main === module) {
  startApiServer();
}
