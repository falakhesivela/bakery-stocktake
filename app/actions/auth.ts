"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { safeNextPath } from "@/lib/safe-redirect"

export type SignInState = { error?: string; email?: string }

const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
})

export async function signIn(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  })
  const email = String(formData.get("email") ?? "")

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message, email }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    return { error: "Wrong email or password.", email }
  }

  redirect(safeNextPath(formData.get("next")))
}

/**
 * Signs out. The caller does a full page load to /login afterwards, so no
 * hidden pages or form drafts from this person stay in the browser (shared
 * store tablets).
 */
export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
}
