# CONVENTIONS.md — Jellyfin.Plugin.ActiveStreams

## Always Green / Shift Left

- **Preflight** must pass before any forward work: `dotnet build -c Release`
- Fix cost grows 1 → 10 → 100× from dev → test → production
- Never commit on red Preflight

## Discovered Defects

When you discover a pre-existing defect while working on something else:

1. **quick-fix** — if it's a trivial data-only fix with no logic risk
2. **fix-bug** — everything else (investigate-bug → develop-tdd → validate-fix)
3. Always in a **separate commit** from your feature work

### Banned Dismissive Phrases

| Phrase | Why it's banned |
|--------|----------------|
| "It was already broken" | Every red gate is someone's green gate yesterday |
| "Unrelated to my changes" | You're about to ship it broken |
| "Not introduced by my changes" | You noticed it — you fix it or log it |
| "Out of scope" | A broken build is always in scope |

## Specs Output Convention

- All planning output goes to `specs/`
- Planning artifacts: `specs/product/SCOPE_LATEST.yaml`, `specs/release-plan.yaml`, `specs/epics/`
- Read `specs/` before writing code
- Write specs before writing code

## Defensive Code Categories

*(None defined yet — add as the plugin grows)*
