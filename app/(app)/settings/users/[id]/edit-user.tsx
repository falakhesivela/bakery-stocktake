"use client"

import { useState, useTransition } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ROLE_LABELS, type LocationRole } from "@/lib/permissions"
import { removeRole, resetPassword, setRole, updateProfile } from "../actions"
import { RolePicker, type LocationOption } from "../role-picker"

type Profile = { id: string; fullName: string; email: string; isAdmin: boolean; active: boolean }
type Role = { locationId: string; code: string; name: string; role: LocationRole }

export function EditUser({
  profile,
  roles,
  locations,
  isSelf,
}: {
  profile: Profile
  roles: Role[]
  locations: LocationOption[]
  isSelf: boolean
}) {
  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <ProfileCard profile={profile} isSelf={isSelf} />
      <RolesCard userId={profile.id} roles={roles} locations={locations} />
      <PasswordCard userId={profile.id} />
    </div>
  )
}

function ProfileCard({ profile, isSelf }: { profile: Profile; isSelf: boolean }) {
  const [fullName, setFullName] = useState(profile.fullName)
  const [isAdmin, setIsAdmin] = useState(profile.isAdmin)
  const [active, setActive] = useState(profile.active)
  const [pending, startTransition] = useTransition()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>{profile.email}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            startTransition(async () => {
              const result = await updateProfile({ userId: profile.id, fullName, isAdmin, active })
              if (!result.ok) return void toast.error(result.error)
              toast.success("Saved")
            })
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="fullName">Full name</FieldLabel>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} />
            </Field>
            <Field orientation="horizontal">
              <Switch id="isAdmin" checked={isAdmin} onCheckedChange={setIsAdmin} disabled={isSelf} />
              <div>
                <FieldLabel htmlFor="isAdmin">Admin</FieldLabel>
                <FieldDescription>Full access to every location and all settings.</FieldDescription>
              </div>
            </Field>
            <Field orientation="horizontal">
              <Switch id="active" checked={active} onCheckedChange={setActive} disabled={isSelf} />
              <div>
                <FieldLabel htmlFor="active">Active</FieldLabel>
                <FieldDescription>Deactivated people can&apos;t sign in. Their history is kept.</FieldDescription>
              </div>
            </Field>
            <div>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function RolesCard({
  userId,
  roles,
  locations,
}: {
  userId: string
  roles: Role[]
  locations: LocationOption[]
}) {
  const [pending, startTransition] = useTransition()
  const [choice, setChoice] = useState<{ locationId: string; role: LocationRole | "" }>(() => {
    const first = locations[0]
    return { locationId: first?.id ?? "", role: first?.type === "warehouse" ? "warehouse_manager" : "store_manager" }
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Locations & roles</CardTitle>
        <CardDescription>One role per location. Adding a location again replaces the role.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No locations yet.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {roles.map((r) => (
              <li key={r.locationId} className="flex items-center justify-between gap-2 px-3 py-2">
                <div>
                  <div className="text-sm font-medium">
                    {r.code} · {r.name}
                  </div>
                  <div className="text-xs text-muted-foreground">{ROLE_LABELS[r.role]}</div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove access to ${r.code}`}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await removeRole(userId, r.locationId)
                      if (!result.ok) return void toast.error(result.error)
                      toast.success(`Removed access to ${r.code}`)
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            startTransition(async () => {
              const result = await setRole({ userId, locationId: choice.locationId, role: choice.role })
              if (!result.ok) return void toast.error(result.error)
              toast.success("Access updated")
            })
          }}
        >
          <RolePicker locations={locations} onChange={setChoice} />
          <div>
            <Button type="submit" variant="outline" disabled={pending || !choice.locationId}>
              Add / update access
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function PasswordCard({ userId }: { userId: string }) {
  const [password, setPassword] = useState("")
  const [pending, startTransition] = useTransition()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset password</CardTitle>
        <CardDescription>Set a new temporary password and share it with the person.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            startTransition(async () => {
              const result = await resetPassword(userId, password)
              if (!result.ok) return void toast.error(result.error)
              setPassword("")
              toast.success("Password changed")
            })
          }}
        >
          <Input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (min. 8 characters)"
            minLength={8}
            autoComplete="new-password"
            aria-label="New password"
          />
          <Button type="submit" disabled={pending || password.length < 8}>
            Set
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
