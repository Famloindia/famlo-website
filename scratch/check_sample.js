const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
        env[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkSampleData() {
    const tables = [
        'hosts',
        'bookings_v2',
        'families'
    ];
    
    for (const table of tables) {
        console.log(`--- Sample from ${table} ---`);
        const { data, error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.log(`${table}: Error - ${error.message}`);
        } else if (data && data.length > 0) {
            console.log(JSON.stringify(data[0], null, 2));
        } else {
            console.log(`${table}: No data`);
        }
    }
}

checkSampleData().catch(console.error);
