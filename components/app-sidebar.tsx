"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Barcode,
  Boxes,
  CakeSlice,
  ChartColumn,
  ChefHat,
  ChevronsUpDown,
  BookOpenText,
  ClipboardCheck,
  Contact,
  Gauge,
  History,
  KeyRound,
  ListChecks,
  PackageOpen,
  LayoutDashboard,
  LogOut,
  PackagePlus,
  Receipt,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react"
import { signOut } from "@/app/actions/auth"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  canPrintLabels,
  managedLocations,
  productionLocations,
  ROLE_LABELS,
  workLocations,
  type CurrentUser,
} from "@/lib/permissions"

type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  show?: (user: CurrentUser) => boolean
}

const hasWork = (u: CurrentUser) => workLocations(u).length > 0

// Grouped so the menu stays easy to scan on a phone.
const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  {
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      {
        title: "Reports",
        href: "/reports",
        icon: ChartColumn,
        show: (u) => managedLocations(u).length > 0,
      },
    ],
  },
  {
    label: "Daily work",
    items: [
      {
        title: "Transfers",
        href: "/transfers",
        icon: Truck,
        show: (u) => u.isAdmin || u.locations.length > 0,
      },
      {
        title: "Production",
        href: "/production",
        icon: ChefHat,
        show: (u) => productionLocations(u).length > 0,
      },
      { title: "Sales", href: "/sales", icon: Receipt, show: hasWork },
      { title: "Waste", href: "/waste", icon: Trash2, show: hasWork },
      { title: "Customer orders", href: "/orders", icon: ShoppingBag, show: hasWork },
      { title: "Deliveries", href: "/deliveries", icon: PackageOpen, show: hasWork },
      { title: "End of day", href: "/end-of-day", icon: ListChecks, show: hasWork },
    ],
  },
  {
    label: "Stock",
    items: [
      { title: "Stock on hand", href: "/stock", icon: Boxes },
      { title: "Stock takes", href: "/stock-takes", icon: ClipboardCheck, show: hasWork },
      {
        title: "Opening stock",
        href: "/stock/opening",
        icon: PackagePlus,
        show: (u) => managedLocations(u).length > 0,
      },
      {
        title: "Reorder levels",
        href: "/stock/levels",
        icon: Gauge,
        show: (u) => managedLocations(u).length > 0,
      },
      { title: "Labels", href: "/labels", icon: Barcode, show: canPrintLabels },
    ],
  },
  {
    label: "Products & suppliers",
    items: [
      { title: "Catalogue", href: "/catalogue", icon: CakeSlice },
      {
        title: "Recipes",
        href: "/recipes",
        icon: BookOpenText,
        show: (u) => u.isAdmin || productionLocations(u).length > 0 || managedLocations(u).length > 0,
      },
      { title: "Suppliers", href: "/suppliers", icon: Contact, show: hasWork },
    ],
  },
]

const ADMIN_NAV: NavItem[] = [
  { title: "Locations", href: "/settings/locations", icon: Store },
  { title: "Users", href: "/settings/users", icon: Users },
  { title: "Audit log", href: "/settings/audit", icon: History },
]

function isActive(pathname: string, href: string) {
  if (href === "/stock") return pathname === "/stock"
  return pathname === href || pathname.startsWith(`${href}/`)
}

function SidebarBrand() {
  return (
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" render={<Link href="/dashboard" />}>
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <CakeSlice className="size-4" />
            </div>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">Bakery Stock</span>
              <span className="truncate text-xs text-muted-foreground">
                Stores & warehouses
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  )
}

export function AppSidebar({ user }: { user: CurrentUser }) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const closeOnMobile = () => setOpenMobile(false)

  const roleSummary = user.isAdmin
    ? "Admin"
    : user.locations
        .map((l) => (l.role ? `${ROLE_LABELS[l.role]} · ${l.code}` : l.code))
        .join(", ") || "No location assigned"

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarBrand />
      <SidebarContent>
        {NAV_GROUPS.map((group, index) => {
          const items = group.items.filter((item) => !item.show || item.show(user))
          if (items.length === 0) return null
          return (
            <SidebarGroup key={group.label ?? index}>
              {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={isActive(pathname, item.href)}
                        tooltip={item.title}
                        render={<Link href={item.href} onClick={closeOnMobile} />}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}

        {user.isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Settings</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ADMIN_NAV.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive(pathname, item.href)}
                      tooltip={item.title}
                      render={<Link href={item.href} onClick={closeOnMobile} />}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<SidebarMenuButton size="lg" />}
              >
                <div className="flex size-8 items-center justify-center rounded-lg bg-muted text-xs font-semibold uppercase">
                  {initials(user.fullName)}
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.fullName}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {roleSummary}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-60">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <div className="font-medium text-foreground">{user.fullName}</div>
                    <div className="text-xs font-normal">{user.email}</div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem render={<Link href="/account" onClick={closeOnMobile} />}>
                  <KeyRound />
                  Change password
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut()
                    // Full page load (not router.push) so hidden pages and
                    // drafts from this person don't stay in the browser.
                    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                    window.location.href = "/login"
                  }}
                >
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

export function AppSidebarSkeleton() {
  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarBrand />
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {["80%", "65%", "75%", "55%", "70%"].map((width, i) => (
              <SidebarMenuItem key={i}>
                <SidebarMenuSkeleton showIcon width={width} />
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
}
