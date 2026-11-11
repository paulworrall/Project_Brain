/**
 * WPP Enterprise Solutions | MAP lockup. Same text placeholder as Reporting Hub's
 * `Logo` (the logo files aren't in the design pack yet); swap for an <img> from
 * public/brand/ once they are.
 */
export function Logo({ tone = "navy", height = 20 }: { tone?: "navy" | "white"; height?: number }) {
  return (
    <span
      role="img"
      aria-label="WPP Enterprise Solutions | MAP"
      className={`inline-flex items-center gap-2 font-medium whitespace-nowrap ${tone === "white" ? "text-white" : "text-navy"}`}
      style={{ fontSize: Math.round(height * 0.8), lineHeight: 1 }}
    >
      <span
        aria-hidden="true"
        className="inline-block rounded-full bg-orange"
        style={{ width: height * 0.6, height: height * 0.6 }}
      />
      <span aria-hidden="true">WPP Enterprise Solutions | MAP</span>
    </span>
  );
}
