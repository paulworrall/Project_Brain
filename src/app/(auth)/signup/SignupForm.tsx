"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { FormError } from "@/components/ui/FormError";
import { signupAction } from "./actions";

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, undefined);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" type="text" autoComplete="name" required />
        <FormError>{state?.errors?.name}</FormError>
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        <FormError>{state?.errors?.email}</FormError>
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        <FormError>{state?.errors?.password}</FormError>
      </div>
      <div>
        <Label htmlFor="role">Role</Label>
        <select
          id="role"
          name="role"
          defaultValue="DELIVERY"
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus:outline-2 focus:outline-offset-2 focus:outline-ring"
        >
          <option value="DELIVERY">Delivery</option>
          <option value="CLIENT_ENGAGEMENT">Client Engagement</option>
        </select>
        <FormError>{state?.errors?.role}</FormError>
      </div>
      {state?.message && (
        <p className="text-sm text-danger" role="alert">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account…" : "Sign up"}
      </Button>
    </form>
  );
}
