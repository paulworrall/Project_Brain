import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { SignupForm } from "./SignupForm";

export default function SignupPage() {
  return (
    <Card className="p-6">
      <h2 className="mb-4 text-lg font-semibold text-foreground">Create an account</h2>
      <SignupForm />
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
