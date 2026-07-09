# Plan Dashboard

Lightweight browser-based management console for Airein plans, templates, and configuration.

## Quick Start

```bash
node dashboard/server.js
```

Opens automatically at `http://localhost:3456`.

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--port` | 3456 | HTTP port |
| `--help` | | Show usage |

## Features

### Project Discovery

Projects are discovered automatically by scanning `~/.claude/projects/`. Any project with `docs/plans/` or `.claude/config/quality.json` appears in the dashboard — no manual registration needed.

### Plan Management

- **View plans** — progress, requirements, design, tasks documents
- **Edit documents** — inline editor with markdown rendering
- **Create plans** — choose name and pipeline (s-feature / m-feature / l-feature / hotfix / …)
- **Approve phases** — pipeline visualization with approval buttons that enforce per-pipeline doc rules

### Template Management

- Browse all templates in the airein `templates/` directory
- View and edit template files inline
- JSON templates are validated before saving

### Configuration

Per-project `quality.json` editing with structured form controls:
- Test Guard (enabled, mode)
- Approval Guard (mode)
- Plan Gate (mode, requireActiveTask)
- Test Coverage (minRatio, minSourceFiles, functionThreshold)
- Blocking (testFailure, lowCoverage, buildFailure, untestedSource)
- Flow Control (perTaskReview, worktreeIsolation)
- Airein Log (enabled, level, retentionDays)
- Self-Learning (enabled, promotionThreshold)

Each field shows its default value. Only customized fields are persisted.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Frontend SPA |
| GET | `/api/projects` | List discovered projects |
| GET | `/api/projects/:id/plans` | List plans for a project |
| GET | `/api/projects/:id/plans/:planId` | Plan details with all documents |
| GET/PUT | `/api/projects/:id/plans/:planId/:doc` | Get/save a document (progress, requirements, design, tasks) |
| POST | `/api/projects/:id/plans/:planId/approve` | Approve a phase |
| POST | `/api/projects/:id/plans` | Create a new plan |
| GET | `/api/templates` | List all templates |
| GET/PUT | `/api/templates/*path` | Get/save a template |
| GET/PUT | `/api/projects/:id/config` | Get/save project configuration |

## Architecture

- **Zero npm dependencies** — Node.js built-in `http` module
- **Single HTML file** — embedded CSS + JS, no build step
- **Hash-based routing** — client-side SPA
- **Reuses airein libraries** — `plan-parser.js`, `quality-config.js`, `utils.js`

## File Structure

```
dashboard/
├── server.js          # HTTP server + API routes
├── public/
│   └── index.html     # Frontend SPA
├── test/
│   └── server.test.js # API endpoint tests
└── README.md          # This file
```
