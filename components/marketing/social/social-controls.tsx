"use client";
import { useT as useUiTranslation } from "@/components/taal-provider";

/**
 * Clientonderdelen van de social-reviewpagina: per post een kaart met
 * beelden, bewerkbare caption en de knoppen Akkoord / Afwijzen / Nieuwe
 * caption; en de weekknoppen (alles akkoord, week plannen, video's ophalen).
 */
import { Check, Clapperboard, RefreshCw, RotateCcw, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  approvePostAction,
  approveWeekAction,
  attachVideoAction,
  planWeekAction,
  pollVideosAction,
  regenerateCaptionAction,
  rejectPostAction,
  reopenPostAction,
  reviseCaptionAction,
  saveCaptionAction,
} from "@/app/(app)/marketing/social/actions";
import { Badge, Button, Input, Select, Textarea, type BadgeTone } from "@/components/ui";

export interface SocialPostView {
  id: string;
  plannedDateLabel: string;
  publishTime: string;
  kind: "carousel" | "single" | "howto" | "video";
  kindLabel: string;
  themeLabel: string;
  status: "draft" | "approved" | "scheduled" | "published" | "rejected" | "failed";
  statusLabel: string;
  caption: string;
  images: { id: string; url: string | null; name: string | null }[];
  videoUrl: string | null;
  needsVideo: boolean;
  videoPending: boolean;
  videoPrompt: string | null;
  aiGenerated: boolean;
  inZernio: boolean;
  error: string | null;
}

const STATUS_TONE: Record<SocialPostView["status"], BadgeTone> = {
  draft: "neutral",
  approved: "info",
  scheduled: "success",
  published: "success",
  rejected: "danger",
  failed: "danger",
};

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<string | null>) =>
    start(async () => {
      const res = await fn();
      setError(res);
      router.refresh();
    });
  return { pending, error, run };
}

