import type { Metadata } from "next"
import { PageHeader } from "@/components/page-header"
import { ChangePasswordForm } from "./change-password-form"

export const metadata: Metadata = { title: "Change password" }

export default function AccountPage() {
  return (
    <>
      <PageHeader title="Change password" description="Choose a password only you know." />
      <ChangePasswordForm />
    </>
  )
}
