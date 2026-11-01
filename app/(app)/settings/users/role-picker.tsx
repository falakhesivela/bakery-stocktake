"use client"

import { useState } from "react"
import { Field, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import {
  ROLE_LABELS,
  ROLES_BY_LOCATION_TYPE,
  type LocationRole,
  type LocationType,
} from "@/lib/permissions"

export type LocationOption = { id: string; code: string; name: string; type: LocationType }

/** Location + role selects; the role list depends on the location type. */
export function RolePicker({
  locations,
  allowNone = false,
  onChange,
}: {
  locations: LocationOption[]
  allowNone?: boolean
  onChange?: (value: { locationId: string; role: LocationRole | "" }) => void
}) {
  const [locationId, setLocationId] = useState(allowNone ? "" : (locations[0]?.id ?? ""))
  const location = locations.find((l) => l.id === locationId)
  const roles = location ? ROLES_BY_LOCATION_TYPE[location.type] : []
  const [role, setRole] = useState<LocationRole | "">(roles[0] ?? "")

  function update(nextLocationId: string, nextRole?: LocationRole | "") {
    const nextLocation = locations.find((l) => l.id === nextLocationId)
    const allowed = nextLocation ? ROLES_BY_LOCATION_TYPE[nextLocation.type] : []
    const resolvedRole =
      nextRole !== undefined && allowed.includes(nextRole as LocationRole)
        ? nextRole
        : (allowed[0] ?? "")
    setLocationId(nextLocationId)
    setRole(resolvedRole)
    onChange?.({ locationId: nextLocationId, role: resolvedRole })
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="locationId">Location</FieldLabel>
        <NativeSelect
          id="locationId"
          name="locationId"
          className="w-full"
          value={locationId}
          onChange={(e) => update(e.target.value)}
        >
          {allowNone && <NativeSelectOption value="">No location for now</NativeSelectOption>}
          {locations.map((l) => (
            <NativeSelectOption key={l.id} value={l.id}>
              {l.code} · {l.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor="role">Role</FieldLabel>
        <NativeSelect
          id="role"
          name="role"
          className="w-full"
          value={role}
          disabled={!location}
          onChange={(e) => update(locationId, e.target.value as LocationRole)}
        >
          {!location && <NativeSelectOption value="">—</NativeSelectOption>}
          {roles.map((r) => (
            <NativeSelectOption key={r} value={r}>
              {ROLE_LABELS[r]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
    </div>
  )
}
