# Changelog

This project follows Keep a Changelog principles and uses Semantic Versioning.

## [0.5.10] - 2026-03-09

### Changed

- Changed the default Together model to `meta-llama/Meta-Llama-3-8B-Instruct-Lite` after it passed the current basic and homophone benchmark sets
- Improved tiny inline suggestion affordances by giving one-character fixes a minimum visible underline width

## [0.5.9] - 2026-03-09

### Changed

- Rechecked only the edited paragraph immediately after applying a suggestion so remaining hints refresh quickly, and filtered out smart-quote-only changes as non-grammar noise

## [0.5.8] - 2026-03-09

### Changed

- Gave very small inline grammar suggestions a minimum visible underline width so one-character fixes look clearly actionable instead of nearly invisible

## [0.5.7] - 2026-03-09

### Changed

- Kept `Reset Ignored Suggestions` always available in the compose context menu so message-level ignores can be cleared even when no popup is open

## [0.5.6] - 2026-03-09

### Changed

- Fixed the editable suggestion field so it takes focus when the popup opens instead of leaving keyboard focus in the compose editor

## [0.5.5] - 2026-03-09

### Changed

- Added editable replacement text in the suggestion popup, moved ignored-suggestion reset into the compose context menu, and removed allowlisted suggestion highlights immediately after approval

## [0.5.4] - 2026-03-09

### Changed

- Moved `Reset ignored suggestions` to the compose context menu so it stays available even when no popup is open, and removed accepted suggestion hints immediately after applying a replacement

## [0.5.3] - 2026-03-09

### Changed

- Added a `Reset ignored checks` action so message-level `Ignore once` decisions can be cleared and restored without reopening the draft

## [0.5.2] - 2026-03-09

### Changed

- Adjusted inline grammar underline colors for light and dark compose surfaces so highlight feedback keeps better contrast across Thunderbird themes

## [0.5.1] - 2026-03-09

### Changed

- Enlarged invisible click targets for tiny inline grammar highlights so one-character corrections are easier to open without changing the visible underline size

## [0.5.0] - 2026-03-09

### Changed

- Added LM Studio local-model compatibility by allowing blank localhost API keys and preferring `json_schema` structured output with `json_object` fallback
- Confirmed the tested LM Studio connection settings: `http://127.0.0.1:1234/v1` with model `google/gemma-3-4b`, plus `Enable CORS` turned on in LM Studio server settings

## [0.4.31] - 2026-03-08

### Changed

- Switched structured grammar requests to `json_schema` by default, kept `json_object` as a fallback, and verified compatibility with both Together.ai and LM Studio

## [0.4.30] - 2026-03-08

### Changed

- Updated the grammar prompt to request `needs_change` alongside `corrected_text`, then used that signal to keep acceptable text unchanged while preserving the improved homophone behavior on `google/gemma-3n-E4B-it`

## [0.4.29] - 2026-03-08

### Changed

- Added a homophone-focused grammar benchmark set, tightened the universal grammar prompt for context-sensitive function-word mistakes, and verified `google/gemma-3n-E4B-it` against those cases

## [0.4.28] - 2026-03-08

### Changed

- Added deletion-only grammar suggestions so fixes that remove a word now offer a usable inline action, such as removing `run` from `The cat run ran up the tree.`

## [0.4.27] - 2026-03-08

### Changed

- Tracked paragraph suggestions by logical paragraph identity instead of transient DOM ids so refreshing one paragraph does not clear valid suggestions on others
- Added paragraph-lane debug logging to show request replacement, paragraph remapping, and highlight render failures more clearly while debugging compose behavior

## [0.4.26] - 2026-03-08

### Changed

- Submitted the previous paragraph immediately when pressing Enter so finished paragraphs still get checked before the caret moves on
- Kept prior paragraph suggestions visible more reliably when Thunderbird remaps paragraph DOM nodes after edits or new lines

## [0.4.25] - 2026-03-08

### Changed

- Added README screenshots for inline highlights and the suggestion popup
- Expanded connection-test failures to show the three sample checks and point contributors to `src/background/llm-client.ts`
- Kept valid suggestions visible on previously checked paragraphs while only refreshing the paragraph that was rechecked

## [0.4.23] - 2026-03-08

### Changed

- Added insertion-only local grammar suggestions so missing helper words and punctuation can appear as inline fixes
- Made `Test connection` run three benchmark-style sample checks, keep results out of saved settings, and show each case on its own line in the options page
- Improved settings sanitization, reduced sensitive debug logging by default, refreshed overlay positioning after scroll or resize, and removed the unused `notifications` permission

## [0.4.22] - 2026-03-08

### Changed

- Removed the paragraph-scope setting and made automatic compose checks current-paragraph-only by default
- Changed compose-action `Check` mode to process selected paragraphs individually even when the old paragraph-only option had been enabled, so multi-paragraph selections always render normal inline suggestions across every selected block
- Removed quoted-reply exclusion and now only keep signature content out of automatic grammar checks

## [0.4.19] - 2026-03-08

### Changed

