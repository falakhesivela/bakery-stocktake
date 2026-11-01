"use client"

import { useActionState } from "react"
import { useSearchParams } from "next/navigation"
import { signIn, type SignInState } from "@/app/actions/auth"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

export function LoginForm() {
  const searchParams = useSearchParams()
  const next = searchParams.get("next") ?? ""
  const inactive = searchParams.get("error") === "inactive"
  const [state, action, pending] = useActionState<SignInState, FormData>(
    signIn,
    {},
  )

  return (
    <form action={action}>
      <input type="hidden" name="next" value={next} />
      <FieldGroup>
        {inactive && !state.error && (
          <Alert variant="destructive">
            <AlertDescription>
              Your account is not active. Ask an admin to check your access.
            </AlertDescription>
          </Alert>
        )}
        {state.error && (
          <Alert variant="destructive">
            <AlertDescription>{state.error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.email}
            required
            autoFocus
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </Field>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  )
}
