# Contributing

## Branch flow

- `main`
  - production only
  - no direct pushes
  - pull requests required
- `staging`
  - integration and staging testing
- `feature/*`
- `fix/*`
- `chore/*`
  - developer work branches

Expected flow:

`feature branch` -> `pull request into staging` -> `staging QA` -> `pull request into main` -> `production`

## Development checklist

1. Create a branch from `staging`.
2. Run `npm ci`.
3. Copy `.env.example` to `.env.local`.
4. Run `npm run typecheck`.
5. Run `npm run lint`.
6. Open a pull request with a focused change set.

## Safety rules

- Do not commit secrets, dumps, generated exports, or local backups.
- Do not run production-impacting scripts unless you have explicit approval.
- Keep infrastructure and environment changes documented in the pull request.