export function SocialPostCard({ post, videoOptions }: { post: SocialPostView; videoOptions: { id: string; name: string }[] }) {
  const uiT = useUiTranslation();
  const { pending, error, run } = useAction();
  const [caption, setCaption] = useState(post.caption);
  const [time, setTime] = useState(post.publishTime);
  const [instruction, setInstruction] = useState("");
  // Na "Aanpassen"/"Nieuwe caption" komt er een nieuwe caption van de server:
  // neem die over in het tekstvak (state afleiden tijdens render).
  const [serverCaption, setServerCaption] = useState(post.caption);
  if (post.caption !== serverCaption) {
    setServerCaption(post.caption);
    setCaption(post.caption);
  }
  const editable = post.status === "draft" || post.status === "failed" || post.status === "approved";
  const dirty = caption !== post.caption || time !== post.publishTime;

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{post.plannedDateLabel}</span>
        <Badge tone="accent">{post.kindLabel}</Badge>
        <Badge>{post.themeLabel}</Badge>
        <Badge tone={STATUS_TONE[post.status]}>{post.statusLabel}</Badge>
        {post.aiGenerated && <Badge tone="info">{uiT("AI-gegenereerd")}</Badge>}
        {post.inZernio && <span className="text-xs text-muted">{uiT("staat in Zernio")}</span>}
      </div>

      {post.kind === "video" ? (
        <div className="flex flex-wrap gap-3">
          {post.videoUrl ? (
            <video src={post.videoUrl} controls muted className="h-64 rounded-md bg-black" />
          ) : (
            <div className="flex h-64 w-36 flex-col items-center justify-center gap-2 rounded-md border border-dashed p-2 text-center text-xs text-muted">
              <Clapperboard className="size-6" aria-hidden />
              {post.videoPending ? uiT("Video wordt gemaakt…") : uiT("Video nodig")}
            </div>
          )}
          {post.images.map((img) => (
            <div key={img.id} className="flex flex-col gap-1">
              {img.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.url} alt={img.name ?? ""} className="h-64 w-36 rounded-md object-cover" />
              ) : null}
              <span className="text-xs text-muted">{uiT("Bronbeeld")}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {post.images.map((img, i) =>
            img.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.id}
                src={img.url}
                alt={img.name ?? `${i + 1}`}
                title={img.name ?? undefined}
                className={post.kind === "single" ? "size-48 shrink-0 rounded-md object-cover" : "h-48 w-[154px] shrink-0 rounded-md object-cover"}
              />
            ) : (
              <div key={img.id} className="h-48 w-[154px] shrink-0 rounded-md bg-background" />
            ),
          )}
        </div>
      )}

      {post.kind === "video" && editable && (post.needsVideo || post.videoUrl) && (
        <form
          className="grid gap-2 rounded-lg border bg-background/50 p-3 sm:grid-cols-[1fr_1fr_auto]"
          action={(fd) => run(() => attachVideoAction(fd))}
        >
          <input type="hidden" name="postId" value={post.id} />
          <Select name="assetId" defaultValue="" aria-label={uiT("Video uit de bibliotheek")}>
            <option value="">{uiT("Video uit de bibliotheek…")}</option>
            {videoOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
          <Input name="url" type="url" placeholder={uiT("of plak een https-link naar een mp4")} />
          <Button type="submit" variant="secondary" disabled={pending}>
            {uiT("Video koppelen")}
          </Button>
          <label className="flex items-center gap-2 text-xs text-muted sm:col-span-3">
            <input type="checkbox" name="aiGenerated" defaultChecked />
            {uiT("AI-gegenereerde video (Instagram-label)")}
          </label>
          {post.videoPrompt && (
            <p className="text-xs text-muted sm:col-span-3">
              {uiT("Prompt voor de video:")} {post.videoPrompt}
            </p>
          )}
        </form>
      )}

      <Textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={10}
        disabled={!editable || pending}
        className="font-mono text-xs leading-relaxed"
        aria-label={uiT("Caption")}
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          {uiT("Tijd")}
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!editable || pending} className="w-28" />
        </label>
        {editable && dirty && (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => saveCaptionAction(post.id, caption, time))}>
            {uiT("Opslaan")}
          </Button>
        )}
        {editable && (
          <>
            <Button size="sm" disabled={pending || dirty || post.needsVideo} onClick={() => run(() => approvePostAction(post.id))}>
              <Check className="size-4" aria-hidden />
              {uiT("Akkoord")}
            </Button>
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => regenerateCaptionAction(post.id))}>
              <Sparkles className="size-4" aria-hidden />
              {uiT("Nieuwe caption")}
            </Button>
            <Button variant="danger" size="sm" disabled={pending} onClick={() => run(() => rejectPostAction(post.id))}>
              <X className="size-4" aria-hidden />
              {uiT("Afwijzen")}
            </Button>
          </>
        )}
        {post.status === "rejected" && (
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => reopenPostAction(post.id))}>
            <RotateCcw className="size-4" aria-hidden />
            {uiT("Terug naar concept")}
          </Button>
        )}
      </div>
      {editable && dirty && <p className="text-xs text-muted">{uiT("Sla eerst op; daarna kun je akkoord geven.")}</p>}
      {editable && !dirty && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={2}
            disabled={pending}
            placeholder={uiT("Aanpassing doorgeven, bv. \"korter\" of \"noem de showroom eerder\"")}
            className="text-sm"
            aria-label={uiT("Aanpassing doorgeven")}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={pending || instruction.trim().length < 2}
            onClick={() =>
              run(async () => {
                const err = await reviseCaptionAction(post.id, instruction);
                if (!err) setInstruction("");
                return err;
              })
            }
          >
            <Sparkles className="size-4" aria-hidden />
            {uiT("Aanpassen")}
          </Button>
        </div>
      )}
      {(error ?? post.error) && <p className="text-sm text-danger">{error ?? post.error}</p>}
    </div>
  );
}

export function SocialWeekActions({
  weekStart,
  hasPosts,
  missingDays,
  hasPendingVideo,
}: {
  weekStart: string;
  hasPosts: boolean;
  /** Postdagen (labels) waarvoor nog geen post is. */
  missingDays: string[];
  hasPendingVideo: boolean;
}) {
  const uiT = useUiTranslation();
  const { pending, error, run } = useAction();
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-2">
        {hasPendingVideo && (
          <Button variant="secondary" disabled={pending} onClick={() => run(() => pollVideosAction())}>
            <RefreshCw className="size-4" aria-hidden />
            {uiT("Video's ophalen")}
          </Button>
        )}
        {hasPosts && missingDays.length > 0 && (
          <Button variant="secondary" disabled={pending} title={missingDays.join(", ")} onClick={() => run(() => planWeekAction(weekStart))}>
            <Sparkles className="size-4" aria-hidden />
            {pending
              ? uiT("Bezig…")
              : missingDays.length === 1
                ? `${uiT("Post maken voor")} ${missingDays[0]}`
                : `${uiT("Ontbrekende dagen plannen")} (${missingDays.length})`}
          </Button>
        )}
        {hasPosts ? (
          <Button disabled={pending} onClick={() => run(() => approveWeekAction(weekStart))}>
            <Check className="size-4" aria-hidden />
            {uiT("Alles akkoord")}
          </Button>
        ) : (
          <Button disabled={pending} onClick={() => run(() => planWeekAction(weekStart))}>
            <Sparkles className="size-4" aria-hidden />
            {pending ? uiT("Bezig…") : uiT("Week nu plannen")}
          </Button>
        )}
      </div>
      {error && <p className="max-w-md text-right text-sm text-danger">{error}</p>}
    </div>
  );
}
