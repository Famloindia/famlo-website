# Known Technical Debt

- `npm run typecheck` currently passes.
- `npm run lint` currently reports 36 errors and 71 warnings.
- Lint cleanup should happen in a separate branch.
- Lint must not be auto-fixed across booking, calendar, Channex, payments, finance, or authentication flows without focused review.
- The initial repository commit intentionally preserves current application behavior.
