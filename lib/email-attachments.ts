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
  { tag: "Gomez Macias (douane-agent)", weak: [/gomez\s*macias/i, /\bgmcargo\b/i] },
  { tag: "Spanish Tax Agency", weak: [/agenciatributaria/i, /agencia\s*tributaria/i] },
  { tag: "Banco Sabadell", weak: [/sabadell/i, /bsabesbb/i] },
  { tag: "CaixaBank", weak: [/caixabank/i, /caixesbb/i] },
];

const CATEGORY_RULES: Array<{ cat: AttachmentCategory; test: (ctx: CategorizeCtx) => boolean }> = [
  // DUA / douane (eerst, want vaak combineerbaar met andere)
  { cat: "customs-dua", test: (c) =>
      /levante|certificado.*importaci[oó]n|d\.?u\.?a\.?|aduana|customs|comunidad\s*europea/i.test(c.allText) ||
      /^20260\d{10,}\.pdf$/i.test(c.filename) },

  // Teresa commissie (Spanje) — eerst, want vaak verkleurd onder andere
  { cat: "agent-fee-spain", test: (c) =>
      /españa\s*trading|tborras|etrading\.tborras/i.test(c.fromEmail + " " + c.allText) ||
      /^Factura\s+(25|26)5\d{5}/i.test(c.filename) },

  // Allpack handling-fee (China) — handling costs CI
  { cat: "agent-fee-china", test: (c) =>
      /handling\s*costs?|handling[-\s]*fee/i.test(c.allText) &&
      /allpack/i.test(c.fromEmail + " " + c.allText) },

  // Vrachtfactuur — Alianza/Galadtrans
  { cat: "freight-invoice", test: (c) =>
      /alianza|galadtrans/i.test(c.fromEmail) ||
      /^23T[\/_-][AC][_-]?\d/i.test(c.filename) ||
      /transportkosten|fact(uur)?.*transport|freight\s*invoice/i.test(c.allText) },

  // Bankafschrift
  { cat: "bank-statement", test: (c) =>
      /sabadell|caixabank|bbva|santander/i.test(c.fromEmail) ||
      /extracto.*cuenta|bank.*statement|account.*statement|posición\s+global/i.test(c.allText) },

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
       /CI[-\s]*MS\d+/i.test(c.filename)) &&
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
