# Freelancer Access

## Default access level

- Sanitized GitHub repository access
- Staging-only credentials when a task requires integration testing
- No direct production database access
- No live payment credentials
- No production Channex credentials
- No production R2 write credentials
- No production messaging or OTP provider tokens

## Recommended workflow

1. Assign work through feature branches.
2. Use pull requests into `staging`.
3. Review infrastructure, env, and data-touching changes carefully.
4. Promote to `main` only after staging validation.

## Credential rules

- Share the minimum credentials required for the task.
- Prefer read-only or test-mode access.
- Rotate temporary credentials after the engagement ends.
