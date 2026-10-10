# FloodShield

FloodShield is a hackathon MVP for flood-aware travel decisions and a citizen-to-authority waterlogging response loop. It combines a Delhi-area rainfall forecast, known flood-sensitive hotspots, recent citizen reports, and authority action status into a heuristic risk score and a ranked intervention queue.

> **Important limitation:** this is a decision-support prototype, not an official warning system. The hotspot map and route lines in the UI are illustrative. The app does not calculate a geospatially verified safe route, confirm road closures, or send push/SMS alerts. Check official advisories and live directions before travelling.

## Features

- Route-risk estimate with risk score, contributing reasons, confidence label, and recommendation.
- Open-Meteo precipitation forecast for Delhi, cached in memory for 15 minutes with a stale/fallback signal when unavailable.
- Citizen waterlogging reports with input validation, duplicate rejection for matching reports in a 20-minute window, report freshness, and a heuristic trust score.
- Authority queue ranked by hotspot baseline, rainfall, fresh reports, and the latest action state.
- Authority action lifecycle enforced as **Assign → Start → Resolve**.
- Local API with JSON-file persistence and a Lambda/API Gateway + DynamoDB deployment path.
- Automated risk/quality unit tests and local API integration tests.

## Requirements

- Node.js **20.19+** (Node.js 22 recommended)
- npm
- For AWS deployment only: AWS CLI, AWS SAM CLI, and configured AWS credentials with permission to deploy the stack.

## Run locally

Open two terminals in the project root.

Terminal 1 — API server:

```bash
npm run api
```

Terminal 2 — frontend:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Vite proxies `/api` requests to `http://127.0.0.1:8787`. The API writes demo data to `backend/data/reports.json` and `backend/data/actions.json`; these runtime files are ignored by Git. The first API request seeds three example citizen reports if no report file exists.

To use a deployed API from the frontend, set `VITE_API_URL` to the API base URL (for example, the API Gateway URL) before building. If it is unset, the frontend uses `/api`.

## Test and build

```bash
npm test
npm run build
```

The test suite uses Node's built-in test runner. The build creates `dist/` for static hosting. AWS deployment is **not** performed by these commands.

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health and storage mode |
| GET | `/weather` | Cached forecast/fallback for Delhi |
| GET | `/risk?origin=...&destination=...` | Route-context risk estimate |
| GET | `/reports` | Recent citizen reports with freshness metadata |
| POST | `/reports` | Validate and persist a citizen report |
| GET | `/authority/queue` | Ranked hotspot intervention queue |
| POST | `/authority/actions` | Advance a hotspot through Assign → Start → Resolve |

The local API allows cross-origin requests for hackathon development and does not implement user authentication. Do not expose it publicly without adding authentication, rate limiting, and stricter CORS/security controls.

## AWS deployment

See [DEPLOY.md](./DEPLOY.md). The SAM template provisions an HTTP API, Lambda function, and on-demand DynamoDB table with a 24-hour TTL. The Lambda scans the table to assemble the current report/action set; this is acceptable for a small demo but should be replaced with query-oriented access patterns before production scale.

Deployment, live AWS credentials, IAM permissions, and the deployed API have not been verified as part of this source package. Verify the deployed endpoints using the checklist in `DEPLOY.md`.

## Main project structure

```text
FloodShield-Updated/
├── src/                     # React UI, API client, CSS
├── backend/src/             # Local API, Lambda handler, risk/report/weather logic
├── backend/test/            # Unit and API integration tests
├── backend/data/             # Local JSON runtime storage (ignored)
├── template.yaml             # AWS SAM infrastructure
├── vite.config.js            # Frontend dev server and /api proxy
├── package.json              # Frontend scripts/dependencies
└── DEPLOY.md                 # AWS deployment guide
```
