# Support

## Where to get help

| Need | Where |
|------|--------|
| Bug / feature | [GitHub Issues](https://github.com/testfree2023/airein/issues) |
| Security vulnerability | **Private** — see [docs/SECURITY.md](docs/SECURITY.md) (do not open a public issue) |
| Contributing | [CONTRIBUTING.md](CONTRIBUTING.md) · [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
| Install / upgrade / uninstall | [README](README.md#30-秒安装) · [docs/deployment.md](docs/deployment.md) · `airein uninstall` |
| Cold-start SLA ledger (E3) | [docs/plans/P009-marketplace-readiness/sla-ledger.md](docs/plans/P009-marketplace-readiness/sla-ledger.md) |
| Multi-host (Cursor / …) | [docs/install-hosts.md](docs/install-hosts.md) |
| Walkthrough | [docs/demo.md](docs/demo.md) |
| User-facing release notes | [CHANGELOG.md](CHANGELOG.md) |

## What “supported” means

- **Latest `VERSION` line** (currently **2.06**) receives fixes; see [CHANGELOG.md](CHANGELOG.md) and GitHub Releases / tags (`v2.06`, …).
- Runtime is **local-only**: hooks and scripts run on your machine; no airein cloud, no telemetry upload by design.
- Prefer **HTTPS** clone/install URLs in docs so corporate firewalls and CI match the same command.

## Trust model (read before install)

`airein setup` / `airein update` will:

1. Install a kernel under `~/.airein/` (skills, rules, hooks, scripts, templates, Dashboard).
2. **Register hooks** into the host you select (Claude Code `~/.claude/` and/or Cursor project `.cursor/`, etc.).
3. Run **local Node/bash scripts** from that kernel — **zero npm dependencies**, but you should still review `scripts/` if your org requires supply-chain review.

It will **not** overwrite your global/project `CLAUDE.md` / Cursor user rules by design. Uninstall: `airein uninstall` (see deployment docs).

> Skills-only installers (`npx skills add …`) copy skill markdown only. They do **not** install hooks or the kernel. Full product = `airein setup`.

## Known limitations

| Area | Status |
|------|--------|
| **Claude Code + Cursor** | First-class via `airein setup` |
| **Codex / CodeBuddy / OpenCode** | Detected / install-host path exists; treat as **preview**, not “works everywhere out of the box” |
| **Windows** | Use **Git Bash** for `airein` CLI; Cursor host install has Windows-specific notes in [install-hosts.md](docs/install-hosts.md) |
| **Cursor IDE full smoke** | Some IDE-path smoke checks remain deferred; CLI/hooks are the verified path — report gaps in Issues |
| **Bash** | Need bash ≥ 4 (macOS stock may need upgrade; Git Bash on Windows is fine) |
| **Node** | ≥ 18 |
| **Network** | Online `git clone` preferred; offline: `airein setup --source <dir\|archive>` (P002) |
| **Dashboard** | Local `http://localhost:3456` by default; `--lan` exposes on LAN — only enable on trusted networks |
| **Self-learning / session memory** | Stored on disk under project / Claude project keys; **not** synced via git unless you copy deliberately |

## Maintainer response

Best-effort for community Issues. Security reports: acknowledgment target **72 hours** (see SECURITY policy).
