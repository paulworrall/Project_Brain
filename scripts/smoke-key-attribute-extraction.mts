// Live check (NOT part of the test suite — it makes a real Anthropic call):
// confirms the key-attribute extraction schema is accepted by the API and
// returns sensible facts for a realistic brief. Run with:
//   npx tsx --tsconfig tsconfig.json scripts/smoke-key-attribute-extraction.mts
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const { extractKeyAttributes } = await import("@/services/agents/key-attribute-extraction");

const brief = `From: Marketing Lead, Fizzy Subject: New idea — real-time offers tied to location

Hi team,

We've been talking internally about a new way to drive more frequent purchases from our existing app users. The idea is something like: when a customer is near one of our retail or delivery partners, they get a real-time, personalised discount code they can redeem there and then. We think this could be a good way to convert casual drinkers into more regular ones, and it would also help us capture more first-party data from the interaction.

We're not tied to a specific partner yet, and we haven't landed on which market to try this in first — keen to hear your recommendation. We'd want to keep this fairly lean to start with, more of a pilot to prove the model works before we think about rolling it out further.

Let us know what you need from us to get moving.

Thanks, Marketing Lead, Fizzy`;

const result = await extractKeyAttributes(brief, "brief");
console.log(JSON.stringify(result, null, 2));
