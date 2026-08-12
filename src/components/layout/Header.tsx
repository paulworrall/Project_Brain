import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { GlobalProjectSearch } from "@/components/features/GlobalProjectSearch";

const ROLE_LABELS: Record<string, string> = {
  CLIENT_ENGAGEMENT: "Client Engagement",
  DELIVERY: "Delivery",
};

export async function Header() {
  const session = await auth();

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-border bg-surface px-3 sm:px-6">
      <Link
        href="/"
        className="shrink-0 whitespace-nowrap text-lg font-semibold tracking-tight text-foreground"
      >
        Project Brain
      </Link>

      {session?.user && <GlobalProjectSearch />}

      {session?.user && (
        <div className="flex shrink-0 items-center gap-4">
          <div className="hidden text-right sm:block">
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
