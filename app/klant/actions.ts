"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { activities, contacts, projects } from "@/lib/db/schema";
import { sendMail } from "@/lib/gmail";
import {
  kiesTaal,
  klantContacten,
  klantEmail,
  maakLoginToken,
  verifieerLoginToken,
  wisKlantSessie,
  zetKlantSessie,
} from "@/lib/klant-portal";
import { klantT } from "./_t";
import { rateLimit } from "@/lib/rate-limit";

const APP_URL = (process.env.APP_URL ?? "https://crm.habitat-one.com").replace(/\/$/, "");

/** Mailtekst van de inloglink, in de taal van de klant. */
function loginMailHtml(taal: ReturnType<typeof kiesTaal>, url: string): { subject: string; html: string } {
  const teksten = {
    nl: { subject: "Uw inloglink — Habitat One klantportaal", kop: "Inloggen bij uw klantportaal", knop: "Open mijn portaal", uitleg: "Klik op de knop om in te loggen. De link is 30 minuten geldig.", negeer: "Heeft u dit niet aangevraagd? Dan kunt u deze mail negeren." },
    en: { subject: "Your login link — Habitat One client portal", kop: "Log in to your client portal", knop: "Open my portal", uitleg: "Click the button to log in. The link is valid for 30 minutes.", negeer: "Didn't request this? You can safely ignore this email." },
    es: { subject: "Su enlace de acceso — portal del cliente Habitat One", kop: "Acceda a su portal del cliente", knop: "Abrir mi portal", uitleg: "Haga clic en el botón para entrar. El enlace es válido durante 30 minutos.", negeer: "¿No lo ha solicitado? Puede ignorar este correo." },
  }[taal];
  return {
    subject: teksten.subject,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#402419">
        <h2 style="color:#402419">${teksten.kop}</h2>
        <p>${teksten.uitleg}</p>
        <p style="margin:28px 0">
          <a href="${url}" style="background:#b5532b;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">${teksten.knop}</a>
        </p>
        <p style="color:#8a7a6d;font-size:12px">${teksten.negeer}</p>
      </div>`,
  };
}

/**
 * Stap 1: klant vraagt een inloglink aan. Anti-enumeratie: het antwoord is
 * altijd hetzelfde, of het adres nu bestaat of niet.
 */
export async function vraagLoginLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const taal = kiesTaal(String(formData.get("lang") ?? "nl"));
  if (!email || !email.includes("@")) redirect(`/klant?lang=${taal}&sent=1`);

  const magDoor = await rateLimit(`klant-login:${email}`, 5, 15 * 60);
  if (magDoor) {
    const cts = await klantContacten(email);
    const heeftProject =
      cts.length > 0 &&
      (await db
        .select({ n: sql<number>`count(*)::int` })
        .from(projects)
        .where(inArray(projects.contactId, cts.map((c) => c.id))))[0]!.n > 0;
    if (heeftProject) {
      const url = `${APP_URL}/klant/login/${maakLoginToken(email)}?lang=${taal}`;
      const mail = loginMailHtml(taal, url);
      // Persoonlijke inloglink → geen vaste bedrijfs-BCC.
      await sendMail({ to: email, subject: mail.subject, html: mail.html, noCompanyBcc: true }).catch((e) => {
        console.error("[klant-portal] inloglink-mail mislukt:", e);
      });
    }
  }
  redirect(`/klant?lang=${taal}&sent=1`);
}

/** Stap 2: klik op de knop in de mail → cookie zetten. */
export async function loginMetToken(token: string, taal: string) {
  const email = verifieerLoginToken(token);
  if (!email) redirect(`/klant?lang=${kiesTaal(taal)}&invalid=1`);
  await zetKlantSessie(email);
  redirect(`/klant/projecten?lang=${kiesTaal(taal)}`);
}

export async function uitloggen(taal: string) {
  await wisKlantSessie();
  redirect(`/klant?lang=${kiesTaal(taal)}`);
}

/** Klant werkt zijn eigen gegevens bij — alleen de eigen contactkaart(en). */
export async function bewaarGegevens(formData: FormData) {
  const email = await klantEmail();
  const taal = kiesTaal(String(formData.get("lang") ?? "nl"));
  if (!email) redirect(`/klant?lang=${taal}`);

  const s = (k: string, max = 200) => String(formData.get(k) ?? "").trim().slice(0, max) || null;
  const naam = s("name");
  const voorkeurstaal = kiesTaal(String(formData.get("preferredLanguage") ?? ""));

  const cts = await klantContacten(email);
  if (cts.length === 0) redirect(`/klant/projecten?lang=${taal}`);

  for (const c of cts) {
    await db
      .update(contacts)
      .set({
        ...(naam ? { name: naam } : {}),
        phone: s("phone", 40),
        mobile: s("mobile", 40),
        taxId: s("taxId", 40),
        addressLine: s("addressLine"),
        postalCode: s("postalCode", 16),
        city: s("city", 80),
        province: s("province", 80),
        country: s("country", 40) ?? "ES",
        preferredLanguage: voorkeurstaal,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, c.id));
  }

  // Logboek: de klant vulde zelf zijn gegevens aan (bewust zonder authorId).
  await db.insert(activities).values({
    type: "note",
    subject: `Klant vulde eigen gegevens aan via het portaal`,
    body: `${naam ?? cts[0].name} (${email})`,
    contactId: cts[0].id,
  });

  revalidatePath("/klant/gegevens");
  redirect(`/klant/gegevens?lang=${taal}&saved=1`);
}

/** Interne actie (staff): stuur de klant van een project een portaal-uitnodiging. */
export async function stuurKlantportaalUitnodiging(projectId: string) {
  const { requireWriteUser } = await import("@/lib/auth/guards");
  const user = await requireWriteUser();

  const [proj] = await db
    .select({ id: projects.id, name: projects.name, contactId: projects.contactId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!proj?.contactId) throw new Error("Dit project heeft geen gekoppeld contact.");
  const [contact] = await db
    .select({ email: contacts.email, name: contacts.name, preferredLanguage: contacts.preferredLanguage })
    .from(contacts)
    .where(eq(contacts.id, proj.contactId))
    .limit(1);
  if (!contact?.email) throw new Error("Het contact heeft geen e-mailadres.");

  const taal = kiesTaal(contact.preferredLanguage);
  const t = klantT(taal);
  const url = `${APP_URL}/klant/login/${maakLoginToken(contact.email)}?lang=${taal}`;
  const intro = {
    nl: `Via ons klantportaal volgt u de voortgang van <strong>${proj.name}</strong>, ziet u facturen en betalingen, en kunt u uw gegevens aanvullen.`,
    en: `In our client portal you can follow the progress of <strong>${proj.name}</strong>, see invoices and payments, and complete your details.`,
    es: `En nuestro portal del cliente puede seguir el progreso de <strong>${proj.name}</strong>, ver facturas y pagos, y completar sus datos.`,
  }[taal];
  await sendMail({
    to: contact.email,
    subject: `${t.portaal} — Habitat One`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#402419">
        <h2 style="color:#402419">${t.portaal}</h2>
        <p>${intro}</p>
        <p style="margin:28px 0">
          <a href="${url}" style="background:#b5532b;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">${t.inloggen}</a>
        </p>
        <p style="color:#8a7a6d;font-size:12px">${t.disclaimer}</p>
      </div>`,
    noCompanyBcc: true,
  });

  await db.insert(activities).values({
    type: "email",
    subject: `Klantportaal-uitnodiging gestuurd: ${proj.name}`,
    body: `Naar ${contact.name} <${contact.email}>`,
    contactId: proj.contactId,
    authorId: user.id,
  });
  revalidatePath(`/projects/${projectId}`);
}
