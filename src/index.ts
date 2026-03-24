import { initializeDatabase } from './db/init';
import { runIndexer } from './indexer/index';
import { startApiServer } from './api/server';

async function main() {
  console.log('Starting Endless Custom Indexer...');
  
  try {
    // 1. Initialize DB Schema
    await initializeDatabase();
    
    // 2. Start REST API Server
    startApiServer();
    
    // 3. Start Indexer Worker
    runIndexer();
    
  } catch (error) {
    console.error('Failed to start Custom Indexer:', error);
    process.exit(1);
  }
}

main();
