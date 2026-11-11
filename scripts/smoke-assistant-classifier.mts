// Live check (NOT part of the test suite — real Anthropic calls, no database):
// confirms the Project assistant's classifier schema is accepted by the API
// and that a question, an update, a mixed message and an ambiguous one are
// routed sensibly. Run with:
//   npx tsx --tsconfig tsconfig.json scripts/smoke-assistant-classifier.mts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const { classifyAssistantMessage } = await import("@/services/agents/assistant-classifier");

const messages = [
  "What's the current budget for this project?",
  "Caroline just confirmed on the call that the launch moves to 3 March and the budget is now £60k.",
  "The client wants to add a second market (Germany) — does that change which capabilities we need?",
  "budget 60k",
];

for (const message of messages) {
  const result = await classifyAssistantMessage(message);
  console.log(JSON.stringify({ message, ...result }, null, 1));
}
