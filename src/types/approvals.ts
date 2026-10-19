import * as z from "zod";

export type ApprovalState = "draft" | "superseded" | "not_approved" | "approved";

export type CommercialDocumentTypeName = "ESTIMATE" | "SOW";

export interface ApprovalInfo {
  id: string;
  /** Date the client approved, YYYY-MM-DD (a calendar date, not an instant). */
  clientApprovedOn: string;
  clientApproverName: string;
  reference: string | null;
  recordedBy: { id: string; name: string };
  /** ISO timestamp the approval was recorded in the app. */
  recordedAt: string;
}

export interface ApprovedDocSummary {
  documentType: CommercialDocumentTypeName;
  name: string;
  versionId: string;
  versionNumber: number;
  total: number | null;
  currency: string | null;
  approval: ApprovalInfo;
  downloadHref: string;
  /** DOM id of the stage card the "Go to section" link scrolls to. */
  sectionId: string;
}

export interface ApprovedDocumentsSummary {
  estimate: ApprovedDocSummary | null;
  sow: ApprovedDocSummary | null;
}

/** Permissions are computed server-side and passed as booleans — no role logic reaches the client. */
export interface ApprovalPermissions {
  canApprove: boolean;
  canRevert: boolean;
}

export type ApprovalErrorCode =
  | "ALREADY_APPROVED"
  | "NOT_LATEST_VERSION"
  | "ESTIMATE_NOT_APPROVED"
  | "SOW_SOURCE_MISMATCH"
  | "LOCKED"
  | "UNDO_WINDOW_EXPIRED"
  | "FORBIDDEN"
  | "VALIDATION";

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: ApprovalErrorCode;
      message: string;
      fieldErrors?: Record<string, string>;
    };

// --- Input schemas (shared by the dialog and the server actions) -----------

const NAME_MAX = 120;
const REFERENCE_MAX = 200;
const REASON_MAX = 500;

/** Today's date as YYYY-MM-DD, tolerating timezones up to 14h ahead of UTC. */
export function latestAllowedApprovalDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export const ApproveVersionSchema = z.object({
  versionId: z.string().trim().min(1, { error: "Choose a version to approve." }),
  clientApprovedOn: z
    .string({ error: "Enter the date the client approved." })
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Enter the date the client approved." })
    .refine((value) => value <= latestAllowedApprovalDate(), {
      error: "The approval date can't be in the future.",
    }),
  clientApproverName: z
    .string({ error: "Enter the client contact who approved." })
    .trim()
    .min(1, { error: "Enter the client contact who approved." })
    .max(NAME_MAX, { error: `Keep the name under ${NAME_MAX} characters.` }),
  reference: z
    .string()
    .trim()
    .max(REFERENCE_MAX, { error: `Keep the reference under ${REFERENCE_MAX} characters.` })
    .optional(),
});
export type ApproveVersionInput = z.infer<typeof ApproveVersionSchema>;

export const UndoApprovalSchema = z.object({
  approvalId: z.string().trim().min(1, { error: "Choose an approval to undo." }),
});
export type UndoApprovalInput = z.infer<typeof UndoApprovalSchema>;

export const RevertApprovalSchema = z.object({
  approvalId: z.string().trim().min(1, { error: "Choose an approval to revert." }),
  reason: z
    .string({ error: "Give a reason for reverting this approval." })
    .trim()
    .min(1, { error: "Give a reason for reverting this approval." })
    .max(REASON_MAX, { error: `Keep the reason under ${REASON_MAX} characters.` }),
});
export type RevertApprovalInput = z.infer<typeof RevertApprovalSchema>;

/** First message per field from a zod error, for field-level UI messages. */
export function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const flat = z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(flat)) {
    if (messages?.[0]) out[field] = messages[0];
  }
  return out;
}
