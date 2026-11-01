import type { Metadata } from "next"
import { Suspense } from "react"
import { CakeSlice } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { LoginForm } from "./login-form"

export const metadata: Metadata = { title: "Sign in" }

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CakeSlice className="size-5" />
          </div>
          <CardTitle className="text-xl">Bakery Stock</CardTitle>
          <CardDescription>
            Sign in with the account your manager set up for you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  )
}
