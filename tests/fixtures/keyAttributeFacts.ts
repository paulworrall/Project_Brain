/**
 * Builds a mocked key-attribute extraction response (the flat
 * `{ facts: [...] }` shape the agent's schema uses) from a readable
 * per-attribute form, e.g.
 *   keyAttributeFacts({ budget: { amount: "£50k", currency: "GBP", evidence: "Budget £50k" } })
 * Attributes left out, or null, produce no facts — exactly like the text not
 * mentioning them.
 */
export function keyAttributeFacts(
  attributes: Record<string, Record<string, unknown> | null> = {}
): { facts: { field: string; value: string; date: string | null; evidence: string | null }[] } {
  const facts = Object.entries(attributes).flatMap(([attributeId, values]) => {
    if (!values) return [];
    const evidence = typeof values.evidence === "string" ? values.evidence : null;
    return Object.entries(values).flatMap(([subFieldId, value]) => {
      if (subFieldId === "evidence" || value == null) return [];
      if (Array.isArray(value)) {
        return value.map((m: { name: string; date: string | null }) => ({
          field: `${attributeId}.${subFieldId}`,
          value: m.name,
          date: m.date,
          evidence,
        }));
      }
      return [
        { field: `${attributeId}.${subFieldId}`, value: String(value), date: null, evidence },
      ];
    });
  });
  return { facts };
}
