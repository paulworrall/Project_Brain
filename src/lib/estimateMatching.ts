import type { RoleMatchType } from "@/generated/prisma/enums";

/**
 * The role-matching agent's raw judgment for one extracted role — before
 * the conservative gate below decides whether it's trustworthy enough to
 * auto-resolve. Never trust this shape as "resolved" on its own.
 */
export interface RoleMatchJudgment {
  matchType: RoleMatchType;
  confidence: number;
  suggestedRateCardLineId: string | null;
}

export interface MatchRoutingResult {
  autoResolve: boolean;
}

/**
 * The single conservative gate between "the agent proposed a match" and
 * "this RoleResolution is considered resolved without a PM." Kept as plain,
 * directly-testable code — not inside the agent file — so the rule "role-only
 * confidence is never sufficient on its own, even with an exact role-name
 * match" is enforced structurally (the matchType check below), not just by
 * a high confidence threshold that could theoretically be gamed by a
 * miscalibrated model.
 */
export function resolveMatchRouting(
  match: RoleMatchJudgment,
  threshold: number
): MatchRoutingResult {
  const autoResolve =
    match.matchType === "ROLE_AND_LEVEL" &&
    match.confidence >= threshold &&
    match.suggestedRateCardLineId != null;

  return { autoResolve };
}
