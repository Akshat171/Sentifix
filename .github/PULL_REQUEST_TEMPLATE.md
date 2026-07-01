## What does this PR do?

<!-- A clear one-paragraph summary of the change and why it's needed. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / code quality
- [ ] Documentation
- [ ] Tests
- [ ] CI / tooling

## Linked issue(s)

<!-- Closes #<issue-number> -->

## How was this tested?

<!-- Describe what you ran to verify the change works. Include commands, logs, or screenshots where helpful. -->

- [ ] `pnpm build` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] Manually tested (describe below)

## Checklist

- [ ] No `console.log` left in production code
- [ ] New env vars added to `src/config/config.schema.ts` and `.env.example`
- [ ] TypeORM schema changes have a migration in `src/persistence/migrations/`
- [ ] No cross-module direct service imports introduced
- [ ] `CHANGELOG.md` updated if this is a user-visible change
