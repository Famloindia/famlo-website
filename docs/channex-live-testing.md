# Channex Live Testing Checklist

## Before the call
- Confirm `CHANNEX_ENVIRONMENT=staging` and staging credentials are configured.
- Confirm the Famlo Pro dashboard is enabled and the operator account has admin access.
- Confirm the target property has Channex mappings in place:
  - `channel_properties`
  - `channel_room_mappings`
  - `channel_rate_plans`
- Confirm the queue worker can process `/api/internal/cron/channel-sync-jobs`.

## 1. Queue a full sync
- Open Famlo Pro for the target property.
- Go to the Channex ARI sync card.
- Trigger `Push 30-day staging sync` or `Push 365-day staging sync`.
- Verify the UI shows `Channex ARI full sync was queued from the Famlo operator flow.`
- Record the queued job ids shown in the UI.

## 2. Create a manual PMS booking
- Open the Bookings section in Famlo Pro.
- Use the `Manual PMS booking` form.
- Select the mapped stay unit.
- Enter guest name, check-in date, and checkout date.
- Submit the booking.
- Verify the success message includes queued Channex job ids.
- For a booking like `2026-05-22` to `2026-05-24`, verify only `2026-05-22` and `2026-05-23` are treated as booked nights.

## 3. Verify Channex availability
- Check `channel_sync_jobs` for the queued booking-sync jobs.
- Confirm `status`, `attempts`, `last_error`, and `channex_task_id` where available.
- In Channex staging, verify only the affected stay nights changed.
- Confirm the checkout date remained available.

## 4. Modify the booking
- Modify the booking through the existing Famlo booking modification flow.
- Verify old stay nights are released and new stay nights are blocked.
- Confirm the queued Channex availability job window covers only the old/new affected nights.

## 5. Cancel the booking
- Cancel the same Famlo-origin booking.
- Verify availability is restored for the previously booked nights only.
- Confirm a scoped Channex availability job is queued and processed.

## 6. Failure and retry check
- If any Channex sync job fails, inspect `channel_sync_jobs.last_error`.
- Re-run a full sync from the Famlo Pro ARI card if recovery is needed.
- Confirm dead-lettered or retried jobs are visible before the call ends.
