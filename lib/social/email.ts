/**
 * De donderdagmail aan de eigenaar: de posts van volgende week met
 * miniaturen en captions, en één knop naar de reviewpagina. Puur (HTML-string),
 * de verzending zit in lib/social/service.ts.
 */
import { brandedEmail, escapeHtml } from "@/lib/email";

import { THEME_LABELS, isSocialTheme } from "./themes";

export interface WeekMailPost {
  plannedDate: string;
  publishTime: string;
  kind: "carousel" | "single" | "howto" | "video";
  theme: string;
  caption: string;
  thumbnails: string[];
  needsVideo: boolean;
  error: string | null;
}

const KIND_LABEL: Record<WeekMailPost["kind"], string> = {
  carousel: "Carrousel",
  single: "Foto",
  howto: "Uitleg / montage",
  video: "Video (Reel)",
};

function dayLabel(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("nl-NL", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function socialWeekEmail(args: { weekStart: string; posts: WeekMailPost[]; reviewUrl: string }) {
  const subject = `Social-posts voor de week van ${dayLabel(args.weekStart)} — wachten op akkoord`;
  const blocks = args.posts.map((p) => {
    const theme = isSocialTheme(p.theme) ? THEME_LABELS[p.theme] : p.theme === "mixed" ? "Gemengd" : p.theme;
    const thumbs = p.thumbnails
      .slice(0, 5)
      .map(
        (u) =>
          `<img src="${escapeHtml(u)}" width="96" height="120" alt="" style="width:96px;height:120px;object-fit:cover;border-radius:4px;margin:0 6px 6px 0">`,
      )
      .join("");
    const notes = [
      p.needsVideo ? `<p style="margin:6px 0;color:#B07C1F"><strong>Video nodig</strong> — koppel een mp4 op de reviewpagina.</p>` : "",
      p.error ? `<p style="margin:6px 0;color:#A83A2E">Let op: ${escapeHtml(p.error)}</p>` : "",
    ].join("");
    return `<div style="margin:14px 0;padding:14px;border:1px solid #e8dfd0;border-radius:8px">
      <p style="margin:0;color:#7a6f63;font-size:12px">${escapeHtml(dayLabel(p.plannedDate))} · ${escapeHtml(p.publishTime)} · ${escapeHtml(KIND_LABEL[p.kind])} · ${escapeHtml(theme)}</p>
      <div style="margin:10px 0 4px">${thumbs}</div>
      ${notes}
      <p style="margin:6px 0;white-space:pre-wrap;font-size:13px;line-height:1.5">${escapeHtml(p.caption)}</p>
    </div>`;
  });
  const html = brandedEmail(`
    <p><strong>Social-posts voor volgende week</strong> staan klaar als concept. Er gaat niets online voordat jij akkoord geeft.</p>
    ${blocks.join("")}
    <p style="margin-top:22px"><a href="${escapeHtml(args.reviewUrl)}" style="display:inline-block;background:#3a2a20;color:#fff;text-decoration:none;padding:12px 18px;border-radius:6px">Bekijken en akkoord geven</a></p>
  `);
  const text = [
    "Social-posts voor volgende week staan klaar als concept. Er gaat niets online voordat jij akkoord geeft.",
    ...args.posts.map(
      (p) =>
        `${dayLabel(p.plannedDate)} ${p.publishTime} · ${KIND_LABEL[p.kind]}${p.needsVideo ? " · VIDEO NODIG" : ""}\n${p.caption}`,
    ),
    `Bekijken en akkoord geven: ${args.reviewUrl}`,
  ].join("\n\n");
  return { subject, html, text };
}
