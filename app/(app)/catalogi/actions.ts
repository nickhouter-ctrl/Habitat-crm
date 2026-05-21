"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { deleteCatalogFile, uploadCatalogFile } from "@/lib/storage";

async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Niet ingelogd");
}

/** Upload een catalogus/brochure-PDF naar de catalogi-bibliotheek. */
export async function uploadCatalog(formData: FormData) {
  await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  await uploadCatalogFile(file);
  revalidatePath("/catalogi");
}

/** Verwijder een catalogus uit de bibliotheek. */
export async function deleteCatalog(path: string) {
  await requireUser();
  await deleteCatalogFile(path);
  revalidatePath("/catalogi");
}
