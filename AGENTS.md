# AGENTS.md

This file gives coding agents and automation tools project-specific guidance for `mozilla_byo_ai_grammar`.

## Project Summary

`mozilla_byo_ai_grammar` is a Mozilla Thunderbird Manifest V3 add-on that adds inline grammar suggestions while composing email.

Important product boundaries:

- Grammar only, not spelling
- Thunderbird native spelling remains the source of truth for spelling and personal dictionary behavior
- OpenAI-compatible backend, with Together.ai as a common target
- User provides their own endpoint, model, and key

## Core Product Decisions

Preserve these unless there is an explicit product decision to change them:

- Do not reintroduce LLM-based spelling checks as a first-class feature.
- Keep the add-on grammar-focused and conservative.
- Treat Thunderbird native spellcheck as complementary, not something to replace.
- Keep inline UX lightweight and robust rather than overly clever.
- Prefer bounded paragraph-level or nearby-paragraph context instead of whole-message live checking.

## Repository Layout

- `public/` - static extension assets such as `manifest.json`, `background.html`, options UI HTML/CSS, icons
- `src/background/` - background page logic, settings, menus, compose-script registration, LLM client
- `src/compose/` - compose-window DOM logic, block extraction, highlights, popup UI, range mapping
- `src/options/` - options page TypeScript
- `src/shared/` - shared types, prompt logic, validation, and shared constants
- `scripts/` - local tooling such as `.xpi` packaging
- `.github/workflows/` - GitHub Actions workflows

## Local Commands

- `npm install` - install dependencies
- `npm run build` - build extension into `dist/`
- `npm run watch` - rebuild on change
- `npm run typecheck` - run TypeScript checks
- `npm run package` - build and create an installable `.xpi`

## Thunderbird Install Paths

Use one of these during development:

- Temporary dev load: select `dist/manifest.json` in Thunderbird Debug Add-ons
- Local installable package: run `npm run package` and install the generated `.xpi`

Do not assume Thunderbird can install directly from source files outside `dist/`.

## Architecture Notes

### Background Page

The background layer is responsible for:

- settings storage
- compose-script registration
- OpenAI-compatible network requests
- response validation and filtering
- per-tab pause state
- menu actions

Background code must tolerate restart/reload behavior and should keep setup idempotent.

### Compose Script

The compose script is responsible for:

- identifying the active block and nearby context
- sending bounded check requests to the background page
- rendering inline highlight overlays
- showing the suggestion popup
- applying accepted replacements

Be careful with DOM changes. Do not let extension UI leak into outgoing message content.

### Prompt And Validation

Prompting lives in `src/shared/prompt.ts`.

Guardrails:

- keep prompts short and simple enough for smaller models
- target contemporary standard English with light formality
- preserve names, product names, quoted text, and meaning
- require strict JSON output
- validate all model output before use

## API Key Handling

One supported mode exists:

- saved key in Thunderbird `browser.storage.local`

Important:

- local storage should not be described as high-security secret storage

Do not remove or soften the security warnings in the UI or docs without good reason.

## Coding Standards

### TypeScript

- Keep TypeScript `strict`-friendly
- Prefer explicit shared types for messages and settings
- Avoid `any` unless there is a clear Thunderbird API typing gap
- Prefer defensive parsing around network responses and editor state

### UI

- Keep copy plain, direct, and beginner-friendly
- Use the established naming consistently: `Mozilla BYO AI Grammar`, `grammar suggestions`, `allowlist`
- Do not introduce a frontend framework for small UI changes
- Keep options and popup UI usable on narrow windows

### Packaging And Release

- Keep `npm run package` working on Linux, macOS, and Windows
- Keep `manifest.json` at the root of the generated `.xpi`
- Keep `package.json` and `public/manifest.json` versions aligned
- If release packaging changes, update both `README.md` and the GitHub Action workflow

## Documentation Requirements

When behavior changes, update the relevant docs:

- `README.md` for setup, installation, configuration, and release workflow changes
- `CONTRIBUTING.md` for workflow or coding-standard changes
- `CHANGES.md` for release-facing user-visible changes

## Things To Avoid

- Re-adding spelling corrections as a normal suggestion path
- Sending whole-message draft content by default while typing
- Expanding prompt size carelessly
- Introducing telemetry or analytics
- Claiming secure secret storage where none exists
- Breaking cross-platform packaging for `.xpi` generation

## Good Next-Step Areas

Useful future work includes:

- improving plain-text compose fallback behavior
- improving overlay stability during scroll or layout changes
- refining grammar allowlist behavior
- improving release automation while keeping local packaging simple
