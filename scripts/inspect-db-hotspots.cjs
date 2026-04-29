const { Client } = require('pg');
const client = new Client({connectionString:'postgresql://postgres.wokjtntnbkwdsxbkotcr:%40m24MSA016zxc@aws-1-ap-south-1.pooler.supabase.com:5432/postgres', ssl:{rejectUnauthorized:false}});
const queries = {
  hot_tables: `
    select relname as table_name, n_live_tup::bigint as est_rows,
           seq_scan, seq_tup_read::bigint, idx_scan, idx_tup_fetch::bigint
    from pg_stat_user_tables
    where schemaname='public'
      and relname = any(array['conversations','messages','bookings','bookings_v2','families','hosts','family_photos','host_media','stay_units_v2','stories_v2'])
    order by n_live_tup desc nulls last;
  `,
  indexes: `
    select tablename, indexname, indexdef
    from pg_indexes
    where schemaname='public'
      and tablename = any(array['conversations','messages','bookings','bookings_v2','families','hosts','family_photos','host_media','stay_units_v2','stories_v2'])
    order by tablename, indexname;
  `,
  table_sizes: `
    select relname as table_name,
           pg_size_pretty(pg_total_relation_size(relid)) as total_size,
           pg_total_relation_size(relid) as total_bytes
    from pg_catalog.pg_statio_user_tables
    where schemaname='public'
      and relname = any(array['conversations','messages','bookings','bookings_v2','families','hosts','family_photos','host_media','stay_units_v2','stories_v2'])
    order by total_bytes desc;
  `,
  explain_guest_conversations: `
    explain (format text)
    select id, booking_id, family_id, host_id, host_user_id, guest_id, last_message, last_message_at, guest_unread, host_unread, typing_user_id, typing_updated_at
    from conversations
    where guest_id = '00000000-0000-0000-0000-000000000000' or host_user_id = '00000000-0000-0000-0000-000000000000'
    order by last_message_at desc
    limit 100;
  `,
  explain_host_conversations_family: `
    explain (format text)
    select id, booking_id, last_message, last_message_at, host_unread, guest_unread, guest_id, family_id, host_user_id, typing_user_id, typing_updated_at
    from conversations
    where family_id = '00000000-0000-0000-0000-000000000000'
    order by last_message_at desc
    limit 50;
  `,
  explain_messages: `
    explain (format text)
    select id,conversation_id,booking_id,sender_id,receiver_id,sender_type,text,created_at
    from messages
    where conversation_id in ('00000000-0000-0000-0000-000000000000')
    order by created_at desc
    limit 25;
  `,
  explain_route_hosts_slug: `
    explain (format text)
    select id,user_id,legacy_family_id,status,display_name,slug,city,state
    from hosts
    where slug = 'sample-slug'
    limit 1;
  `,
  explain_route_hosts_legacy_family: `
    explain (format text)
    select id,user_id,legacy_family_id
    from hosts
    where legacy_family_id = '00000000-0000-0000-0000-000000000000'
    limit 1;
  `,
  explain_stay_units_host: `
    explain (format text)
    select host_id, unit_key, name, unit_type, description, price_fullday, price_morning, price_afternoon, price_evening, is_active, photos
    from stay_units_v2
    where host_id = '00000000-0000-0000-0000-000000000000';
  `,
  explain_family_photos: `
    explain (format text)
    select family_id, url, is_primary
    from family_photos
    where family_id = '00000000-0000-0000-0000-000000000000';
  `,
  explain_host_media: `
    explain (format text)
    select host_id, media_url, is_primary
    from host_media
    where host_id = '00000000-0000-0000-0000-000000000000';
  `,
};
(async()=>{
 await client.connect();
 for (const [name, sql] of Object.entries(queries)) {
   const res = await client.query(sql);
   console.log(`\n=== ${name} ===`);
   console.log(JSON.stringify(res.rows, null, 2));
 }
 await client.end();
})().catch(async (e)=>{ console.error(e); try{await client.end();}catch{} process.exit(1); });
