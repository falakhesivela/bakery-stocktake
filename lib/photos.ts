"use client"

import { createClient } from "@/lib/supabase/client"

const MAX_SIDE = 1600

/** Shrinks a phone photo to at most 1600 px and re-encodes it as JPEG. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't read the photo"))), "image/jpeg", 0.8),
  )
}

/**
 * Uploads a photo to the private "photos" bucket under the location's folder
 * (only staff of that location can see it). Returns the stored path.
 */
export async function uploadPhoto(locationId: string, folder: "waste" | "damage", blob: Blob) {
  const path = `${locationId}/${folder}/${crypto.randomUUID()}.jpg`
  const { error } = await createClient()
    .storage.from("photos")
    .upload(path, blob, { contentType: "image/jpeg", upsert: false })
  if (error) throw new Error(`Photo upload failed: ${error.message}`)
  return path
}
