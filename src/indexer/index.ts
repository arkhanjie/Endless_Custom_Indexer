import axios from 'axios';
import pool from '../db/index';

const RPC_URL = process.env.ENDLESS_RPC_URL || 'https://rpc.endless.link/v1';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL_MS || '3000');

async function getLastProcessedVersion(): Promise<number> {
  const result = await pool.query('SELECT last_processed_version FROM indexer_state WHERE id = 1');
  if (result.rows.length === 0) return 0;
  return parseInt(result.rows[0].last_processed_version, 10);
}

async function updateLastProcessedVersion(version: number) {
  await pool.query('UPDATE indexer_state SET last_processed_version = $1 WHERE id = 1', [version]);
}

async function fetchTransactions(startVersion: number, limit = 100): Promise<any[]> {
  try {
    const response = await axios.get(`${RPC_URL}/transactions`, {
      params: { start: startVersion, limit }
    });
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`Error fetching transactions from RPC: ${error.message}`);
    } else {
      console.error('Unknown error fetching transactions', error);
    }
    return [];
  }
}

async function processTransaction(tx: any) {
  // We may only care about user transactions, block metadata, or state checkpoints
  // Let's store all types for completeness, but events are usually in user_transaction and block_metadata
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const timestamp = tx.timestamp ? new Date(parseInt(tx.timestamp) / 1000).toISOString() : null;
    
    // Insert into transactions
    await client.query(`
      INSERT INTO transactions (version, hash, sender, sequence_number, success, vm_status, gas_used, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (version) DO NOTHING
    `, [
      tx.version,
      tx.hash,
      tx.sender || null,
      tx.sequence_number || null,
      tx.success !== undefined ? tx.success : true,
      tx.vm_status || null,
      tx.gas_used || 0,
      timestamp
    ]);

    // Insert events if they exist
    if (tx.events && Array.isArray(tx.events)) {
      for (const event of tx.events) {
        const accountAddress = event.guid?.account_address || null;
        const creationNumber = event.guid?.creation_number || null;

        await client.query(`
          INSERT INTO events (transaction_version, creation_number, sequence_number, account_address, type, data)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          tx.version,
          creationNumber,
          event.sequence_number,
          accountAddress,
          event.type,
          JSON.stringify(event.data)
        ]);
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`Error processing transaction ${tx.version}:`, error);
  } finally {
    client.release();
  }
}

export async function runIndexer() {
  console.log('Starting indexer worker...');
  
  // Create an artificial initial state if missing
  await pool.query('INSERT INTO indexer_state (id, last_processed_version) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;');

  let isPolling = false;

  const poll = async () => {
    if (isPolling) return;
    isPolling = true;

    try {
      const lastVersion = await getLastProcessedVersion();
      const currentVersion = lastVersion + 1; // start fetching after last processed

      console.log(`Polling for transactions starting at version ${currentVersion}...`);
      const txs = await fetchTransactions(currentVersion, 50);

      if (txs.length > 0) {
        let maxVersionProcessed = lastVersion;
        for (const tx of txs) {
          const version = parseInt(tx.version, 10);
          if (version > maxVersionProcessed) {
            await processTransaction(tx);
            maxVersionProcessed = version;
          }
        }
        await updateLastProcessedVersion(maxVersionProcessed);
        console.log(`Successfully processed up to version ${maxVersionProcessed}`);
        
        // If we got a full batch, poll again immediately
        if (txs.length === 50) {
          isPolling = false;
          setImmediate(poll);
          return;
        }
      }
    } catch (error) {
      console.error('Poll error:', error);
    } finally {
      isPolling = false;
      setTimeout(poll, POLL_INTERVAL);
    }
  };

  poll();
}

if (require.main === module) {
  runIndexer();
}
