# BYO AI Grammar

`BYO AI Grammar` is a Thunderbird add-on that provides inline grammar suggestions while composing email, where you bring your LLM, as long as it follows the OpenAI API. It leaves Thunderbird's native spelling and personal dictionary behavior in place, and sends the current paragraph while typing, or explicitly selected paragraphs when you click `Check`. In setting you configure the delay, the location of the model and the prompt. 
It has been tested on small models that get lost easily. 

This is alpha release. I have tested it only with together.ai on a very small model(fast, cheap and basic). It seems better than nothing. 

## Screenshots

Inline grammar highlights in the compose editor:

![Inline grammar highlights](docs/images/grammar-highlight.png)

Suggestion popup with replacement and quick actions:

![Grammar suggestion popup](docs/images/grammar-popup.png)

## Status

This project is in early development. It currently targets Thunderbird 128. It has only been used on Ubuntu, on stable Thunderbird, only with together.ai as the model provider and only on a couple of models. The notes about building on other OS are best guesses.

## Features

- Grammar-only suggestions layered on top of Thunderbird compose windows. 
- It doesn't do spelling; there are good tools for that.
- Current-paragraph-only checking while you type
- User-configured OpenAI-compatible server URL, model, and saved API key
- Custom prompt support with a bounded prompt budget
- Grammar allowlist (small, only 50 entries arbitrarily),  support for approved phrases and project-specific exceptions
- Corrected-text plus local diffing so inline suggestions do not depend on model-provided offsets
- Request lifecycle guards that ignore stale responses while you keep typing
- Compose-action `Check` mode for queueing selected paragraphs through the normal per-paragraph grammar suggestion flow
- Optional debug logging for Browser Console and Debug Add-ons troubleshooting
- Per-message pause control
- Undo works the few times I've tried it so far. But I wouldn't bet on it.

### Things to watch
- It ignores pasted content, but you can select text and click the icon, or make some trivial change.
  
  

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
git clone https://github.com/timrichardson/byo_ai_grammar.git
cd byo_ai_grammar
```

Windows PowerShell:

```powershell
git clone https://github.com/timrichardson/byo_ai_grammar.git
Set-Location byo_ai_grammar
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
byo_ai_grammar-<version>.xpi
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
- debug logging toggle
- custom grammar prompt
- grammar allowlist entries

Recommended Together.ai defaults:

- Server URL: `https://api.together.xyz/v1`
- Model: `google/gemma-3n-E4B-it`

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
- `npm run test` runs focused unit tests for prompt, validation, diffing, and request helpers
- `npm run replay:request -- --base-url https://api.together.xyz/v1 --model google/gemma-3n-E4B-it --active-text "These updates is ready to send."` replays a grammar request outside Thunderbird using `BYO_AI_GRAMMAR_API_KEY`, `TOGETHER_API_KEY`, or `OPENAI_API_KEY` and logs request timing
- `npm run benchmark:models -- --base-url https://api.together.xyz/v1 --runs 2` benchmarks a default set of smaller Together chat models for contract reliability and latency using the same grammar prompt and the same supported env vars
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
