import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/Button";

const ROLE_LABELS: Record<string, string> = {
  CLIENT_ENGAGEMENT: "Client Engagement",
  DELIVERY: "Delivery",
};

export async function Header() {
  const session = await auth();

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-surface px-6">
      <Link href="/" className="text-lg font-semibold tracking-tight text-foreground">
        Project Brain
      </Link>

      {session?.user && (
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">{session.user.name}</p>
            <p className="text-xs text-muted-foreground">
              {ROLE_LABELS[session.user.role] ?? session.user.role}
            </p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="secondary" className="text-xs">
              Sign out
            </Button>
          </form>
        </div>
      )}
    </header>
  );
}
