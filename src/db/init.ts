import pool from './index';

export const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    console.log('Initializing database schema...');

    // We store the last processed block to resume easily
    await client.query(`
      CREATE TABLE IF NOT EXISTS indexer_state (
        id SERIAL PRIMARY KEY,
        last_processed_version BIGINT NOT NULL
      );
    `);

    // Insert an initial state if empty
    await client.query(`
      INSERT INTO indexer_state (id, last_processed_version) 
      VALUES (1, 0)
      ON CONFLICT (id) DO NOTHING;
    `);

    // Create transactions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        version BIGINT PRIMARY KEY,
        hash VARCHAR(255) NOT NULL,
        sender VARCHAR(255),
        sequence_number BIGINT,
        success BOOLEAN NOT NULL,
        vm_status TEXT,
        gas_used BIGINT,
        timestamp TIMESTAMP WITH TIME ZONE
      );
    `);

    // Create events table
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        transaction_version BIGINT REFERENCES transactions(version) ON DELETE CASCADE,
        creation_number BIGINT,
        sequence_number BIGINT,
        account_address VARCHAR(255),
        type VARCHAR(255),
        data JSONB
      );
      CREATE INDEX IF NOT EXISTS idx_events_tx_version ON events(transaction_version);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_account ON events(account_address);
    `);

    console.log('Database schema initialized effectively.');
  } catch (error) {
    console.error('Error initializing database:', error);
    throw error;
  } finally {
    client.release();
  }
};

// If run directly
if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
