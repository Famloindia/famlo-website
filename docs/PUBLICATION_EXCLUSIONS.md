# Publication Exclusions

This repository was created from a working tree snapshot with publication-focused exclusions applied.

## Ambiguous or local-only items excluded on purpose

| Source path | Reason for exclusion | Corresponding active file exists | Referenced by app or scripts |
| --- | --- | --- | --- |
| `supabase/migrations 2/` | Duplicate migration directory | Yes, `supabase/migrations/` | Only referenced by TypeScript exclude rules |
| `supabase/functions 2/` | Duplicate edge function directory | Yes, `supabase/functions/` | Only referenced by TypeScript exclude rules |
| `app/homes/page 2.tsx` | Duplicate page file | Yes, `app/homes/page.tsx` | No |
| `components/partners/rooms/HostRoomsManager.tsx.ui-backup` | UI backup artifact | Yes, `components/partners/rooms/HostRoomsManager.tsx` | No |
| `proxy.ts.disabled` | Disabled proxy artifact | No active counterpart in current app | No |
| `disabled-routes-backup/` | Disabled route backups | Yes, active routes live in `app/` | No |
| `my-app/` | Nested secondary starter app, not part of the root workspace | Yes, canonical app lives at repo root | Only referenced by TypeScript exclude rules |
| `LOCAL_DEV_RECOVERY.md` | Local-machine recovery notes with machine-specific paths | No | No |
| `update_rooms.js` | Local one-off script with machine-specific path | No | No |

## Additional excluded categories

- `.git/`, `node_modules/`, `.next/`, `out/`, `dist/`, `coverage/`, `.turbo/`, `.vercel/`
- `.env` files and env backup files
- `.codex-backups/`, `.codex-logs/`, `backups/`, `.generated/`, `scratch/`, `reports/`
- database dumps, patches, archives, generated PDFs, and local editor artifacts
