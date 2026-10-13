"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const pg_1 = require("pg");
dotenv_1.default.config({ path: path_1.default.resolve(process.cwd(), '.env.production') });
const REQUIRED_TABLES = ['b2c_orders', 'b2b_orders'];
const run = async () => {
    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required to verify order label reference capacity');
    }
    const client = new pg_1.Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
    try {
        await client.connect();
        const result = await client.query(`select table_name, data_type, character_maximum_length
         from information_schema.columns
        where table_schema = 'public'
          and column_name = 'label'
          and table_name = any($1::text[])
        order by table_name`, [REQUIRED_TABLES]);
        const columns = new Map(result.rows.map((row) => [row.table_name, row]));
        for (const tableName of REQUIRED_TABLES) {
            const column = columns.get(tableName);
            if (!column) {
                throw new Error(`${tableName}.label is missing`);
            }
            if (column.data_type !== 'text' || column.character_maximum_length !== null) {
                throw new Error(`${tableName}.label must be unbounded text; found ${column.data_type}` +
                    (column.character_maximum_length === null
                        ? ''
                        : `(${column.character_maximum_length})`));
            }
        }
        console.log('Order label reference capacity verified', {
            tables: REQUIRED_TABLES,
            dataType: 'text',
        });
    }
    finally {
        await client.end().catch(() => undefined);
    }
};
run().catch((error) => {
    console.error('Order label reference capacity check failed:', error);
    process.exit(1);
});
