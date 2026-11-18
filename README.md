# AutomationPilot

I built AutomationPilot entirely with AI. It's a local web app for turning emails, support tickets, and internal requests into categorized work with clear next steps.

Paste a request and the app identifies its category and priority, extracts details such as invoice numbers or dates, and routes it to the right team. Sensitive or critical requests require approval before their follow-up step becomes ready. The overview tracks request activity, and the Activity page records workflow decisions.

The Next.js frontend talks to a FastAPI backend and stores requests and audit events in local SQLite. The default classifier uses English-language rules and works offline after installation. Optional local Ollama inference falls back to those rules if the model is unavailable or returns an invalid result. See the [architecture notes](docs/architecture.md) for details.

## Run locally

Install Python 3.11+ and Node.js 22+. From the repository root, start the API in one terminal.

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

On Windows PowerShell, activate with `.venv\Scripts\Activate.ps1`.

Start the web app in a second terminal.

```bash
npm ci --prefix frontend
npm run dev --prefix frontend
```

Open [AutomationPilot](http://127.0.0.1:3000). In GitHub Codespaces, open **Ports → 3000 → Open in Browser** while signed in to GitHub. Forward port 3000 as **Private** if it is missing.

The API creates a local database and adds demo requests on first startup. To start with an empty database, set `FLOWPILOT_SEED=false` before the first run. See [backend settings](.env.example) and [frontend settings](frontend/.env.example) for configuration.

## Try a request

On **Request processing**, paste “Please refund $180 for invoice INV-2048.” The app should extract the amount and invoice number, route the request to Finance, and require approval. Open the workflow to approve or reject it, then check **Activity** for the recorded decision.

## Run tests

From the repository root with the Python environment activated and frontend dependencies installed, run the following checks.

```bash
PYTHONPATH=backend python -m pytest backend/tests -q
npm run typecheck --prefix frontend
```

Unit tests cover entity extraction and workflow approval rules. API tests cover request validation, approval and audit logging, concurrent decisions, demo seeding, and Ollama fallback.
