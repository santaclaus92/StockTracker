import postgres from 'postgres';
import { DATABASE_URL } from '../config.js';

const sql = postgres(DATABASE_URL, { ssl: 'require' });
export default sql;
