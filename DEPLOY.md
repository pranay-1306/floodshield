# Deploy FloodShield on AWS

Deploy only after the local product is stable (`npm test`, then the [DEMO.md](./DEMO.md) loop). A public URL is for judges; it is not a substitute for route-aware scoring.

FloodShield is designed to deploy as a low-cost serverless system in `ap-south-1` (Mumbai). If this AWS account blocks SAM/CloudFormation, create the same pieces in the console: HTTP API, Node.js 22 Lambda using `backend/src/handler.mjs`, on-demand DynamoDB table with `PK`/`SK` and TTL on `expiresAt`, and `TABLE_NAME` on the function. Then host `dist/` and set `VITE_API_URL`.

## What gets created

- **HTTP API Gateway**: public REST endpoints for the React app.
- **AWS Lambda**: route-risk calculation and report persistence.
- **DynamoDB on-demand table**: reports automatically expire after 24 hours.
- **CloudWatch Logs**: short-term diagnostics for the demo.

The frontend is deployed separately through **AWS Amplify Hosting**.

## No-AWS fallback: Render

If AWS access is blocked by an organization policy, deploy the same app without changing
the application code:

1. In Render, create the API Web Service from this repository. The checked-in
   `render.yaml` provides the Node runtime, `npm ci` build, `npm run api` start command,
   and `/health` check.
2. Create a separate Render Static Site from the same repository. Use
   `npm ci && npm run build` as the build command, `dist` as the publish directory, and
   set `VITE_API_URL` to the API service URL.
3. Verify the public API endpoints and then run the complete demo flow:
   route check → report submission → Authority Assign → Start → Resolve → route refresh.

The free Render filesystem is ephemeral, so local JSON reports are suitable for a live
demo but are not durable across service restarts. Use a managed database before treating
the fallback as production storage.

### Current public demo

- Frontend: `https://floodshield-web-351p.onrender.com`
- API: `https://floodshield-api-xhuy.onrender.com`

Render free services may sleep after inactivity. Warm the API with `/health` before a
demo; the first request after sleep can take roughly 50 seconds.

## Before deploying

1. In AWS Billing, create a monthly budget alert before creating resources.
2. Use one region only: `ap-south-1`.
3. Install Node.js 20.19+ (Node.js 22 recommended), the AWS CLI, and AWS SAM CLI, then authenticate with an IAM user or IAM Identity Center profile. Do not use root access keys.

## Deploy the API

From the project root:

```powershell
cd backend
npm ci
cd ..
sam build
sam deploy --guided --region ap-south-1
```

Choose a unique stack name such as `floodshield-prod`, approve IAM changes for the Lambda role, and copy the displayed `ApiUrl` output.

## Deploy the website

1. From the project root, run `npm ci` and `npm run build` to verify the static frontend bundle.
2. Push this project to a GitHub repository connected to your AWS account.
3. Open **AWS Amplify** → **New app** → **Host web app** → connect the repository.
4. Set the build command to `npm run build` and publish directory to `dist`.
5. Add an environment variable named `VITE_API_URL` with the API URL from SAM.
6. Deploy. Every GitHub push will then build a preview automatically.

## Verify in the AWS Console

After deployment, visit:

```text
GET /health
GET /authority/queue
GET /risk?origin=DTU%2C%20Rohini&destination=Mandi%20House
```

Then submit a report through the deployed site, refresh it, and open the Authority view. The report count and risk queue must change. Capture screenshots of:

- Lambda function overview
- DynamoDB item after a report submission
- API Gateway route list
- Amplify public URL
- CloudWatch invocation log

Those are the best AWS-proof shots for the three-minute video.


**Verification note:** the source package has local automated tests, but an AWS deployment and Amplify build must be performed in your account. Do not treat the stack as deployed until the endpoint checks below pass.
