"use client"

import { useState, useTransition } from "react"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { createCategory, deleteCategory, renameCategory } from "../actions"

type Category = { id: string; name: string; itemCount: number }

export function CategoriesEditor({ categories }: { categories: Category[] }) {
  const [name, setName] = useState("")
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          startTransition(async () => {
            const result = await createCategory(name)
            if (!result.ok) return void toast.error(result.error)
            setName("")
            toast.success("Category added")
          })
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New category name"
          aria-label="New category name"
          maxLength={60}
        />
        <Button type="submit" disabled={pending || !name.trim()}>
          <Plus />
          Add
        </Button>
      </form>

      <Card>
        <CardContent className="flex flex-col divide-y">
          {categories.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No categories yet.</p>
          )}
          {categories.map((category) => (
            <CategoryRow key={category.id} category={category} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function CategoryRow({ category }: { category: Category }) {
  const [name, setName] = useState(category.name)
  const [pending, startTransition] = useTransition()
  const changed = name.trim() !== category.name

  return (
    <form
      className="flex items-center gap-2 py-2"
      onSubmit={(e) => {
        e.preventDefault()
        startTransition(async () => {
          const result = await renameCategory(category.id, name)
          if (!result.ok) return void toast.error(result.error)
          toast.success("Category renamed")
        })
      }}
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        aria-label={`Name of ${category.name}`}
        maxLength={60}
      />
      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
        {category.itemCount} item{category.itemCount === 1 ? "" : "s"}
      </span>
      {changed && (
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Delete ${category.name}`}
        disabled={pending}
        onClick={() => {
          const message =
            category.itemCount > 0
              ? `Delete “${category.name}”? Its ${category.itemCount} item(s) will become uncategorised.`
              : `Delete “${category.name}”?`
          if (!window.confirm(message)) return
          startTransition(async () => {
            const result = await deleteCategory(category.id)
            if (!result.ok) return void toast.error(result.error)
            toast.success("Category deleted")
          })
        }}
      >
        <Trash2 />
      </Button>
    </form>
  )
}
