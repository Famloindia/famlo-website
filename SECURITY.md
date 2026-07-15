# Security Policy

## Never commit

- `.env` files
- customer or host data
- database exports
- payment credentials
- production API keys
- certificates
- tokens
- private media
- logs containing personal data

## Secret handling

- Share credentials only through approved secure channels.
- Rotate any credential immediately if it is exposed in Git history, logs, or screenshots.
- Use staging credentials by default for development and QA.

## Reporting

Report suspected credential leaks, data exposure, or unsafe automation behavior to the Famlo maintainers before opening a public issue or external pull request.
