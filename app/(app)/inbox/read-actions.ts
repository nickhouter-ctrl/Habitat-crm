"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireWriteUser } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { emailInbox } from "@/lib/db/schema";

export async function markMailRead(id: string) {
  await requireWriteUser();
  z.string().uuid().parse(id);
  // The mailbox is shared by CRM staff; no customer-supplied account scope.
  const changed = await db.update(emailInbox).set({ readAt: new Date() })
    .where(and(eq(emailInbox.id, id), isNull(emailInbox.readAt)))
    .returning({ id: emailInbox.id });
  if (changed.length) revalidatePath("/", "layout");
}
