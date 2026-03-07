# mozilla_byo_ai_grammar

`mozilla_byo_ai_grammar` is a Mozilla Thunderbird add-on project that provides inline grammar suggestions while composing email. It leaves native Thunderbird spelling and personal-dictionary behavior in place, and uses a user-configured OpenAI-compatible endpoint such as Together.ai for grammar analysis.

## Status

This project is in early development. The current working version targets Thunderbird 128 and uses a lightweight TypeScript build.

## Features

- Grammar-only suggestions layered on top of Thunderbird compose windows
- Nearby-paragraph context with an optional current-paragraph-only mode
- User-configured OpenAI-compatible endpoint, API key, and model
- Custom prompt support with a bounded prompt budget
- Grammar allowlist for approved phrases and project-specific exceptions
- Per-message pause control

## Development

### Requirements

- Node.js 24+
- npm 11+
- Thunderbird 128+

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Type-check

```bash
npm run typecheck
```

### Load in Thunderbird

For development, load the built add-on from `dist/manifest.json`:

1. Open Thunderbird
2. Open Add-ons Manager
3. Choose `Debug Add-ons`
4. Click `Load Temporary Add-on`
5. Select `dist/manifest.json`

To distribute it later, package the contents of `dist/` into an `.xpi` archive with `manifest.json` at the top level.

## Configuration

The options page lets you configure:

- OpenAI-compatible server URL
- API key
- model string
- grammar checking scope
- custom grammar prompt
- grammar allowlist entries

## Versioning

This project uses Semantic Versioning (`MAJOR.MINOR.PATCH`).

- `0.y.z` is used during early development
- `MAJOR` increments for incompatible public changes
- `MINOR` increments for new backwards-compatible features
- `PATCH` increments for backwards-compatible fixes

`package.json` and `public/manifest.json` should stay aligned on released versions.

## License

This project is licensed under the Mozilla Public License 2.0. See `LICENSE`.
