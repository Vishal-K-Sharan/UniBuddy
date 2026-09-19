# UniBuddy — AWS Bharat Build Tour deployment

This is the AWS deployment path for the current UniBuddy codebase. It uses Amplify Hosting + API Gateway + Lambda + DynamoDB + Amazon Bedrock. It does not depend on App Runner.

## Architecture

```text
Student browser
     │
     ▼
Amplify Hosting
     │
     ▼
React/Vite UniBuddy
     │  HTTPS
     ▼
API Gateway HTTP API
     │
     ▼
AWS Lambda (Node.js 24)
     ├──────────────► DynamoDB (workspace state)
     │
     └──────────────► Amazon Bedrock
                         │
                         ▼
                    Amazon Nova 2 Lite
```

The hackathon's current site says Ship It projects are deployed on AWS, and the judging page says AWS usage is mandatory for a prize, with architecture and cost decisions part of the deployed track. The project must also show AWS in the three-minute demo. See the official page before submitting because deadlines are strict.

## 1. Use Mumbai

Use AWS Region `ap-south-1` (Mumbai) for the resources below.

Amazon Nova 2 Lite provides the model ID `global.amazon.nova-2-lite-v1:0`, and its global inference profile includes Mumbai as an Asia Pacific source Region.

## 2. Create DynamoDB

AWS Console → DynamoDB → Tables → Create table.

- Table name: `UniBuddyData`
- Partition key: `userId`
- Type: String
- Capacity mode: On-demand

You do not need any sort key or indexes for this hackathon version.

## 3. Create the Lambda IAM role

AWS Console → IAM → Roles → Create role.

Trusted entity:

- AWS service
- Use case: Lambda

Attach:

- `AWSLambdaBasicExecutionRole`

Add an inline policy using `aws/lambda-policy.json`.

Before saving, replace `ACCOUNT_ID` in the DynamoDB ARN with your AWS account ID.

The policy needs:

- `dynamodb:GetItem`
- `dynamodb:PutItem`
- `bedrock:InvokeModel`
- `bedrock:GetInferenceProfile`

The Lambda writes logs through the basic execution role.

## 4. Create the Lambda function

AWS Console → Lambda → Create function → Author from scratch.

- Function name: `UniBuddyBackend`
- Runtime: Node.js 24.x
- Architecture: arm64
- Execution role: use the role from Step 3

Create it.

Open the Code tab and replace the default handler with the contents of:

`aws/lambda/index.mjs`

The handler setting should be:

`index.handler`

Add environment variables:

```text
UNIBUDDY_TABLE_NAME=UniBuddyData
BEDROCK_MODEL_ID=global.amazon.nova-2-lite-v1:0
```

Save/deploy the function.

For a fast hackathon setup, the Lambda console can run the code using the Node.js runtime's included AWS SDK v3. AWS recommends bundling the SDK clients for production deployments; this project deliberately uses the console/runtime path to keep the submission simple.

## 5. Create the API Gateway HTTP API

AWS Console → API Gateway → Create API → HTTP API → Build.

Add the `UniBuddyBackend` Lambda integration.

Create a route:

`ANY /{proxy+}`

Attach it to the Lambda integration.

Create/use the `$default` stage with automatic deployments enabled.

Enable CORS:

- Allowed origin: `*` for the hackathon demo
- Allowed methods: `GET, PUT, POST, OPTIONS`
- Allowed headers: `content-type`

API Gateway HTTP APIs support Lambda integration, built-in CORS, and automatic deployments.

Copy the generated invoke URL. It should look like:

```text
https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com
```

## 6. Test the backend before deploying the frontend

Open Lambda → Test and create a test event similar to an API Gateway HTTP API payload. A minimal GET event is:

```json
{
  "version": "2.0",
  "routeKey": "ANY /{proxy+}",
  "rawPath": "/state/test-user-1234",
  "requestContext": {
    "http": { "method": "GET", "path": "/state/test-user-1234" }
  }
}
```

A real app user gets a random UUID as the `syncId`, which is accepted by the backend.

Then test the real endpoint from a terminal if you have curl:

```bash
curl -i "https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com/state/test-user-1234"
```

A 404 `State not found` response is expected for a new ID. That proves API Gateway → Lambda → DynamoDB is working.

## 7. Connect the GitHub repository to Amplify Hosting

Push the actual project source tree to the public GitHub repository. Do not make the GitHub submission a ZIP-only repository.

AWS Console → Amplify → Create new app → Host web app.

Choose GitHub, authorize it, then select the UniBuddy repository and the `main` branch.

The repository already contains `amplify.yml` for the pnpm monorepo. It installs pnpm, builds `@workspace/consigliere`, and publishes:

`artifacts/consigliere/dist/public`

Add this Amplify environment variable before deploying:

```text
VITE_API_BASE_URL=https://YOUR_API_ID.execute-api.ap-south-1.amazonaws.com
```

Do not put AWS access keys or secrets into this variable or into Vite source code.

Deploy.

## 8. Test the deployed UniBuddy

Run this exact flow:

1. Open the Amplify URL.
2. Create a UniBuddy account.
3. Add an expense in Budget.
4. Refresh the page.
5. Confirm the expense is still there.
6. Add a saved resource.
7. Refresh again.
8. Open Ask UniBuddy.
9. Ask: `I spent too much this week. Help me make a simple student budget.`
10. Confirm you receive a Bedrock-generated answer.
11. Open DynamoDB and confirm a `UniBuddyData` item exists.
12. Open CloudWatch Logs and confirm the Lambda has invoked.

## 9. What the code now does

### Workspace sync

The React app still keeps a browser copy for fast UI updates and offline resilience, but authenticated workspace changes are also sent to:

`PUT /state/{syncId}`

and loaded from:

`GET /state/{syncId}`

The password is not sent to DynamoDB.

### Ask UniBuddy

The assistant sends:

`POST /assistant`

with the student's message and lightweight app context such as recent expenses, total spending, saved resource count, and study minutes.

Lambda calls Amazon Bedrock using the Converse API and returns the generated text.

## 10. Authentication limitation

The current account UI is still a hackathon/demo authentication flow. The browser retains the local session/password. This is not production-grade identity or authorization.

Do not describe it as secure authentication in the demo. A production version should replace this with Amazon Cognito and use authenticated API access.

## 11. Three-minute demo structure

`0:00–0:25` — State the student problem and show the UniBuddy dashboard.

`0:25–1:05` — Add a real expense and briefly show the Budget experience.

`1:05–1:25` — Refresh the browser and show the data remains, then mention DynamoDB.

`1:25–2:10` — Ask UniBuddy a real student question and show the Bedrock response.

`2:10–2:35` — Show the AWS architecture: Amplify → API Gateway → Lambda → DynamoDB + Bedrock.

`2:35–3:00` — State the impact, show the live URL, and finish.

Do not spend the demo explaining implementation details that never appear in the running product.
