import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { DynamoDBClient, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const region = process.env.AWS_REGION ?? "ap-south-1";
const tableName = process.env.UNIBUDDY_TABLE_NAME ?? "UniBuddyData";
const modelId = process.env.BEDROCK_MODEL_ID ?? "global.amazon.nova-2-lite-v1:0";

const dynamo = new DynamoDBClient({ region });
const bedrock = new BedrockRuntimeClient({ region });

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,PUT,POST,OPTIONS",
  "content-type": "application/json",
};

const json = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});

const getPath = (event) => event.rawPath ?? event.requestContext?.http?.path ?? "/";
const getMethod = (event) => event.requestContext?.http?.method ?? event.httpMethod ?? "GET";
const parseBody = (event) => {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  return JSON.parse(raw);
};

const validUserId = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(value);

async function getState(userId) {
  const result = await dynamo.send(new GetItemCommand({
    TableName: tableName,
    Key: marshall({ userId }),
    ConsistentRead: true,
  }));
  if (!result.Item) return null;
  const item = unmarshall(result.Item);
  return item.state ? JSON.parse(item.state) : null;
}

async function saveState(userId, body) {
  const state = {
    userId,
    name: typeof body.name === "string" ? body.name.slice(0, 120) : "UniBuddy student",
    email: typeof body.email === "string" ? body.email.slice(0, 254).toLowerCase() : "",
    expenses: Array.isArray(body.expenses) ? body.expenses.slice(0, 500) : [],
    resources: Array.isArray(body.resources) ? body.resources.slice(0, 500) : [],
    joinedGroups: Array.isArray(body.joinedGroups) ? body.joinedGroups.slice(0, 100) : [],
    progress: Array.isArray(body.progress) ? body.progress.slice(0, 500) : [],
  };

  await dynamo.send(new PutItemCommand({
    TableName: tableName,
    Item: marshall({
      userId,
      state: JSON.stringify(state),
      updatedAt: new Date().toISOString(),
    }),
  }));
}

async function askUniBuddy(message, context) {
  const system = `You are UniBuddy, a calm and practical student support assistant.\n\n` +
    `Help with study planning, budgeting, student life, organization, and everyday decisions. ` +
    `Be concise, kind, concrete, and non-judgmental. Do not pretend to know facts you do not know. ` +
    `For financial questions, provide general budgeting guidance rather than regulated financial advice. ` +
    `Use the user's app context only when relevant.`;

  const contextText = context && typeof context === "object"
    ? `\n\nCurrent UniBuddy context:\n${JSON.stringify(context)}`
    : "";

  const response = await bedrock.send(new ConverseCommand({
    modelId,
    system: [{ text: system }],
    messages: [{
      role: "user",
      content: [{ text: `${message}${contextText}` }],
    }],
    inferenceConfig: {
      maxTokens: 500,
      temperature: 0.5,
      topP: 0.9,
    },
  }));

  const answer = response.output?.message?.content
    ?.map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!answer) throw new Error("Empty Bedrock response");
  return answer;
}

export const handler = async (event) => {
  const method = getMethod(event).toUpperCase();
  const path = getPath(event);

  if (method === "OPTIONS") return { statusCode: 204, headers, body: "" };

  try {
    const stateMatch = path.match(/^\/state\/([^/]+)$/);

    if (stateMatch && method === "GET") {
      const userId = decodeURIComponent(stateMatch[1]);
      if (!validUserId(userId)) return json(400, { error: "Invalid user id" });
      const state = await getState(userId);
      return state ? json(200, state) : json(404, { error: "State not found" });
    }

    if (stateMatch && method === "PUT") {
      const userId = decodeURIComponent(stateMatch[1]);
      if (!validUserId(userId)) return json(400, { error: "Invalid user id" });
      await saveState(userId, parseBody(event));
      return json(200, { ok: true });
    }

    if (path === "/assistant" && method === "POST") {
      const body = parseBody(event);
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message || message.length > 4000) return json(400, { error: "Message must be between 1 and 4000 characters." });
      const answer = await askUniBuddy(message, body.context);
      return json(200, { answer });
    }

    return json(404, { error: "Route not found" });
  } catch (error) {
    console.error(error);
    return json(500, { error: "UniBuddy backend error" });
  }
};
