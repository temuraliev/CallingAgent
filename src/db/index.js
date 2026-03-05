import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from './schema.js';
import 'dotenv/config';

// Ensure we have a database URL
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/callingagent';

const pool = new Pool({
    connectionString,
});

export const db = drizzle(pool, { schema });
