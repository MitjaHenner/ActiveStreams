# Jellyfin.Plugin.ActiveStreams — AI Agents

Read CONVENTIONS.md before any GitHub or git operation.

<!-- BEGIN bigpowers:project -->
## Project
A Jellyfin plugin that shows a widget of active streams.
Stack: C#, .NET 8, Jellyfin Plugin API

## Commands
| Action | Command |
|--------|---------|
| Build  | `dotnet build -c Release` |
| Preflight | `dotnet build -c Release` |

## Architecture
Plugin.cs entry point, Configuration page for settings, and a JS widget that polls the Jellyfin API for active streams.

## Conventions
- Standard C# naming conventions apply
- Follow Jellyfin plugin patterns

## Never
- Never dismiss reproducible gate failures as pre-existing or out of scope

## Agent Rules
- **Workflow Mandate:** You MUST use the bigpowers skills (e.g. `plan-work`, `develop-tdd`, `orchestrate-project`) to perform tasks. DO NOT write code directly in response to a user prompt like "build this feature".
- **Always Green:** Preflight must be green before forward work.
- Read specs/ before writing code.
- All planning and specifications MUST be written to `specs/` (`product/SCOPE_LATEST.yaml`, `release-plan.yaml`, `epics/`) before any code is generated.
- Write the minimum code that solves the stated problem. Nothing extra.
- One clarifying question beats a wrong assumption baked into 200 lines.
<!-- END bigpowers:project -->

<!-- BEGIN bigpowers:context-routing -->
## Context Routing

| Glob | Sub-AGENTS.md |
|------|---------------|
| *(none yet)* | |
<!-- END bigpowers:context-routing -->

<!-- BEGIN bigpowers:learned-preferences -->
## Learned User Preferences

*(none yet)*

## Workspace Facts

- **Injected JS runs in a constrained browser context:** `ApiClient` methods are only available after page load. `ApiClient.getUser(id)` is unavailable to injected scripts; use `ApiClient.getCurrentUser()` instead. Even `getCurrentUser` may fail early — gate `waitForApiClient` on its existence and retry with backoff.
<!-- END bigpowers:learned-preferences -->
