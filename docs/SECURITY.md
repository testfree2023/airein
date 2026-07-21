# Security Policy

## Supported versions

Only the **latest published `VERSION` line** receives security fixes. Check the repo root [`VERSION`](../VERSION) file and [CHANGELOG.md](../CHANGELOG.md) / GitHub Release tag (e.g. `v2.06`).

| Version | Supported |
|---------|-----------|
| Latest `VERSION` (currently 2.06.x) | ✅ |
| Older minor / checkpoint tags | ❌ (upgrade; see CHANGELOG) |

## Reporting a vulnerability

**Do NOT open a public issue for security vulnerabilities.** Report privately instead:

1. **Preferred** — GitHub private vulnerability reporting: [Report a vulnerability](https://github.com/testfree2023/airein/security/advisories/new). Opens a private advisory visible only to maintainers.
2. Or contact the maintainer via their [GitHub profile](https://github.com/testfree2023).

Please include:
- Description and impact
- Steps to reproduce / proof of concept
- Affected version

You will receive an acknowledgment within **72 hours**. We coordinate a fix and disclosure timeline with you, and credit your report unless you prefer to remain anonymous.

## Scope

airein is a **local-only** engineering framework: zero external runtime dependencies, zero npm packages, no network calls by design. (See `docs/roadmap.md` — "纯本地,零外部依赖" is a hard constraint.)

**In scope:**
- Hooks that fail-open when they should block (hook bypass — the core "Hook 是法律" guarantee)
- Path traversal or command injection in hook scripts (`scripts/hooks/*.js`, `scripts/lib/*.js`)
- Secret leakage committed into the repository
- Branch protection / ruleset bypass

**Out of scope:**
- Vulnerabilities in Claude Code or host AI tools (Cursor/Codex/CodeBuddy/OpenCode) themselves — report upstream
- Issues that require network access to exploit — airein has none by design

## Trust notes for installers

Remote bootstrap (`scripts/install.sh` / `scripts/install.ps1` via `curl | bash` or `irm | iex`) clones this repository and runs `airein setup --yes`. Treat it like any other remote installer: prefer an auditable clone when policy requires it.

`airein setup` / `update` installs a local kernel under `~/.airein/`, registers **host hooks**, and runs **local scripts**. There is no npm install tree, but you should still review `scripts/` if your organization requires supply-chain review. See [SUPPORT.md](../SUPPORT.md).

Skills-only market installers (`npx skills add …`) typically copy skill markdown only and **do not** deploy hooks — they are not a substitute for `airein setup`.

## Hardening already in place

- **Secret scanning + Push protection** — GitHub blocks pushes containing detected secrets
- **Branch protection on `main`** — force push and deletion disabled; changes require a pull request
- **Dependabot alerts** — dependency vulnerability notifications
