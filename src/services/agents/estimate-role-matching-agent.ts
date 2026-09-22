import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, CLAUDE_MODEL } from "@/lib/anthropic";
import { RoleMatchResultListSchema, type RoleMatchResult, type ExtractedRoleLine } from "@/types/estimates";

export class EstimateRoleMatchingError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "EstimateRoleMatchingError";
  }
}

export interface RateCardLineCandidate {
  id: string;
  role: string;
  level: string | null;
}

/**
 * Judges each extracted role against the estimate's locked rate card lines.
 * Returns the agent's RAW judgment only (matchType/confidence/suggestion) —
 * this function does NOT decide whether a role counts as auto-resolved.
 * That conservative gate lives entirely in src/lib/estimateMatching.ts,
 * kept separate and directly testable without mocking Claude. In
 * particular: role-only confidence must never be reported as
 * ROLE_AND_LEVEL just because the role name matches exactly — if the level
 * is missing or ambiguous and the rate card has more than one level for
 * that role, this must return matchType "ROLE_ONLY".
 */
export async function matchRolesAgainstRateCard(
  extractedRoles: ExtractedRoleLine[],
  candidateLines: RateCardLineCandidate[]
): Promise<RoleMatchResult[]> {
  try {
    const message = await anthropic.messages.parse({
      model: CLAUDE_MODEL,
      max_tokens: 8192,
      output_config: { format: zodOutputFormat(RoleMatchResultListSchema) },
      messages: [
        {
          role: "user",
          content: `Match each extracted role below against the rate card's actual lines. Be conservative: only report matchType "ROLE_AND_LEVEL" when BOTH the role AND a specific level are confidently identified and match exactly one rate-card line. If the role matches but no level was given (or the rate card has multiple levels for that role and the input didn't specify which one), report matchType "ROLE_ONLY" — never guess a "typical" or "mid" level to force a ROLE_AND_LEVEL match, even if the role name match itself is exact. Report "NO_MATCH" if nothing on the rate card resembles the role at all. For ROLE_ONLY or low-confidence cases you may still suggest the closest candidate line as a starting point (suggestedRateCardLineId), but this is only ever a suggestion for a human to confirm or override — never state or imply it should be auto-accepted.\n\n<extracted_roles>\n${JSON.stringify(extractedRoles, null, 2)}\n</extracted_roles>\n\n<rate_card_lines>\n${JSON.stringify(candidateLines, null, 2)}\n</rate_card_lines>`,
        },
      ],
    });

    if (!message.parsed_output) {
      throw new Error("Claude returned no parsed output for role matching.");
    }
    return message.parsed_output;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      throw new EstimateRoleMatchingError(
        "The AI service is rate-limited right now. Please try again in a moment.",
        error
      );
    }
    if (error instanceof Anthropic.APIError) {
      throw new EstimateRoleMatchingError(
        "The AI service couldn't match these roles against the rate card. Please try again.",
        error
      );
    }
    throw new EstimateRoleMatchingError(
      "Something went wrong while matching roles against the rate card.",
      error
    );
  }
}
