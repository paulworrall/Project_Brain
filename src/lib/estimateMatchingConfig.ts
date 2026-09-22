/**
 * The single, tunable knob for how confident the role-matching agent must
 * be before a match is auto-resolved without a PM prompt. Deliberately
 * conservative to start — biased toward asking rather than guessing (see
 * estimateMatching.ts). Every RoleResolution logs its confidence and
 * matchType regardless of outcome, so this can be raised later once real
 * usage data shows which matches were reliably correct.
 */
export const ROLE_MATCH_CONFIDENCE_THRESHOLD = 0.8;
