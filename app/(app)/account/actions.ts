"use server"

import { z } from "zod"
import { fail, ok, type ActionResult } from "@/lib/action-result"
import { createClient } from "@/lib/supabase/server"

const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters").max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "The two passwords don't match" })

export async function changePassword(input: z.input<typeof schema>): Promise<ActionResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form")

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return fail(error.message)
  return ok(null)
}
