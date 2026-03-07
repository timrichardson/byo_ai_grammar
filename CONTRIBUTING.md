# Contributing

Thanks for contributing to `byo_ai_grammar`.

## Development Setup

1. Install Thunderbird 128+, Git, Node.js 24+, and npm 11+.
2. Clone the repository.
3. Run `npm install`.
4. Run `npm run build`.
5. Load `dist/manifest.json` as a temporary add-on in Thunderbird.

## Project Commands

- `npm run build` - build the extension into `dist/`
- `npm run watch` - rebuild while editing
- `npm run typecheck` - run TypeScript checks
- `npm run package` - build a local installable `.xpi`

## Coding Standards

### General

- Prefer small, focused changes.
- Keep the extension grammar-only unless there is a clear product decision to change scope.
- Preserve Thunderbird native spelling behavior.
- Favor predictable, conservative UX over ambitious but fragile editor behavior.

### TypeScript

- Write new logic in TypeScript.
- Keep `strict` type safety intact.
- Prefer explicit shared types for message payloads and settings.
- Validate model output defensively before using it.

### UI And UX

- Keep UI copy plain, direct, and beginner-friendly.
- Use existing naming consistently: `BYO AI Grammar`, `grammar suggestions`, `allowlist`.
- Do not introduce heavy UI frameworks for small settings or popup changes.
- Make changes work on desktop and narrow layouts.

### Security And Privacy

- Do not weaken the API key warnings in the UI or docs.
- Assume Thunderbird local storage is convenient but not high-security.
- Keep prompts and transmitted text bounded.
- Avoid adding telemetry or analytics.

### Build And Packaging

- Keep the local packaging flow cross-platform.
- Ensure `npm run package` continues to generate a valid `.xpi` with `manifest.json` at the archive root.
- Keep `package.json` and `public/manifest.json` versions aligned for releases.

## Before Opening A Pull Request

Run:

```bash
npm run build
npm run typecheck
```

If your change affects packaging, also run:

```bash
npm run package
```

## Commit Style

- Use short, descriptive commit subjects.
- Prefer commit messages that explain why the change exists, not only what changed.

## Documentation

- Update `README.md` when setup, packaging, installation, or configuration changes.
- Update `CHANGES.md` for release-facing changes.
