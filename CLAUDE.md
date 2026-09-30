@AGENTS.md

# CLAUDE.md

`AGENTS.md` is the single source of truth for this repo — project rules, architecture, decisions,
and current state, shared by every coding agent (Claude Code, Codex/GPT Sol, Cursor). It is imported
above, so Claude Code loads it automatically. **Do not duplicate content here.** When architecture or
rules change, edit `AGENTS.md`.

## Claude-specific notes

- Explain work in plain language — Abe is not a developer by trade.
- Commit locally; push only when Abe explicitly asks. `main` auto-deploys to the live site.
- Local dev and live share the same Supabase project (`rejunk-prod`) — treat local writes as production writes.
- Two coding agents run in parallel (Claude Code and GPT Sol). Never edit files another agent is currently working in.
- Read `DECISIONS.md` before relitigating anything settled.
