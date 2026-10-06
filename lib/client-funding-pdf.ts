import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { isLocale, type Locale } from "@/lib/i18n";
import { getPdfContact, pdfDateStamp, type ClientPdf } from "@/lib/pdf-shared";
import { loadProjectFunding } from "@/lib/project-funding";
import { clientFundingAmounts, clientFundingReport } from "@/lib/client-funding-report";
import { renderReportPdf } from "@/lib/report-pdf";

export async function renderClientFundingPdf(projectId: string, requestedLocale?: Locale): Promise<ClientPdf | null> {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId), columns: { name: true, contactId: true },
  });
  if (!project) return null;
  const [funding, contact] = await Promise.all([
    loadProjectFunding(projectId), getPdfContact(project.contactId),
  ]);
  const current = funding.get(projectId);
  if (!current) return null;
  const locale = requestedLocale ?? (isLocale(contact?.preferredLanguage) ? contact.preferredLanguage : "en");
  const buffer = await renderReportPdf(clientFundingReport({
    projectName: project.name, clientName: contact?.name ?? null,
    generatedAt: new Date(), locale,
    amounts: clientFundingAmounts(current.cover, current.margins),
  }));
  return {
    buffer,
    filename: `voorschotoverzicht-${project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${pdfDateStamp()}.pdf`,
    projectName: project.name,
    contactEmail: contact?.email ?? null,
  };
}
