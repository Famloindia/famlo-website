# Famlo Web

Famlo Web is the main Next.js application for the Famlo platform. It powers the public site, host tools, partner workflows, and supporting operational dashboards.

## Requirements

- Node.js `20.x`
- npm `10+` recommended

## Local development

1. Install dependencies:

```bash
npm ci
```

2. Create a local environment file:

```bash
cp .env.example .env.local
```

3. Fill in the required credentials using values shared through a secure channel.

4. Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Validation

```bash
npm run typecheck
npm run lint
```

## Repository rules

- Production credentials are never shared through GitHub.
- Do not commit `.env` files, database exports, customer data, or private media.
- Request staging or production access separately and only when required.

## Deployment overview

- Development work happens on feature branches.
- Integration and staging validation happens through the `staging` branch.
- Production promotion happens through `main`.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the docs in [`docs/`](docs).
