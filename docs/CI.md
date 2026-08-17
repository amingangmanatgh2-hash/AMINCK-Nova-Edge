# Continuous integration

The CI pipeline for this project lives in
[`github-actions-ci.yml`](./github-actions-ci.yml).

## Why it is not in `.github/workflows/` yet

The automation account that opened this branch does not hold the GitHub
`workflows` permission, so pushing a file under `.github/workflows/` is
rejected by the server:

```
refusing to allow a GitHub App to create or update workflow
`.github/workflows/ci.yml` without `workflows` permission
```

The workflow is therefore committed here so it can be reviewed alongside the
code, and activated with a single move.

## Activating it

Run this locally with an account that can push workflows, then commit:

```bash
mkdir -p .github/workflows
git mv docs/github-actions-ci.yml .github/workflows/ci.yml
git commit -m "ci: activate GitHub Actions workflow"
git push
```

## What the pipeline does

Two jobs run on every push and on pull requests targeting `main`:

**`check`** — runs against Node 20.x and 22.x:

1. `npm ci`
2. `npm run typecheck`
3. `npm run lint`
4. `npm run format:check`
5. `npm test`
6. `npm run build`

**`audit`** — runs `npm run audit:ci`, failing on any advisory rated `high` or
above.

Concurrency is scoped per ref, so superseded runs are cancelled automatically.

## Running the same checks locally

`npm run check` executes the typecheck, lint, format and test steps in the same
order as CI:

```bash
npm ci
npm run check
npm audit
```
