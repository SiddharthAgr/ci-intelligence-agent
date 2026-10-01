# CI Intelligence Agent (`ci-agent`)

> Standalone, AI-Independent Developer Tool for CI/CD Pipeline Intelligence, Failure Memory & Deployment Safety.

*Note: The original prototype was developed and demonstrated using IBM Bob 2.0 during the IBM Bob 2.0 Hackathon. The system has since been transformed into a fully standalone developer tool that operates independently of IBM Bob.*

---

## 1. Project Overview

**CI Intelligence Agent (`ci-agent`)** is a local developer tool and CLI that automates CI/CD failure analysis, historical failure recall, coverage gate verification, release readiness checks, and deployment safety enforcement. It operates via a provider-agnostic AI reasoning layer, a standalone Model Context Protocol (MCP) client & server, and a SQLite-backed failure memory store.

---

## 2. Problem Statement

Traditional CI/CD workflows force developers to context-switch across disconnected tools: CI build dashboards, test outputs, log viewers, Slack threads, and deployment terminals. When the same failure signatures recur across sprints:
- **No Institutional Memory**: Engineers re-diagnose identical test failures from scratch.
- **Manual Triage**: Correlating CI failures with past fixes is manual, error-prone, and time-consuming.
- **Unenforced Safety Gates**: Deployment gates and test coverage thresholds are checked manually or bypassed, leading to unstable deployments.

---

## 3. Solution

`ci-agent` brings intelligent automation directly to the command line:
1. **Automated Failure Triage**: Fetches pipeline failures, extracts signatures, and searches historical memory for matching past failures.
2. **Failure Memory**: Uses a SQLite store with SHA-256 failure signature indexing (`SHA-256(test_name:error_type:failing_file)`) to recall historical root causes and recommended actions (`rerun`, `fix`, `revert`, `escalate`).
3. **Coverage & Release Readiness**: Programmatically evaluates branch code coverage and open blocker failures against release rules.
4. **Standalone Safety Guard**: Intercepts dangerous deployment commands (`kubectl apply`, `helm upgrade`, `git push --force`) and blocks execution unless release gates pass.
5. **Decoupled & Standalone Architecture**: Runs locally via CLI or MCP protocol without external SaaS subscriptions or proprietary agent lock-in.

---

## 4. Key Capabilities

- **Interactive CLI & Direct Commands**: `ci-agent` interactive menu mode and direct subcommands (`ci-agent triage run-42`, `ci-agent release-check feat-auth`).
- **Provider-Agnostic AI Reasoning Layer**: Abstracted reasoning engine (`BaseAIProvider`, `RuleBasedAIProvider`) with optional LLM provider integration (`GEMINI_API_KEY`).
- **MCP Server & Client**: Standalone Node.js MCP server exposing 5 tools over STDIO, accompanied by an independent `MCPClient`.
- **Deterministic Fixture Demo**: `ci-agent demo` command for reproducible end-to-end testing against seeded pipeline runs and coverage reports.
- **Audit & Session Logging**: Automatic logging to `memory/sessions.jsonl` and SQLite `sessions` table.

---

## 5. System Architecture

```
Developer / CLI (ci-agent)
          ↓
  AI Reasoning Layer (Provider-Agnostic)
          ↓
   Safety & Workflow Middleware (Prompt Gate & Deploy Guard)
          ↓
   MCP Client (StdioClientTransport)
          ↓
   Node.js MCP Server (mcp/server.js)
          ↓
   MCP Tools (run_pipeline, recall_failures, store_failure, check_release_readiness, get_coverage_report)
          ↓
   Python Core Services (python/) & SQLite Failure Memory (memory/failures.db)
```

---

## 6. Installation

### Prerequisites
- **Node.js**: >= 20.0.0
- **Python**: >= 3.10

### Setup

```bash
# Clone the repository
git clone https://github.com/SiddharthAgr/ci-intelligence-agent.git
cd ci-intelligence-agent/bob-ci-agent

# Install Node dependencies
npm install

# Seed the SQLite failure memory database
npm run seed-db

# (Optional) Link CLI binary globally
npm link
```

---

## 7. Configuration

Configuration options can be set via environment variables or CLI flags:

| Environment Variable | Required | Default | Description |
|---|---|---|---|
| `CI_API_TOKEN` | Optional | `""` | GitHub API token for live CI run lookups |
| `GITHUB_REPO` | Optional | `""` | GitHub repository (`owner/repo`) for live CI runs |
| `GEMINI_API_KEY` | Optional | `""` | Google Gemini API key for external LLM reasoning |

---

## 8. AI Provider Configuration

The AI Reasoning Layer is provider-agnostic:
- **Deterministic / Rule-Based Mode (Default)**: Out-of-the-box expert system that orchestrates MCP tools deterministically without requiring external API keys.
- **Gemini / LLM Provider Mode**: When `GEMINI_API_KEY` is exported, the reasoning engine enables model function-calling over MCP tools.

---

## 9. MCP Server Usage

The MCP server runs independently over standard I/O (STDIO) transport.

```bash
# Start MCP server directly
npm run start-mcp
```

### Registered Tools
1. `run_pipeline`: Fetches CI run status and failure details.
2. `recall_failures`: Searches failure memory by SHA-256 signature.
3. `store_failure`: Persists failure triage findings to SQLite.
4. `check_release_readiness`: Evaluates release readiness gates (coverage threshold, open blockers).
5. `get_coverage_report`: Parses coverage metrics from reports.

