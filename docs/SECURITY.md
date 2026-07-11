# Security Policy

## Supported versions

airein is pre-1.0 (`v0.x`). Only the latest minor line receives security fixes.

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅ |
| < 0.1   | ❌ |

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

## Hardening already in place

- **Secret scanning + Push protection** — GitHub blocks pushes containing detected secrets
- **Branch protection on `main`** — force push and deletion disabled; changes require a pull request
- **Dependabot alerts** — dependency vulnerability notifications
