import dotenv from 'dotenv';
import { initializeDatabase } from './db/index.js';
import { runDueSchedules } from './services/recurrence.js';

dotenv.config();

async function main() {
  const database = await initializeDatabase();

  try {
    const created = await runDueSchedules(database);
    console.log(JSON.stringify({ created }));
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error('Recurring invoice execution failed:', error);
  process.exitCode = 1;
});
