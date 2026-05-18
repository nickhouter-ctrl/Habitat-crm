/**
 * Upload mail-bijlagen naar Supabase Storage + auto-categoriseer op basis van
 * afzender, bestandsnaam en mail-onderwerp.
 */
import { createClient } from "@supabase/supabase-js";

import { db } from "@/lib/db";
import { mailAttachments } from "@/lib/db/schema";
import { CATEGORIES, type AttachmentCategory } from "@/lib/email-categories";
import type { ParsedAttachment, ParsedEmail } from "@/lib/gmail";

export { CATEGORIES };
export type { AttachmentCategory };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "email-attachments";

function supabase() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase env vars missing");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

/**
 * Suppliers worden in volgorde gecheckt — **echte leveranciers eerst**, daarna
 * agents/intermediairs, daarna transport/banken. Allpack is geen leverancier
 * maar formele exporter; alleen taggen als geen ECHTE supplier-referentie te
 * vinden is. Per supplier zijn de patterns gesplit in:
 *   - strong: zeer specifiek (order-id, factuur-prefix) — sterke signaal
 *   - weak: alleen naam — alleen meetellen als geen strong-match elders
 */
const SUPPLIER_PATTERNS: Array<{
  tag: string;
  isAgent?: boolean;
  strong?: RegExp[];
  weak?: RegExp[];
}> = [
  // 1. Echte leveranciers (strong signals = orderrefs/factuur-prefixen)
  { tag: "Yohome", strong: [/YHES\d+/i, /YH-?ES\d+/i], weak: [/yohome/i, /\@yohome/i] },
  { tag: "KKR / KingKonree", strong: [/33#kkr\d/i, /\bkkr20\d{6,}/i], weak: [/kingkonree/i, /\@kkr/i, /KKR-[A-Z0-9]/i] },
  { tag: "Magic Stone", strong: [/MS20\d{6}-XBY/i, /flexi[-\s]*modified[-\s]*clay/i], weak: [/magicstone/i, /magic-stone/i, /flexistone/i] },
  { tag: "Arkwright (MS-supplier)", strong: [/ARK25\d{5,}/i, /ARK\d{6,}/i, /changzhou\s*arkwright/i], weak: [/arkwright/i] },
  { tag: "Hebei Zengyi (XPS)", strong: [/HN-K-20\d{6}-S-PL/i, /hebei\s*zengyi/i], weak: [/XPS\s*Backer/i] },
  { tag: "Foshan Hanhai (Windows)", strong: [/HANH002\d+/i], weak: [/foshan\s*hanhai/i] },
  { tag: "Foshan Keyi (Windows)", strong: [/KY086-\d+/i], weak: [/foshan\s*keyi/i] },
  { tag: "Foshan HanTherm", strong: [/H251\d{5,}/i], weak: [/hantherm/i] },
  // 2. Agents/intermediairs (alleen als geen echte supplier gevonden)
  { tag: "Allpack (CN agent)", isAgent: true, weak: [/allpack/i, /@allpack/i] },
  { tag: "Teresa (ES agent)", isAgent: true, weak: [/españa\s*trading/i, /tborras/i, /etrading\.tborras/i] },
  // 3. Transport / douane / overheid (sterk signaal want eigen merknaam)
  { tag: "Alianza (transport)", strong: [/23T[\/_-][AC][_-]?\d/i, /galadtrans/i, /@alianza-gt/i], weak: [/alianza/i] },
  { tag: "Oper-Traimer (transport ES)", strong: [/^FACTURA_MARTRM-F[A-Z]+\d+/i, /oper[-\s]*traimer/i], weak: [/A83205815/i] },
  { tag: "Gomez Macias (douane-agent)", weak: [/gomez\s*macias/i, /\bgmcargo\b/i] },
  { tag: "Spanish Tax Agency", weak: [/agenciatributaria/i, /agencia\s*tributaria/i] },
  { tag: "Banco Sabadell", weak: [/sabadell/i, /bsabesbb/i] },
  { tag: "CaixaBank", weak: [/caixabank/i, /caixesbb/i] },
];

const CATEGORY_RULES: Array<{ cat: AttachmentCategory; test: (ctx: CategorizeCtx) => boolean }> = [
  // Eigen analyses (kostprijs/inkoop-verkoop spreadsheets) — EERST, want anders
  // worden ze meegezogen in customs-dua/supplier door e-mail-context.
  { cat: "other", test: (c) =>
      /\.xlsx?$/i.test(c.filename) &&
      /\b(kostprijs|inkoop[_\s-]*verkoop|verkoop[_\s-]*prijs|prijslijst|kalkulatie|berekening)\b/i.test(c.filename) },

  // DUA / douane — alleen wanneer FILENAME of strong signaal in TEKST matcht
  // (niet wanneer alleen het woord 'DUA' ergens in een mail-body voorkomt).
  { cat: "customs-dua", test: (c) =>
      // Strong filename patterns
      /^LEVANTE\b|^23T[\/_-][AC][_-]?\d|certificado.*importaci|^BorradorH1IMCAU|H1IMCAU.*OPERVAL|^DUA[-\s]?\d|HS[_\s-]*CODE.*DUTY/i.test(c.filename) ||
      /^20260\d{10,}\.pdf$/i.test(c.filename) ||
      // Tax-overview spreadsheets (Allpack/Yohome) — herkenbaar via 'import taxes'
      /^import\s*taxes/i.test(c.filename) ||
      // Sterke tekst-signalen: AEAT / Aduana / declaración aduanera
      /agencia\s*aduanera|declaraci[oó]n\s*aduanera|aeat\s*despacho/i.test(c.allText) },

  // Teresa commissie (Spanje) — alleen haar eigen Factura 26500xxx files
  { cat: "agent-fee-spain", test: (c) =>
      /^Factura\s+(25|26)5\d{5}/i.test(c.filename) ||
      (/españa\s*trading|tborras|etrading\.tborras/i.test(c.fromEmail) &&
       !/FACTURA_MARTRM/i.test(c.filename)) },

  // OPER-TRAIMER S.A. (Madrid) — Spaanse vrachtagent. FACTURA_MARTRM-F* zijn
  // hun zeevracht-facturen. NIET Teresa, NIET de Chinese leverancier.
  { cat: "freight-invoice", test: (c) =>
      /^FACTURA_MARTRM-F[A-Z]+\d+/i.test(c.filename) ||
      /oper[-\s]*traimer/i.test(c.allText + " " + c.fromEmail) },

  // Allpack handling-fee (China) — handling costs CI. Filename met
  // 'handling cost' → altijd Allpack, ongeacht afzender.
  { cat: "agent-fee-china", test: (c) =>
      /handling[\s-]*costs?|handling[\s-]*fee/i.test(c.filename) ||
      (/handling\s*costs?|handling[-\s]*fee/i.test(c.allText) &&
       /allpack/i.test(c.fromEmail + " " + c.allText)) },

  // Supplier-invoice — factory CIs (eerst, vóór de Allpack-sender catch-all,
  // want Allpack stuurt vaak supplier-CIs door)
  { cat: "supplier-invoice", test: (c) =>
      /^FACTURA_MARTRM-F[A-Z]+\d+/i.test(c.filename) ||
      /^CI[\s-]*33#?kkr.*without/i.test(c.filename) ||
      /^CI[\s-]*MS\d+.*XBY|^CI-MS\d{6,}\.xls/i.test(c.filename) ||
      /^CI[\s-]*HL\d+|^CI[\s-]*YH\d+|^CI[\s-]*AP\d+|^CI-KY086-\d+/i.test(c.filename) ||
      /^Commercial\s*Invoice\s*for\s*PJ\d+|YOHOME[\s-]*Commercial\s*invoice|KKR\s*PI\s*33#kkr/i.test(c.filename) ||
      /HN-K-20\d+-S-PL.*(without|backing\s*board)/i.test(c.filename) },

  // Allpack-sender catch-all (na supplier-invoice)
  { cat: "agent-fee-china", test: (c) =>
      /allpack-?ent\.com|@allpack/i.test(c.fromEmail) },

  // Vrachtfactuur — Alianza/Galadtrans + lokale transporteurs
  { cat: "freight-invoice", test: (c) =>
      /alianza|galadtrans/i.test(c.fromEmail) ||
      /^23T[\/_-][AC][_-]?\d/i.test(c.filename) ||
      /transportes\s*garcia\s*costa/i.test(c.allText) ||
      /transportkosten|fact(uur)?.*transport|freight\s*invoice/i.test(c.allText) },

  // Bankafschrift
  { cat: "bank-statement", test: (c) =>
      /sabadell|caixabank|bbva|santander/i.test(c.fromEmail) ||
      /extracto.*cuenta|bank.*statement|account.*statement|posición\s+global/i.test(c.allText) },

  // Aannemer — Csaba (Hongaarse aannemer voor installaties/renovaties op
  // diverse locaties: Benissa, Costa Nova, Oliva, warehouse). Aparte categorie
  // want bouwkosten ≠ vaste lasten.
  { cat: "contractor", test: (c) =>
      /csaba/i.test(c.fromName + " " + c.fromEmail) ||
      /^INVOICE\s+A1[2-6][0-9].*(WAREHOUSE|BENISSA|COSTA\s*NOVA|OLIVA)/i.test(c.filename) ||
      /works[_\s]*costs[_\s]*summary/i.test(c.filename) },

  // Bedrijfskosten — loods-huur, elektriciteit, water, forklift-rental, Google
  // Workspace, verzekeringen, AECOC, juridisch, trademark, JYSK
  { cat: "opex", test: (c) => {
      const t = c.allText + " " + c.filename;
      const f = c.fromName + " " + c.fromEmail;
      return (
        // Loods/warehouse-huur
        /creadores\s*sorprendentes|alquiler.*camí|alquiler.*javea|warehouse\s*rental|anexo.*contrato.*alquiler/i.test(t) ||
        /B5\d{2}\.?\s*CREADORES/i.test(c.filename) ||
        // Utilities
        /\belectric\s*consumpti|electricidad|iberdrola|endesa|naturgy|utilities|gastos\s*suplidos/i.test(t) ||
        // Forklift
        /\bforklift|carretilla.*elev|sabadell.*renting|alquiler.*forklift/i.test(t) ||
        /^P\d{4}\.pdf$/i.test(c.filename) ||
        // SaaS / subscriptions
        /google\s*workspace|microsoft\s*365|m365|holded\s*invoice|saas\s*subscription|aecoc|gs1\s*subscript/i.test(t) ||
        // Verzekering
        /\bseguro|verzekering|p[oó]liza|insurance.*habitat|D&O/i.test(t) ||
        // Csaba — aannemer
        // Csaba-invoices nu via 'contractor' regel hierboven afgevangen
        // Juridisch / trademark
        /trademark|deborah\s*vincze|mary\s*loas|HAB\s*\d+-\d+.*UE|registro.*marca/i.test(f + " " + t) ||
        // JYSK kantoormeubels
        /jysk\s*empresas/i.test(t) ||
        // AECOC GS1
        /aecoc/i.test(f) || /F26ALT\d+/i.test(c.filename)
      );
    } },

  // Certificaat (CE / CITES / etc.)
  { cat: "certificate", test: (c) =>
      /\bCE\s*cert|declaration\s*of\s*performance|conformity\s*declaration|CITES|EN\s*1634/i.test(c.allText) ||
      /欧标|cites/i.test(c.allText) },

  // Quote / Proforma — PI's en draft-offertes (NIET de echte handling-CI)
  { cat: "quote-proforma", test: (c) =>
      /\bproforma|\bquotation|\boff?erte|pro[\s-]*forma\s*invoice|\bPI\b.*\d|revised\s*PI/i.test(c.allText) &&
      !/handling\s*costs/i.test(c.allText) },

  // Supplier-invoice — Yohome/KKR/Magic Stone factory CI (NIET Allpack handling)
  { cat: "supplier-invoice", test: (c) =>
      (/commercial\s*invoice|invoice\s*no/i.test(c.allText) ||
       /YHES\d+|MS\d{8,}|33#kkr.*without/i.test(c.allText) ||
       /CI[-\s]*MS\d+/i.test(c.filename) ||
       /FACTURA_MARTRM-F[A-Z]+\d+/i.test(c.filename) ||
       /发票.*invoice/i.test(c.filename) ||
       /cornelius.*invoice|inkoop\s*order\s*cornelius/i.test(c.allText)) &&
      !/handling\s*costs?/i.test(c.allText) },
];

interface CategorizeCtx {
  filename: string;
  contentType: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  allText: string;
}

function detectSupplierTag(ctx: CategorizeCtx): string | null {
  const haystack = ctx.allText + " " + ctx.fromEmail;
  // 1. Eerst echte leveranciers met STRONG signals
  for (const sp of SUPPLIER_PATTERNS) {
    if (sp.isAgent) continue;
    if (!sp.strong?.length) continue;
    for (const p of sp.strong) {
      if (p.test(haystack)) return sp.tag;
    }
  }
  // 2. Dan echte leveranciers met WEAK signals (naam alleen)
  for (const sp of SUPPLIER_PATTERNS) {
    if (sp.isAgent) continue;
    if (!sp.weak?.length) continue;
    for (const p of sp.weak) {
      if (p.test(haystack)) return sp.tag;
    }
  }
  // 3. Pas dan agents (Allpack/Teresa)
  for (const sp of SUPPLIER_PATTERNS) {
    if (!sp.isAgent) continue;
    for (const p of sp.weak ?? []) {
      if (p.test(haystack)) return sp.tag;
    }
  }
  return null;
}

function detectCategory(ctx: CategorizeCtx): AttachmentCategory {
  for (const { cat, test } of CATEGORY_RULES) {
    if (test(ctx)) return cat;
  }
  return "other";
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

/**
 * Upload alle bijlagen van een mail naar Storage en insert in mail_attachments.
 * Returns aantal succesvol opgeslagen bijlagen.
 */
export async function storeMailAttachments(args: {
  emailId: string;
  mail: ParsedEmail;
}): Promise<{ stored: number; skipped: number }> {
  const sb = supabase();
  let stored = 0;
  let skipped = 0;

  const ctxBase = {
    fromEmail: args.mail.fromEmail ?? "",
    fromName: args.mail.fromName ?? "",
    subject: args.mail.subject ?? "",
  };

  for (const att of args.mail.attachments) {
    if (!att.content || att.content.length === 0) {
      skipped++;
      continue;
    }
    if (att.size > 20 * 1024 * 1024) {
      // Skip >20MB
      skipped++;
      continue;
    }
    // Skip afbeeldingen onder 500kB — vrijwel altijd e-mail-signatures, logos, inline graphics.
    // Echte gescande facturen zijn meestal >500kB en hebben image/jpeg of image/pdf.
    if (att.contentType.startsWith("image/") && att.size < 500 * 1024) {
      skipped++;
      continue;
    }
    // .ics calendar invites zijn nooit relevant voor archief
    if (att.contentType === "application/ics" || att.filename.endsWith(".ics")) {
      skipped++;
      continue;
    }

    const ctx: CategorizeCtx = {
      ...ctxBase,
      filename: att.filename,
      contentType: att.contentType,
      allText: [att.filename, ctxBase.fromEmail, ctxBase.fromName, ctxBase.subject].join(" "),
    };
    const category = detectCategory(ctx);
    const supplierTag = detectSupplierTag(ctx);

    const ts = (args.mail.receivedAt ?? new Date()).toISOString().slice(0, 10);
    const path = `${ts}/${args.emailId}/${safeFilename(att.filename)}`;

    const { error: upErr } = await sb.storage
      .from(BUCKET)
      .upload(path, att.content, {
        contentType: att.contentType,
        upsert: true,
      });
    if (upErr) {
      console.error("Upload fail", att.filename, upErr.message);
      skipped++;
      continue;
    }

    // Insert metadata
    await db.insert(mailAttachments).values({
      emailId: args.emailId,
      filename: att.filename,
      contentType: att.contentType,
      sizeBytes: att.size,
      storagePath: path,
      category,
      supplierTag,
      receivedAt: args.mail.receivedAt,
    });
    stored++;
  }

  return { stored, skipped };
}

/** Signed URL voor download — geldig 1 uur. */
export async function signAttachmentUrl(storagePath: string): Promise<string> {
  const sb = supabase();
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, 3600);
  if (error || !data) throw error ?? new Error("No URL");
  return data.signedUrl;
}
