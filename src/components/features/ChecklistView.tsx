import { Card } from "@/components/ui/Card";

export interface ChecklistItemView {
  id: string;
  label: string;
  isComplete: boolean;
}

export function ChecklistView({ items }: { items: ChecklistItemView[] }) {
  return (
    <Card className="p-5">
      <h3 className="text-sm font-semibold text-foreground">Project Set-Up Checklist</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Tick-box persistence lands in a later task — shown read-only for now.
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No checklist items yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={item.isComplete} disabled readOnly />
              <span className={item.isComplete ? "text-muted-foreground line-through" : "text-foreground"}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
