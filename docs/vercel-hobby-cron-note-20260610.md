Vercel Hobby cron compatibility note

- Snapshot date: 2026-06-10
- Reason: Vercel Hobby blocks cron schedules that run more than once per day, including `* * * * *`.
- Safe action taken: reduced every configured Vercel cron in `vercel.json` to a daily schedule while keeping the same endpoints and without enabling any execution flags.
- Follow-up: if higher-frequency automation is needed later, move it to Vercel Pro, an external cron service, GitHub Actions, or Upstash/QStash instead of restoring sub-daily Hobby schedules.
