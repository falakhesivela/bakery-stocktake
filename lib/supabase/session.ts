import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabasePublishableKey, getSupabaseUrl } from "./env"

const PUBLIC_PATHS = ["/login"]

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  )
}

/**
 * Refreshes the Supabase session cookie on every request and does a quick
 * signed-in check. Pages still verify the user on the server; this only
 * avoids rendering protected pages for signed-out visitors.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
          if (headers) {
            Object.entries(headers).forEach(([key, value]) =>
              response.headers.set(key, value),
            )
          }
        },
      },
    },
  )

  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims?.sub)
  const { pathname, search } = request.nextUrl

  // Signed-in users may still open /login: a deactivated account has a valid
  // session but no access, and must be able to land there without looping.
  if (!signedIn && !isPublicPath(pathname)) {
    return redirectWithCookies(request, response, "/login", pathname + search)
  }

  return response
}

function redirectWithCookies(
  request: NextRequest,
  from: NextResponse,
  to: string,
  next?: string,
) {
  const url = request.nextUrl.clone()
  url.pathname = to
  url.search = ""
  if (next && next !== "/") url.searchParams.set("next", next)

  const redirect = NextResponse.redirect(url)
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}