---

## 10. CLI Usage

### Interactive Mode

Simply run `ci-agent` (or `node bin/ci-agent.js`) to launch the interactive prompt menu:

```bash
ci-agent

==================================================
            CI Intelligence Agent
==================================================

1. Run pipeline
2. Analyze failure
3. Recall previous failures
4. Store failure
5. Check coverage
6. Check release readiness
7. Triage failure
8. Deployment safety
9. Exit
```

### Direct Commands

```bash
# Triage a CI pipeline run
ci-agent triage run-42

# Check coverage for a branch
ci-agent coverage feat-auth

# Evaluate release readiness gates
ci-agent release-check feat-auth

# Query historical failure memory by signature
ci-agent failure recall e05df3df6765b575ef14be0d76c581b5d7e29f641cd5520c270680c0fb63ecde

# Evaluate deployment safety for a command
ci-agent deploy-check "kubectl apply -f deployment.yaml"

# Ask natural language question to AI reasoning engine
ci-agent ask "Why did run-42 fail?"
```

---

## 11. Demo Instructions

Run the deterministic end-to-end demonstration:

```bash
ci-agent demo
```

The demo executes all 7 intelligence stages in sequence using local seeded fixtures (`demo/fixtures/run-42.json` and `reports/coverage-feat-auth.json`).

---

## 12. MCP Tools

| Tool Name | Input Schema | Output Schema Summary |
|---|---|---|
| `run_pipeline` | `{ ref: string }` | `{ status, failures: [{ test_name, error_type, failing_file }], source }` |
| `recall_failures` | `{ signature: string, limit?: number }` | `{ matches: [{ failure_id, action, confidence, recommendation }], total_found }` |
| `store_failure` | `{ signature, test_name, error_type, failing_file, action, confidence, ... }` | `{ stored: true, failure_id, stored_at }` |
| `check_release_readiness` | `{ ref: string, target_env?: string }` | `{ overall: "PASS"|"WARNING"|"BLOCKER", checks: [...] }` |
| `get_coverage_report` | `{ ref: string }` | `{ total_coverage_pct, files: [{ path, coverage_pct, uncovered_lines }] }` |

---

## 13. Failure-Memory Architecture

Historical failure memory is persisted in SQLite (`memory/failures.db`).

### Schema Highlights

- **`failures` Table**:
  - `id`: Unique failure record ID (`f-<uuid>`).
  - `signature`: Index key generated via `SHA-256(test_name + ":" + error_type + ":" + failing_file)`.
  - `action`: Recommended resolution (`rerun`, `fix`, `revert`, `escalate`).
  - `confidence`: Confidence rating (`high`, `medium`, `low`).
  - `stored_at`: ISO timestamp.
- **`sessions` Table**:
  - Audit trail of agent execution runs and triage outcomes.

---

## 14. Testing

### Run All Test Suites

```bash
# Node integration, MCP client, and workflow tests
npm test

# Python core unit tests
python -m unittest discover -s tests -p "test_*.py"
```

---

## 15. Development Instructions

```bash
# Project root directory
cd bob-ci-agent

# Run MCP server in debug mode
node mcp/server.js

# Test custom workflow scripts
node tests/test_workflows.js
```

---

## 16. Project Structure

```
.
├── README.md                          # Main project documentation
├── README_ANTIGRAVITY_CHANGES.md      # Detailed migration log
└── bob-ci-agent/                      # Core package directory
    ├── bin/
    │   └── ci-agent.js                # CLI binary entrypoint
    ├── src/
    │   ├── ai/                        # AI Reasoning Layer (Provider-Agnostic)
    │   ├── cli/                       # CLI router & interactive menu & demo
    │   ├── mcp/                       # Standalone MCP Client implementation
    │   ├── memory/                    # Session manager & memory context loader
    │   ├── safety/                    # Prompt gate & Deploy guard safety middleware
    │   └── workflows/                 # Triage, Coverage, Release & Deploy workflows
    ├── mcp/
    │   ├── server.js                  # Standalone Node.js MCP server
    │   ├── db.js                      # WASM SQLite wrapper (sql.js)
    │   └── tools/                     # MCP Tool handlers (5 tools)
    ├── python/                        # Core Python services
    │   ├── ci_client.py               # Pipeline reader & fixture validator
    │   ├── coverage_reader.py         # Coverage report parser
    │   ├── release_checks.py          # Release gate business logic
    │   └── bridge.py                  # CLI bridge for Python service
    ├── memory/
    │   ├── schema.sql                 # SQLite database schema
    │   ├── seed.sql                   # Initial failure memory seed dataset
    │   └── failures.db                # SQLite database file
    ├── demo/
    │   └── fixtures/run-42.json       # Demo CI pipeline failure fixture
    ├── reports/
    │   └── coverage-feat-auth.json    # Demo coverage report fixture
    ├── scripts/
    │   ├── integration-test.js        # Integration test runner
    │   └── seed-db.js                 # DB seed script
    └── tests/                         # Node & Python unit test suites
```

---

## 17. Limitations

- **Fixture Mode Default**: By default, pipelines and coverage reports use local JSON fixtures unless `CI_API_TOKEN` and `GITHUB_REPO` are supplied for live GitHub Actions lookups.
- **Local WASM SQLite**: Database persistence relies on `sql.js` (WASM) flushing to disk synchronously.
- **CLI Focus**: Designed strictly as a local terminal developer tool (no web GUI or cloud hosting required).
