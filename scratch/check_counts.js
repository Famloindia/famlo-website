const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
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

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkCounts() {
    const tables = [
        'users',
        'families',
        'family_applications',
        'hosts',
        'host_applications_v2',
        'hommie_profiles_v2',
        'hommie_applications_v2',
        'bookings_v2',
        'payments_v2',
        'host_onboarding_drafts'
    ];
    
    console.log('--- Table Counts ---');
    for (const table of tables) {
        try {
            const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
            if (error) {
                console.log(`${table}: Error - ${error.message}`);
            } else {
                console.log(`${table}: ${count}`);
            }
        } catch (e) {
            console.log(`${table}: Exception - ${e.message}`);
        }
    }
}

checkCounts().catch(console.error);
