/**
 * How a project update ("Keep This Project Up to Date") is named. Updates no
 * longer have a title: they're labelled from when they were added (UK time)
 * and their input type, e.g. "Update — 30 Sept 2026, 14:20 (Note)". Updates
 * saved before titles were removed keep the title they were given.
 */
export interface UpdateLabelSource {
  title: string | null;
  type: "DOCUMENT" | "NOTE";
  originalFileName: string | null;
  uploadedAt: Date;
}

// Spelled out rather than taken from Intl, whose short month names vary by
// runtime ("Sep" vs "Sept").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "June", "July", "Aug", "Sept", "Oct", "Nov", "Dec"];

const UK_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "30 Sept 2026, 14:20" in UK time. */
export function formatUkDateTime(date: Date): string {
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    UK_PARTS.formatToParts(date).find((p) => p.type === type)?.value ?? "";
  return `${Number(part("day"))} ${MONTHS[Number(part("month")) - 1]} ${part("year")}, ${part("hour")}:${part("minute")}`;
}

/** The update's own name: its saved title, or "Update — <date>, <time>". */
export function updateTitle(item: UpdateLabelSource): string {
  const title = item.title?.trim();
  return title ? title : `Update — ${formatUkDateTime(item.uploadedAt)}`;
}

/** "Note", or the uploaded file's name. */
export function updateTypeLabel(item: UpdateLabelSource): string {
  return item.type === "DOCUMENT" ? (item.originalFileName ?? "Document") : "Note";
}

export function updateLabel(item: UpdateLabelSource): string {
  return `${updateTitle(item)} (${updateTypeLabel(item)})`;
}
