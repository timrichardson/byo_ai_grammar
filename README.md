# mozilla_byo_ai_grammar

`mozilla_byo_ai_grammar` is a Mozilla Thunderbird add-on that provides inline grammar suggestions while composing email. It leaves Thunderbird's native spelling and personal dictionary behavior in place, and sends nearby compose text to a user-configured OpenAI-compatible endpoint such as Together.ai.

## Status

This project is in early development. It currently targets Thunderbird 128+ and uses a lightweight TypeScript build.

## Features

- Grammar-only suggestions layered on top of Thunderbird compose windows
- Nearby-paragraph context with an optional current-paragraph-only mode
- User-configured OpenAI-compatible server URL, model, and saved API key
- Custom prompt support with a bounded prompt budget
- Grammar allowlist for approved phrases and project-specific exceptions
- Per-message pause control

## What You Need

- Thunderbird 128 or newer
- Git
- Node.js 24 or newer
- npm 11 or newer

Check your versions:

```bash
node --version
npm --version
```

## Clone The Project

Linux and macOS:

```bash
git clone https://github.com/timrichardson/mozilla_byo_ai_grammar.git
cd mozilla_byo_ai_grammar
```

Windows PowerShell:

```powershell
git clone https://github.com/timrichardson/mozilla_byo_ai_grammar.git
Set-Location mozilla_byo_ai_grammar
```

## Install Dependencies

All platforms:

```bash
npm install
```

## Build The Extension

Standard build:

```bash
npm run build
```

Type-check the code:

```bash
npm run typecheck
```

Create an installable `.xpi` package:

```bash
npm run package
```

That produces a file like:

```text
mozilla_byo_ai_grammar-0.3.0.xpi
```

## Install In Thunderbird

### Temporary Developer Install

Use this while actively developing:

1. Open Thunderbird.
2. Open the Add-ons Manager.
3. Open `Debug Add-ons`.
4. Click `Load Temporary Add-on`.
5. Select `dist/manifest.json`.

This install disappears when Thunderbird restarts.

### Local Installable Add-On

Use this when you want a normal locally installed extension file:

1. Run `npm run package`.
2. Open Thunderbird.
3. Open the Add-ons Manager.
4. Open the gear menu.
5. Choose `Install Add-on From File...`.
6. Select the generated `.xpi` file.

The `.xpi` is the correct file for a local install. Do not choose `manifest.json` for this path.

## Configure The Add-On

After installation, open the add-on settings and configure:

- OpenAI-compatible server URL
- saved API key
- model string
- grammar checking scope
- custom grammar prompt
- grammar allowlist entries

Recommended Together.ai defaults:

- Server URL: `https://api.together.xyz/v1`
- Model: `openai/gpt-oss-20b`

## API Key Storage And Security

The add-on stores the API key in Thunderbird extension local storage inside your Thunderbird profile.

Important limitations:

- this is convenient for local use
- it is not protected by an OS keychain or hardware-backed secret store
- anyone with access to your local Thunderbird profile may be able to recover it

If you need stronger secrets handling, this project would need a different architecture such as a local proxy or native helper.

## Release Packaging With GitHub Actions

This repository includes a manual GitHub Actions workflow that builds the `.xpi` on demand.

To use it:

1. Open the repository on GitHub.
2. Open the `Actions` tab.
3. Choose `Build Release XPI`.
4. Click `Run workflow`.
5. Optionally provide a tag name if you want the `.xpi` attached to a GitHub Release.

The workflow always uploads the `.xpi` as a workflow artifact. If you choose release upload, it also attaches the same file to the selected GitHub Release.

## Development Notes

- `npm run watch` rebuilds while you edit
- `npm run build` writes runtime files into `dist/`
- `npm run package` creates a Thunderbird-installable `.xpi`
- `package.json` and `public/manifest.json` should stay aligned on release versions

## Contributing

See `CONTRIBUTING.md` for setup, coding standards, and contribution workflow.

## Versioning

This project uses Semantic Versioning (`MAJOR.MINOR.PATCH`).

- `0.y.z` is used during early development
- `MAJOR` increments for incompatible public changes
- `MINOR` increments for new backwards-compatible features
- `PATCH` increments for backwards-compatible fixes

## License

This project is licensed under the Mozilla Public License 2.0. See `LICENSE`.
