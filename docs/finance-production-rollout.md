# Famlo Finance Production Rollout

This rollout is for the Phase 8 production finance stack only.

Warning: never enable all production flags at once.

## Required env vars

- `TAX_MODE=SECTION_9_5`
- `FAMLO_GSTIN`
- `FAMLO_LEGAL_ENTITY_NAME`
- `FAMLO_LEGAL_ADDRESS`
- `GST_INVOICE_NUMBER_PREFIX`
- `CREDIT_NOTE_NUMBER_PREFIX`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `RAZORPAYX_ENABLED`
- `RAZORPAYX_KEY_ID`
- `RAZORPAYX_KEY_SECRET`
- `RAZORPAYX_ACCOUNT_NUMBER`
- `RAZORPAYX_WEBHOOK_SECRET`
- `FAMLO_CURRENT_ACCOUNT_NAME`
- `FAMLO_CURRENT_ACCOUNT_NUMBER`
- `FAMLO_CURRENT_ACCOUNT_IFSC`
- `EMAIL_PROVIDER`
- `EMAIL_FROM_ADDRESS`
- `EMAIL_REPLY_TO_ADDRESS`
- `APP_BASE_URL` or `NEXT_PUBLIC_APP_URL`

## Safety defaults

- `GST_EXPORT_ENABLED=false`
- `AUTO_REFUND_ENABLED=false`
- `REFUND_ADMIN_APPROVAL_REQUIRED=true`
- `PAYOUT_ADMIN_APPROVAL_REQUIRED=false`
- `AUTO_PAYOUT_ENABLED=true`
- `PAYOUT_HOLD_ENABLED=true`
- `PAYOUT_AUTO_RETRY_ENABLED=false`
- `SETTLEMENT_PAYOUT_EXECUTION_ENABLED=false`
- `REFUND_PROVIDER_EXECUTION_ENABLED=false`
- `RAZORPAY_REFUNDS_ENABLED=false`
- `HOST_FINANCE_UI_ENABLED=false`
- `ADMIN_FINANCE_OPS_UI_ENABLED=false`

## Razorpay payment webhook setup

1. Configure the live webhook in Razorpay for payment events used by Famlo.
2. Use the production HTTPS callback URL only.
3. Set `RAZORPAY_WEBHOOK_SECRET` before enabling any live payment reconciliation.
4. Verify signature validation in staging before production rollout.
5. Replay a known event and confirm no duplicate finance proof lines are created.

## Razorpay refund webhook setup

1. Include refund lifecycle events such as `refund.created`, `refund.processed`, and `refund.failed`.
2. Keep provider refund execution disabled until webhook verification is confirmed.
3. Confirm failed refunds remain non-final and route to ops review.

## RazorpayX payout webhook setup

1. Configure payout lifecycle events including processed, failed, and reversed payout outcomes.
2. Set `RAZORPAYX_WEBHOOK_SECRET`.
3. Verify that failed payouts move settlements to `payout_failed`.
4. Verify that reversed payouts move settlements to `needs_review`.

## GST registration checklist

- Active GST registration for Famlo legal entity
- Correct legal trade name and principal address
- Correct state code mapping
- Confirm Section 9(5) treatment with finance and tax counsel
- Confirm invoice footer copy and issuer identity
- Confirm SAC `9963` usage

## Current account checklist

- Dedicated current account for collections and ops settlement flows
- Account name matches legal entity
- Verified account number and IFSC
- Treasury owner confirmed
- Reversal and refund liquidity buffer agreed

## Invoice numbering config

- Set `GST_INVOICE_NUMBER_PREFIX`
- Confirm numbering uniqueness across environments
- Do not reuse staging prefixes in production
- Verify PDF filename matches invoice number

## Credit note numbering config

- Set `CREDIT_NOTE_NUMBER_PREFIX`
- Keep credit notes in a separate sequence from invoices
- Confirm refund-linked traceability back to original invoice

## Email provider config

- Set `EMAIL_PROVIDER`
- Set `EMAIL_FROM_ADDRESS`
- Set `EMAIL_REPLY_TO_ADDRESS`
- Confirm SPF, DKIM, and domain verification
- Send test guest invoice, host platform-fee invoice, and credit note emails before rollout

## Flag rollout order

1. Readiness only
2. GST checkout and invoice flow in staging
3. Refunds with admin approval
4. Payout account setup
5. Auto payout with admin hold controls
6. Pilot with 1-2 hosts
7. Limited production
8. Scale after webhook truth and hold workflows are proven

## Rollout stages

### 1. Readiness only

- Keep all execution flags off
- Review `/admin/finance/readiness`
- Resolve blocking tax, payout, email, and reconciliation issues

### 2. GST checkout + invoice in staging

- Enable checkout pricing and invoice generation only in staging
- Confirm guest payable matches Razorpay order amount
- Confirm no invoice is generated before capture

### 3. Refunds with admin approval

- Keep `AUTO_REFUND_ENABLED=false`
- Turn on provider refund execution only after webhook verification
- Confirm admin approve and execute paths work

### 4. Payout account setup

- Enable payout account creation and validation paths
- Verify masked destination display for hosts
- Confirm unverified PAN blocks activation

### 5. Auto payout with admin hold controls

- Keep payout execution admin-triggered
- Confirm failed and reversed payout handling
- Keep auto retry disabled

### 6. Pilot with 1–2 hosts

- Run a limited live cohort
- Reconcile every booking, refund, invoice, settlement, and payout manually

### 7. Limited production

- Expand only after two clean payout cycles
- Monitor `/admin/finance/reconciliation` daily

### 8. Safe automation later

- Consider limited automation only after refund and payout error rates are stable
- Reconfirm default-off posture for all risky automation

## Rollback plan

1. Turn off `SETTLEMENT_PAYOUT_EXECUTION_ENABLED`
2. Turn off `REFUND_PROVIDER_EXECUTION_ENABLED`
3. Turn off `RAZORPAY_REFUNDS_ENABLED`
4. Turn off `CHECKOUT_SECTION_9_5_PRICING_ENABLED` if checkout discrepancies appear
5. Turn off `GST_INVOICE_GENERATION_ENABLED`, `PLATFORM_FEE_INVOICE_GENERATION_ENABLED`, and `CREDIT_NOTE_GENERATION_ENABLED` if tax artifact generation must pause
6. Keep reconciliation and readiness pages available for diagnosis

## Pilot checklist

- One direct booking paid through Razorpay
- One free cancellation refund path
- One failed refund dry-run or simulated review case
- One settlement approved manually
- One payout processed end-to-end
- One payout failure drill
- One reversed payout drill
- Host verifies masked payout account and invoice access

## Support playbook

### Failed refund

- Confirm request status, attempt history, and provider event status
- Do not mark final without webhook confirmation
- Retry only through the approved admin flow if flags permit

### Failed payout

- Review settlement holds, payout account validation, and provider event payload
- Retry only when the payout remains `failed` and account validation is still safe

### Reversed payout

- Mark `needs_review`
- Freeze re-trigger until finance confirms account and banking state

### Invalid webhook signature

- Treat as blocking
- Do not trust the event for state transitions
- Rotate webhook secret if compromise is suspected

### Reconciliation critical issue

- Stop payout rollout actions
- Resolve the underlying payment, refund, payout, or provider mismatch first

### Invoice generated incorrectly

- Stop further invoice generation
- Review finance settings, tax mode, pricing snapshot, and numbering sequence
- Issue correction only through the guarded credit-note path where applicable
