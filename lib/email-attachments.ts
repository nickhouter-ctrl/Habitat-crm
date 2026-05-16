/**
 * Upload mail-bijlagen naar Supabase Storage + auto-categoriseer op basis van
 * afzender, bestandsnaam en mail-onderwerp.
 */
import { createClient } from "@supabase/supabase-js";

import { db } from "@/lib/db";
import { mailAttachments } from "@/lib/db/schema";
import type { ParsedAttachment, ParsedEmail } from "@/lib/gmail";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "email-attachments";

function supabase() {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase env vars missing");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export const CATEGORIES = {
  "supplier-invoice": "Factuur leverancier",
  "freight-invoice": "Vrachtfactuur",
  "customs-dua": "DUA / Douane",
  "commission": "Commissie (Teresa)",
  "bank-statement": "Bankafschrift",
  "quote-proforma": "Offerte / Proforma",
  "certificate": "Certificaat",
  "other": "Overig",
} as const;
export type AttachmentCategory = keyof typeof CATEGORIES;

const SUPPLIER_PATTERNS: Array<{ tag: string; patterns: RegExp[] }> = [
  { tag: "Allpack", patterns: [/allpack/i, /@allpack/i] },
  { tag: "Yohome", patterns: [/yohome/i, /YHES\d+/i] },
  { tag: "KKR / KingKonree", patterns: [/kingkonree/i, /@kkr/i, /KKR-?\d/i, /33#kkr/i] },
  { tag: "Magic Stone", patterns: [/magicstone/i, /magic-stone/i, /flexistone/i, /MS\d{6,}/, /MS-20\d{6}/] },
  { tag: "Arkwright (MS)", patterns: [/arkwright/i, /ARK\d+/i] },
  { tag: "Alianza", patterns: [/alianza/i, /@galadtrans/i, /galadtrans/i, /23T\/[AC]-\d/i] },
  { tag: "Teresa / España Trading", patterns: [/españa\s*trading/i, /tborras/i, /etrading\.tborras/i, /^255\d{5}$/, /^265\d{5}$/] },
  { tag: "Gomez Macias (douane)", patterns: [/gomez\s*macias/i, /\bgmcargo\b/i] },
  { tag: "Spanish Tax Agency", patterns: [/agenciatributaria/i, /agencia\s*tributaria/i] },
  { tag: "Banco Sabadell", patterns: [/sabadell/i, /bsabesbb/i] },
  { tag: "CaixaBank", patterns: [/caixabank/i, /caixesbb/i] },
];

const CATEGORY_RULES: Array<{ cat: AttachmentCategory; test: (ctx: CategorizeCtx) => boolean }> = [
  // DUA / douane
  { cat: "customs-dua", test: (c) =>
      /levante|certificado.*importaci[oó]n|d\.?u\.?a\.?|aduana|customs/i.test(c.allText) ||
      /^20260\d{10,}\.pdf$/i.test(c.filename) },
  // Vrachtfactuur
  { cat: "freight-invoice", test: (c) =>
      /alianza|galadtrans/i.test(c.fromEmail + " " + c.allText) ||
      /transportkosten|fact(uur)?.*transport|freight\s*invoice|23T\/[AC]-/i.test(c.allText) },
  // Commissie Teresa
  { cat: "commission", test: (c) =>
      /españa\s*trading|tborras|etrading\.tborras/i.test(c.fromEmail + " " + c.allText) ||
      /factura\s+(25|26)5\d{5}/i.test(c.allText) },
  // Bankafschrift
  { cat: "bank-statement", test: (c) =>
      /sabadell|caixabank|extracto.*cuenta|bank.*statement|account.*statement/i.test(c.allText) },
  // Certificaat (CE / CITES / etc.)
  { cat: "certificate", test: (c) =>
      /\bCE\s*cert|certificate|certificaat|cites|declaration\s*of\s*performance|conformity/i.test(c.allText) ||
      /欧标/.test(c.allText) },
  // Quote / Proforma
  { cat: "quote-proforma", test: (c) =>
      /proforma|quotation|offerte|pro[\s-]*forma|PI[\s-]*\d/i.test(c.allText) ||
      /revised\s*PI/i.test(c.allText) },
  // Supplier-invoice (Allpack / Yohome / KKR / Magic Stone CI)
  { cat: "supplier-invoice", test: (c) =>
      /commercial\s*invoice|invoice\s*no/i.test(c.allText) ||
      /CI[\s-]*MS\d+|33#kkr/i.test(c.allText) ||
      /YHES\d+|^MS\d{8,}/i.test(c.allText) ||
      /handling\s*costs/i.test(c.allText) },
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
  for (const { tag, patterns } of SUPPLIER_PATTERNS) {
    for (const p of patterns) {
      if (p.test(ctx.allText) || p.test(ctx.fromEmail)) return tag;
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
