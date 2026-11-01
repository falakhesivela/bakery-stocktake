"use client"

import Link from "next/link"
import { useActionState, useMemo } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Switch } from "@/components/ui/switch"
import { saveLocation, type LocationFormState } from "./actions"

export type LocationValues = {
  id?: string
  code: string
  name: string
  type: "warehouse" | "store"
  address: string
  phone: string
  canProduce: boolean
  timezone: string
  active: boolean
}

export const EMPTY_LOCATION: LocationValues = {
  code: "",
  name: "",
  type: "store",
  address: "",
  phone: "",
  canProduce: false,
  timezone: "Africa/Johannesburg",
  active: true,
}

export function LocationForm({ initial }: { initial: LocationValues }) {
  const [state, action, pending] = useActionState<LocationFormState, FormData>(saveLocation, {})
  const timezones = useMemo(() => Intl.supportedValuesOf("timeZone"), [])

  return (
    <form action={action} className="flex max-w-2xl flex-col gap-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
              <Field>
                <FieldLabel htmlFor="code">Code</FieldLabel>
                <Input
                  id="code"
                  name="code"
                  required
                  maxLength={12}
                  defaultValue={initial.code}
                  className="font-mono uppercase"
                  placeholder="ST-03"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input id="name" name="name" required maxLength={80} defaultValue={initial.name} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="type">Type</FieldLabel>
              <NativeSelect id="type" name="type" className="w-full" defaultValue={initial.type}>
                <NativeSelectOption value="store">Store</NativeSelectOption>
                <NativeSelectOption value="warehouse">Warehouse</NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor="address">Address</FieldLabel>
              <Input id="address" name="address" maxLength={200} defaultValue={initial.address} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input id="phone" name="phone" type="tel" maxLength={40} defaultValue={initial.phone} />
              </Field>
              <Field>
                <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
                <NativeSelect id="timezone" name="timezone" className="w-full" defaultValue={initial.timezone}>
                  {timezones.map((tz) => (
                    <NativeSelectOption key={tz} value={tz}>
                      {tz}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldDescription>Decides when “today” starts for dates and expiry.</FieldDescription>
              </Field>
            </div>
            <Field orientation="horizontal">
              <Switch id="canProduce" name="canProduce" defaultChecked={initial.canProduce} />
              <div>
                <FieldLabel htmlFor="canProduce">Bakes on site</FieldLabel>
                <FieldDescription>Turn on if products are baked here (enables production).</FieldDescription>
              </div>
            </Field>
            <Field orientation="horizontal">
              <Switch id="active" name="active" defaultChecked={initial.active} />
              <div>
                <FieldLabel htmlFor="active">Active</FieldLabel>
                <FieldDescription>Inactive locations are hidden from forms. Their history is kept.</FieldDescription>
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : initial.id ? "Save changes" : "Create location"}
        </Button>
        <Link href="/settings/locations" className={buttonVariants({ variant: "ghost", size: "lg" })}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
