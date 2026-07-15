import fs from 'node:fs';
import { Client } from 'pg';
const sql = fs.readFileSync('supabase/migrations/20260429000002_public_home_cards_view.sql', 'utf8');
const client = new Client({connectionString: process.env.CHAT_DB_URL, ssl:{rejectUnauthorized:false}});
(async()=>{await client.connect(); await client.query(sql); const res=await client.query(`select column_name from information_schema.columns where table_schema='public' and table_name='public_home_cards_v1' order by ordinal_position`); console.log(JSON.stringify(res.rows,null,2)); await client.end();})().catch(async e=>{console.error(e); try{await client.end();}catch{} process.exit(1);});
