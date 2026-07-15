# Deployment

## Branch model

- `staging` for integration and QA deployments
- `main` for production deployments

## Safe deployment steps

1. Merge reviewed changes into `staging`.
2. Validate staging with the correct staging environment variables.
3. Promote to `main` through a pull request.
4. Deploy production only with production-scoped credentials managed outside Git.

## Before deploying

- Confirm `npm run typecheck`
- Confirm `npm run lint`
- Confirm the required environment variables are set in the deployment platform
- Confirm no local backup, dump, or debug artifacts are in the branch

## Notes

- This repository does not store production secrets.
- Production credentials and platform access must be obtained separately.
