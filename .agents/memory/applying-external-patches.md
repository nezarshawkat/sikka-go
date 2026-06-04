---
name: Applying external/pasted patches in this repo
description: Gotchas when a user pastes a git diff to apply (CRLF, api-server no hot-reload)
---

# Applying a user-pasted git patch

When a user attaches a `git apply` patch (often wrapped in a `(cd ... && git apply --3way <<'EOF' ... EOF)` shell heredoc):

1. **Strip the shell wrapper** — extract just the diff: drop the leading `(cd ... <<'EOF'` line and the trailing `EOF` / `)` lines. e.g. `sed '1d' file | sed '/^EOF$/,$d' > /tmp/edits.patch`.

2. **CRLF is the usual reason `git apply` rejects every hunk.** Pasted patches frequently arrive with `\r\n` line endings; git's context match then fails on every line (git shows the search text with a trailing `?` per line = the carriage return). Fix: `tr -d '\r' < edits.patch > edits_lf.patch`, then `git apply --check edits_lf.patch` will pass.

3. **Do NOT use `--3way` as main agent** — it writes objects into `.git/objects` and is blocked as a "destructive git operation". Plain `git apply --whitespace=nowarn edits_lf.patch` only touches working-tree files and is allowed. After CRLF strip, plain apply usually works without 3way anyway.

**Why:** these two issues (CRLF, 3way-blocked) make a perfectly valid patch look like it "doesn't apply", wasting a debug cycle.

# api-server does not hot-reload

`@workspace/api-server` dev script is `build (esbuild bundle) && start (node dist)` — it does NOT watch. After editing any api-server source (engine, routes, utils), you MUST restart the `artifacts/api-server: API Server` workflow for changes to take effect. The Vite frontend (sikka) DOES hot-reload, so frontend-only edits don't need a restart.
