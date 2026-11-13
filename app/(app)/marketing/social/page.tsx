import { datumTaal, tekst as uiTranslation } from "@/lib/i18n/server";
/**
 * Social-media weekplanning: de posts die de donderdagcron klaarzette (of die
 * je hier zelf laat plannen), per week. Niets gaat online zonder akkoord: pas
 * "Akkoord" plant de post in bij Zernio op de geplande dag en tijd.
 */
import { ChevronLeft, ChevronRight } from "lucide-react";

import { EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { SocialPostCard, SocialWeekActions, type SocialPostView } from "@/components/marketing/social/social-controls";
import { requireModuleRead } from "@/lib/auth/guards";
import { aiCaptionConfigured } from "@/lib/social/caption";
import { socialConfig } from "@/lib/social/config";
import { higgsfieldConfigured } from "@/lib/social/higgsfield";
import { isoWeekday, nextWeekStart, shiftDate, weekStartOf } from "@/lib/social/planner";
import { assetPreviews, needsVideo, recentVideoAssets, weekPosts } from "@/lib/social/service";
import { THEME_LABELS, isSocialTheme } from "@/lib/social/themes";
import { zernioConfigured } from "@/lib/social/zernio";

export async function generateMetadata() {
  const uiT = await uiTranslation();
  return { title: uiT("Social media") };
}

const KIND_LABELS = { carousel: "Carrousel", single: "Foto", howto: "Uitleg / montage", video: "Video (Reel)" } as const;
const STATUS_LABELS = {
  draft: "Concept",
  approved: "Akkoord",
  scheduled: "Ingepland",
  published: "Gepubliceerd",
  rejected: "Afgewezen",
  failed: "Mislukt",
} as const;

export default async function SocialPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireModuleRead("advertenties");
  const uiT = await uiTranslation();
  const uiDateLocale = await datumTaal();
  const params = await searchParams;
  const raw = typeof params.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.week) ? params.week : null;
  const weekStart = raw ? (isoWeekday(raw) === 1 ? raw : weekStartOf(raw)) : nextWeekStart(new Date());

  const [posts, videos] = await Promise.all([weekPosts(weekStart), recentVideoAssets()]);
  const previews = await assetPreviews(posts.flatMap((p) => [...p.assetIds, ...(p.videoSourceAssetId ? [p.videoSourceAssetId] : [])]));
  const videoPreview = await assetPreviews(posts.map((p) => p.videoAssetId).filter((v): v is string => Boolean(v)));

  const dayLabel = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(uiDateLocale, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });

  const views: SocialPostView[] = posts.map((p) => {
    const imageIds = p.kind === "video" ? (p.videoSourceAssetId ? [p.videoSourceAssetId] : []) : p.assetIds;
    return {
      id: p.id,
      plannedDateLabel: dayLabel(p.plannedDate),
      publishTime: p.publishTime,
      kind: p.kind,
      kindLabel: uiT(KIND_LABELS[p.kind]),
      themeLabel: uiT(isSocialTheme(p.theme) ? THEME_LABELS[p.theme] : p.theme === "mixed" ? "Gemengd" : p.theme),
      status: p.status,
      statusLabel: uiT(STATUS_LABELS[p.status]),
      caption: p.caption,
      // Posts die buiten de planner om zijn gemaakt (direct in Zernio) hebben
      // geen bibliotheekbeelden: toon dan de al voorbereide Zernio-media.
      images: imageIds.length
        ? imageIds.map((id) => ({ id, url: previews.get(id)?.url ?? null, name: previews.get(id)?.name ?? null }))
        : p.kind === "video"
          ? []
          : (p.zernioMediaUrls ?? []).map((url, i) => ({ id: `${p.id}-${i}`, url, name: null })),
      videoUrl:
        p.videoUrl ??
        (p.videoAssetId ? (videoPreview.get(p.videoAssetId)?.url ?? null) : null) ??
        (p.kind === "video" ? (p.zernioMediaUrls?.[0] ?? null) : null),
      needsVideo: needsVideo(p),
      videoPending: Boolean(p.videoJob),
      videoPrompt: p.videoPrompt,
      aiGenerated: p.aiGenerated,
      inZernio: Boolean(p.zernioPostId),
      error: p.error,
    };
  });

  const config = socialConfig();
  const notices = [
    !zernioConfigured() && uiT("Zernio is niet ingesteld (ZERNIO_API_KEY en account-id's): posts worden alleen hier bewaard, niet ingepland."),
    !higgsfieldConfigured() && uiT("Higgsfield is niet ingesteld: koppel de weekvideo hieronder zelf (mp4 uit de beeldbibliotheek of een https-link)."),
    !aiCaptionConfigured() && uiT("Geen ANTHROPIC_API_KEY: captions komen uit vaste sjablonen."),
  ].filter(Boolean) as string[];

  return (
    <div>
      <PageHeader
        title={uiT("Social media")}
        subtitle={uiT("Elke donderdag worden de posts voor de week erna klaargezet en krijg je een mail. Niets gaat online zonder jouw akkoord.")}
        actions={
          <SocialWeekActions weekStart={weekStart} hasPosts={posts.length > 0} hasPendingVideo={posts.some((p) => p.videoJob)} />
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <LinkButton variant="ghost" size="sm" href={`/marketing/social?week=${shiftDate(weekStart, -7)}`} aria-label={uiT("Vorige week")}>
          <ChevronLeft className="size-4" aria-hidden />
        </LinkButton>
        <span className="font-medium">
          {uiT("Week van {datum}", { datum: dayLabel(weekStart) })}
        </span>
        <LinkButton variant="ghost" size="sm" href={`/marketing/social?week=${shiftDate(weekStart, 7)}`} aria-label={uiT("Volgende week")}>
          <ChevronRight className="size-4" aria-hidden />
        </LinkButton>
        <span className="text-xs text-muted">
          {uiT("Postdagen en tijd: {dagen} om {tijd} (SOCIAL_POST_WEEKDAYS / SOCIAL_PUBLISH_TIME)", {
            dagen: config.weekdays.map((d) => dayLabel(shiftDate(weekStart, d - 1)).split(" ")[0]).join(", "),
            tijd: config.publishTime,
          })}
        </span>
      </div>

      {notices.length > 0 && (
        <ul className="mb-5 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-warning">
          {notices.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      {views.length === 0 ? (
        <EmptyState
          title={uiT("Nog geen posts voor deze week")}
          description={uiT("De donderdagcron plant de week automatisch. Je kunt hem ook nu laten plannen met de knop rechtsboven.")}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {views.map((v) => (
            <SocialPostCard
              key={`${v.id}:${v.caption}:${v.publishTime}:${v.status}`}
              post={v}
              videoOptions={videos.map((x) => ({ id: x.id, name: x.name ?? x.id.slice(0, 8) }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
