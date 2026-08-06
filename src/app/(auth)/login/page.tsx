import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Sign in</h2>
      <LoginForm />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Need an account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </Card>
  );
}
