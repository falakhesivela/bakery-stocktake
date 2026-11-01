"use client"

import Link from "next/link"
import { useActionState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { createUser, type CreateUserState } from "../actions"
import { RolePicker, type LocationOption } from "../role-picker"

export function NewUserForm({ locations }: { locations: LocationOption[] }) {
  const [state, action, pending] = useActionState<CreateUserState, FormData>(createUser, {})

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="fullName">Full name</FieldLabel>
              <Input id="fullName" name="fullName" required maxLength={80} autoComplete="off" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="email">Email (used to sign in)</FieldLabel>
                <Input id="email" name="email" type="email" required autoComplete="off" />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Temporary password</FieldLabel>
                <Input
                  id="password"
                  name="password"
                  type="text"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <FieldDescription>At least 8 characters.</FieldDescription>
              </Field>
            </div>
            <RolePicker locations={locations} allowNone />
            <Field orientation="horizontal">
              <Switch id="isAdmin" name="isAdmin" />
              <div>
                <FieldLabel htmlFor="isAdmin">Admin</FieldLabel>
                <FieldDescription>
                  Admins see every location and can change settings, the catalogue and users.
                </FieldDescription>
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Creating…" : "Create user"}
        </Button>
        <Link href="/settings/users" className={buttonVariants({ variant: "ghost", size: "lg" })}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
