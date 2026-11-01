"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { changePassword } from "./actions"

export function ChangePasswordForm() {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [pending, startTransition] = useTransition()

  return (
    <Card className="max-w-md">
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            startTransition(async () => {
              const result = await changePassword({ password, confirm })
              if (!result.ok) return void toast.error(result.error)
              setPassword("")
              setConfirm("")
              toast.success("Password changed")
            })
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="password">New password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="confirm">Repeat new password</FieldLabel>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <div>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Change password"}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
