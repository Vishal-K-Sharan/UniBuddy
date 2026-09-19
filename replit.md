# UniBuddy

UniBuddy is a personal student command center for budgeting, resources, AI guidance, study groups, and progress tracking.

## Run locally

- `pnpm --filter @workspace/consigliere run dev` — run the Vite frontend
- `pnpm run typecheck` — typecheck the workspace
- `pnpm --filter @workspace/consigliere run build` — build the frontend
- `pnpm --filter @workspace/api-server run dev` — run the original Replit Express scaffold

For local development without `VITE_API_BASE_URL`, the browser keeps the original lightweight local assistant behavior. For the deployed hackathon build, set `VITE_API_BASE_URL` to the API Gateway URL so workspace sync and Bedrock are used.

## AWS stack

The hackathon deployment uses:

- Amplify Hosting for the React/Vite frontend
- API Gateway HTTP API for the public backend endpoint
- Lambda (Node.js 24, arm64) for application logic
- DynamoDB (`UniBuddyData`) for workspace state
- Amazon Bedrock / Nova 2 Lite for Ask UniBuddy

AWS infrastructure is defined in `aws/template.yaml`, and the Lambda handler lives in `aws/lambda/index.mjs`.

## Product behavior

- Local storage provides responsive browser persistence and an offline fallback.
- When the AWS API is configured, workspace data is synchronized to DynamoDB.
- Ask UniBuddy calls Bedrock through Lambda and sends lightweight app context such as spending and study totals.
- The current account flow is a hackathon/demo identity mechanism, not production authentication.
