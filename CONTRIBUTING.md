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
- `npm run test` - run focused unit tests
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
- Prefer local diffing and snapshot-based reconciliation over trusting model-supplied offsets.
- When adding logging, keep normal operation quiet and gate verbose logs behind the debug setting.
- Write code and comments for an intermediate TypeScript contributor with only basic Thunderbird extension familiarity.
- Use concise TSDoc-style doc comments for exported functions, exported types, and non-obvious shared helpers.
- Use comments to explain intent, assumptions, lifecycle constraints, and Thunderbird-specific quirks rather than obvious line-by-line behavior.
- Update nearby documentation when changing non-obvious background lifecycle code, compose DOM handling, prompt contracts, validation, or reconciliation logic.

Examples:

```ts
/**
 * Compose-side helpers for mapping Thunderbird editor text offsets back to DOM ranges.
 *
 * Thunderbird compose markup is not stable across plain-text and HTML modes, so callers
 * should treat these helpers as best-effort and always validate returned ranges.
 */

/**
 * Returns the visible text offset for the current selection start within the compose body.
 *
 * Thunderbird may place the caret inside wrapper elements that do not correspond to the
 * outgoing message HTML, so this walks visible text rather than trusting DOM depth alone.
 */
export function getSelectionVisibleOffset(): number | null {
  // ...
}

// Ignore extension-owned overlay nodes here so suggestion UI never leaks into
// the text snapshot used for prompts or outgoing-message DOM reconciliation.
```

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
npm run test
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
- Keep code documentation in sync with behavior changes, especially on exported APIs and Thunderbird-specific logic.
