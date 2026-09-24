// Live check (NOT part of the test suite — real Anthropic calls): runs the
// full intake on a realistic brief and shows where each fact landed, to
// confirm key details appear once (as key details) and not again in the
// Position Document. Run with:
//   npx tsx --tsconfig tsconfig.json scripts/smoke-intake.mts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const { runIntakeAgent } = await import("@/services/agents/intake-agent");

const brief = `From: Marketing Lead, Fizzy Subject: New idea — real-time offers tied to location

Hi team,

We've been talking internally about a new way to drive more frequent purchases from our existing app users. The idea is something like: when a customer is near one of our retail or delivery partners, they get a real-time, personalised discount code they can redeem there and then. We think this could be a good way to convert casual drinkers into more regular ones, and it would also help us capture more first-party data from the interaction.

We're not tied to a specific partner yet, and we haven't landed on which market to try this in first — keen to hear your recommendation. We'd want to keep this fairly lean to start with, more of a pilot to prove the model works before we think about rolling it out further.

Let us know what you need from us to get moving.

Thanks, Marketing Lead, Fizzy`;

const result = await runIntakeAgent(brief);
console.log("KEY DETAILS:", JSON.stringify(result.keyAttributes, null, 1));
console.log("KEY DETAILS ERROR:", result.keyAttributesError);
console.log("OTHER DETAILS (whatWeKnow):");
for (const item of result.positionDocument.whatWeKnow)
  console.log(`  - ${item.topic}: ${item.detail}`);
console.log("GAPS:", result.positionDocument.whatWeNeedToFindOut);
console.log("POSITION DOC KEYS:", Object.keys(result.positionDocument));
