# Implementation and verification notes

## Changes in this update

- Added a project-specific README after identifying that the root uploaded README/package metadata belonged to unrelated packages.
- Reconciled the FloodShield frontend/backend directory structure and pinned the frontend dependency versions already recorded in the lockfile.
- Added isolated local API integration tests for health, report validation, duplicate submissions, and authority action transitions.
- Enforced the authority workflow on both local API and Lambda API: `Unassigned → Assigned → In progress → Resolved`; invalid jumps return HTTP 409.
- Made local runtime data location configurable with `FLOODSHIELD_DATA_DIR` so tests do not alter a developer's demo data.
- Expire local action records after 24 hours and ignore expired DynamoDB TTL items even if DynamoDB's background TTL deletion has not run yet.
- Hardened the weather signal against non-numeric current precipitation values.
- Clarified in the UI and documentation that the risk score is heuristic and that the drawn route/map is illustrative, not a verified safe route.
- Made authority map marker positions depend on hotspot identity rather than queue rank, so sorting does not move markers to the wrong location.
- Added HTML report length constraints to align the form with backend validation.
- Added weather tests for forecast parsing, the 15-minute cache, and fallback behavior.

## Checks performed

- `npm test`: **8 tests passed** (risk engine/report quality, local API integration, weather cache/fallback).
- `node --check` passed for all backend `.mjs` files and `src/api.js`.
- `npm run build`: **not verified** because the environment could not resolve `registry.npmjs.org` and the Vite dependency was unavailable locally. Run `npm ci` and `npm run build` on a machine with npm registry access before presenting the frontend as production-build verified.
- AWS SAM deployment, AWS credentials/IAM, live API Gateway behavior, and Amplify hosting were **not tested** in this environment.

## Known limitations to resolve before production

- Weather coordinates are currently fixed to Delhi.
- Risk scoring uses a small static hotspot set and text matching; it is not a GIS routing model and does not verify road closures or water depth.
- Local JSON persistence is intended for development/demo use, not multi-process production use.
- The Lambda handler scans the DynamoDB table, which is suitable only for a small MVP dataset.
- Public API routes have no authentication, authorization, or rate limiting. Add these before any public production deployment.
- Push/SMS alerts are not implemented; the dashboard correctly labels alert integration as a demo.
