// Role and permission rules shared by server and client code.

export type LocationType = "warehouse" | "store"

export type LocationRole =
  | "warehouse_manager"
  | "warehouse_staff"
  | "store_manager"
  | "store_staff"
  | "driver"

export const ROLE_LABELS: Record<LocationRole, string> = {
  warehouse_manager: "Warehouse manager",
  warehouse_staff: "Baker / warehouse staff",
  store_manager: "Store manager",
  store_staff: "Store staff",
  driver: "Driver",
}

export const ROLES_BY_LOCATION_TYPE: Record<LocationType, LocationRole[]> = {
  warehouse: ["warehouse_manager", "warehouse_staff", "driver"],
  store: ["store_manager", "store_staff"],
}

const MANAGER_ROLES: LocationRole[] = ["warehouse_manager", "store_manager"]
const LABEL_ROLES: LocationRole[] = [
  "warehouse_manager",
  "warehouse_staff",
  "store_manager",
]

export type UserLocation = {
  id: string
  code: string
  name: string
  type: LocationType
  canProduce: boolean
  timezone: string
  /** null when an admin sees a location they have no explicit role at. */
  role: LocationRole | null
}

export type CurrentUser = {
  id: string
  email: string | null
  fullName: string
  isAdmin: boolean
  /** Locations this user can work at (all active locations for admins). */
  locations: UserLocation[]
}

export function canManageLocation(user: CurrentUser, locationId: string) {
  if (user.isAdmin) return true
  return user.locations.some(
    (l) => l.id === locationId && l.role !== null && MANAGER_ROLES.includes(l.role),
  )
}

/** Locations where the user can post stock, approve counts, etc. */
export function managedLocations(user: CurrentUser) {
  return user.locations.filter((l) => canManageLocation(user, l.id))
}

/** Any role except driver: can bake, pick, dispatch and receive. */
export function canWorkLocation(user: CurrentUser, locationId: string) {
  if (user.isAdmin) return true
  return user.locations.some(
    (l) => l.id === locationId && l.role !== null && l.role !== "driver",
  )
}

/** Locations where the user can do day-to-day work (not driver-only). */
export function workLocations(user: CurrentUser) {
  return user.locations.filter((l) => canWorkLocation(user, l.id))
}

/** Locations where the user can log bakes. */
export function productionLocations(user: CurrentUser) {
  return user.locations.filter((l) => l.canProduce && canWorkLocation(user, l.id))
}

/** Admins and managers of a location that bakes (mirrors can_edit_recipes()). */
export function canEditRecipes(user: CurrentUser) {
  return (
    user.isAdmin ||
    user.locations.some(
      (l) => l.canProduce && l.role !== null && MANAGER_ROLES.includes(l.role),
    )
  )
}

/** Admins and managers of any location (mirrors is_any_manager()). */
export function isAnyManager(user: CurrentUser) {
  return user.isAdmin || user.locations.some((l) => l.role !== null && MANAGER_ROLES.includes(l.role))
}

export function canPrintLabels(user: CurrentUser) {
  return (
    user.isAdmin ||
    user.locations.some((l) => l.role !== null && LABEL_ROLES.includes(l.role))
  )
}