- Replaced the toolbar and add-on icons with a teacher-inspired spectacles mark, including a muted paused variant for the compose action
- Added a third compose-action state that switches the toolbar button to `Check` for selected paragraphs, then runs each selected paragraph through the normal bounded grammar-check flow so all paragraph-level corrections still appear inline

## [0.4.18] - 2026-03-08

### Changed

- Added a visible-text snapshot poller as a backstop for Thunderbird compose changes that do not surface reliable paste or mutation events, so pasted text should still trigger the normal debounce timer

## [0.4.17] - 2026-03-08

### Changed

- Watched compose-body mutations in addition to input events so pasted text and other Thunderbird editor updates still trigger the normal debounce timer

## [0.4.16] - 2026-03-08

### Changed

- Shortened the compose-action toolbar label to a compact `On` or `Off` state while keeping the fuller pause or resume text in the tooltip
- Swapped the compose-action icon to a muted paused variant instead of showing a badge when suggestions are paused for a draft

## [0.4.15] - 2026-03-08

### Changed

- Ignored whitespace-only cleanup suggestions so trailing spaces at the end of a paragraph no longer appear as grammar fixes
- Scheduled grammar checks on paste events in Thunderbird compose so pasted text follows the same debounce flow as typed text
- Clarified in the options UI that the 0.9 second debounce is the default and remains user-configurable
- Applied accepted suggestions through Thunderbird's editor command path when possible so undo and redo can include extension-made replacements

## [0.4.13] - 2026-03-08

### Changed

- Bundled nearby whitespace-separated grammar edits into one local suggestion so clause-level rewrites are offered as a single fix instead of multiple tiny popups

## [0.4.12] - 2026-03-08

### Changed

- Simplified the grammar prompt and made corrected-text parsing more tolerant of non-standard JSON or plain-text responses so cheaper Together models are less brittle
- Changed the default Together model to `google/gemma-3n-E4B-it` based on current reliability and latency checks, while keeping the model field user-editable

## [0.4.11] - 2026-03-08

### Changed

- Increased the grammar-request and connection-test timeout to 60 seconds during Together latency debugging so we can rule out slow model startup before blaming transport issues

## [0.4.10] - 2026-03-08

### Changed

- Stopped aborting older in-flight grammar requests while debugging Together transport stalls, and now rely on stale-response ignoring plus concurrent-request diagnostics instead

## [0.4.9] - 2026-03-08

### Changed

- Added fetch-phase timing diagnostics for grammar requests so logs show the endpoint, payload size, header arrival, body arrival, and transport failure timing
- Added `npm run replay:request` to replay the grammar API call outside Thunderbird for side-by-side latency troubleshooting

## [0.4.8] - 2026-03-08

### Changed

- Classified 15-second language-service timeouts as visible timeout errors instead of generic aborts so stalled requests are easier to diagnose

## [0.4.7] - 2026-03-08

### Changed

- Expanded quoted-reply exclusion so HTML compose replies that render as `On ... wrote:` headers are ignored even when Thunderbird visible text does not include leading `>` markers
- Added raw compose-body HTML to signature and quote debug logs so Thunderbird HTML reply structure is visible during troubleshooting

## [0.4.6] - 2026-03-07

### Changed

- Enabled debug logging by default to make Thunderbird troubleshooting easier during development
- Added startup build fingerprints, mirrored compose logs into the background console, and expanded diagnostics for signature handling, text previews, and malformed model responses
- Reworked signature exclusion to follow the actual `--` separator line as a signature-block boundary in compose content
- Switched signature detection to use the full visible compose text so the `--` separator is found even when Thunderbird's DOM structure is not helpful
- Added timestamps to BYO AI Grammar logs and hardened in-flight request tracking so only older requests are aborted

## [0.4.2] - 2026-03-07

### Changed

- Replaced model-provided offset handling with corrected-text responses and local diff-based suggestion generation
- Added request cancellation and stale-response protection so older checks do not repaint newer compose state
- Added focused unit tests for prompt generation, validation, diffing, and request lifecycle helpers
- Added an optional debug mode that logs compose request flow and background request handling to Thunderbird developer consoles
- Added a 15-second timeout for connection tests and grammar service calls so stalled requests fail visibly instead of hanging indefinitely
- Defaulted to current-paragraph-only checking and expanded diagnostics for signature exclusion, active block previews, and malformed LLM responses
- Fixed compose-script startup in Thunderbird compose windows by avoiding unsupported `browser.tabs` access in the compose-script context
- Replaced `crypto.randomUUID()` with a compose-safe local block id generator
- Added the current add-on version to the preferences page
- Excluded quoted reply text and email signatures from compose-window grammar checking

## [0.3.1] - 2026-03-07

### Changed

- Added visible in-editor status feedback so compose windows show when grammar checking is active, paused, or ready
- Clarified the compose action wording to describe pause and resume behavior for the current draft

## [0.3.0] - 2026-03-07

### Changed

- Removed the build-time env API key mode and kept saved Thunderbird storage as the only supported key path
- Switched local packaging to a cross-platform Node-based `.xpi` builder
- Added beginner-focused setup and installation docs, contributor guidance, and a manual release build workflow

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
