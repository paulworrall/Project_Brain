import { Logo } from "@/components/layout/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-5 text-center">
        <Logo />
        <h1 className="text-4xl font-light text-foreground">
          Project Brain
        </h1>
        <p className="text-sm text-muted-foreground">
          Turning a client brief into a structured, staged project workflow.
        </p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
