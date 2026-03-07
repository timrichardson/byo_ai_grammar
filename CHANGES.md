# Changelog

This project follows Keep a Changelog principles and uses Semantic Versioning.

## [0.3.0] - 2026-03-07

### Changed

- Removed the build-time env API key mode and kept saved Thunderbird storage as the only supported key path
- Switched local packaging to a cross-platform Node-based `.xpi` builder
- Added beginner-focused setup and installation docs, contributor guidance, and a manual release build workflow

## [Unreleased]

### Changed

- Renamed the add-on branding and identifiers from Mozilla BYO AI Grammar to BYO AI Grammar

## [0.2.0] - 2026-03-07

### Added

- API key source selection between saved Thunderbird storage and a build-time env key
- Clear local-storage security guidance in the options page and README
- Default grammar prompt text tuned for contemporary standard English with light formality

### Changed

- Renamed the add-on branding to Mozilla BYO AI Grammar

## [0.1.0] - 2026-03-07

### Added

- Initial Thunderbird Manifest V3 extension scaffold
- TypeScript and esbuild-based local build system
- Options UI for OpenAI-compatible endpoint settings
- Grammar-only prompt flow tuned for contemporary standard English with light formality
- Compose-script grammar highlighting and suggestion popup MVP
- Grammar allowlist support for approved phrases and custom exceptions
- Per-message pause control and basic connection testing
