"use client";

import { useState } from "react";

/**
 * Nagebouwde Instagram-advertentie (eigen opmaak, echte beelden/tekst van de
 * post): Meta's eigen preview-iframe blijft leeg buiten facebook.com omdat
 * de browser de inlogcookies daar blokkeert.
 */
const CTA: Record<string, string> = {
  LEARN_MORE: "Meer informatie",
  BOOK_TRAVEL: "Nu boeken",
  CONTACT_US: "Contact opnemen",
  SHOP_NOW: "Nu shoppen",
  SIGN_UP: "Aanmelden",
  WHATSAPP_MESSAGE: "WhatsApp",
  MESSAGE_PAGE: "Bericht sturen",
};

export function AdPreview({
  images,
  caption,
  likes,
  comments,
  cta,
  logo = "https://www.habitat-one.com/logo-habitat.png",
  handle = "habitatonejavea",
}: {
  images: string[];
  caption: string;
  likes: number;
  comments: number;
  cta: string | null;
  logo?: string;
  handle?: string;
}) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const n = images.length;
  const text = caption.split("\n—")[0].trim();

  return (
    <div className="overflow-hidden rounded-xl border bg-white text-[13px] text-neutral-900 shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- extern logo */}
        <img src={logo} alt="" className="size-8 rounded-full border bg-white object-contain p-0.5" />
        <div className="leading-tight">
          <p className="font-semibold">{handle}</p>
          <p className="text-[11px] text-neutral-500">Gesponsord</p>
        </div>
        <span className="ml-auto text-neutral-500">•••</span>
      </div>

      <div className="relative aspect-square bg-neutral-100">
        {n > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element -- Instagram-CDN
          <img src={images[i]} alt="" className="h-full w-full object-cover" />
        ) : null}
        {n > 1 && (
          <>
            <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
              {i + 1}/{n}
            </span>
            {i > 0 && (
              <button
                type="button"
                onClick={() => setI(i - 1)}
                className="absolute left-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow"
                aria-label="Vorige"
              >
                ‹
              </button>
            )}
            {i < n - 1 && (
              <button
                type="button"
                onClick={() => setI(i + 1)}
                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 shadow"
                aria-label="Volgende"
              >
                ›
              </button>
            )}
          </>
        )}
      </div>

      {cta && (
        <div className="flex items-center justify-between border-b bg-neutral-50 px-3 py-2 font-semibold">
          <span>{CTA[cta] ?? "Meer informatie"}</span>
          <span>›</span>
        </div>
      )}

      <div className="space-y-1 px-3 py-2">
        <div className="flex items-center gap-3 text-lg">
          <span>♡</span>
          <span>💬</span>
          <span>➤</span>
          {n > 1 && (
            <span className="mx-auto flex gap-1">
              {images.map((_, k) => (
                <span key={k} className={`size-1.5 rounded-full ${k === i ? "bg-sky-500" : "bg-neutral-300"}`} />
              ))}
            </span>
          )}
        </div>
        <p className="font-semibold">
          {likes.toLocaleString("nl-NL")} vind-ik-leuks · {comments.toLocaleString("nl-NL")} reacties
        </p>
        {text && (
          <p className={open ? "whitespace-pre-line" : "line-clamp-2"}>
            <span className="font-semibold">{handle}</span> {text}
          </p>
        )}
        {text.length > 120 && (
          <button type="button" onClick={() => setOpen(!open)} className="text-neutral-500">
            {open ? "minder" : "meer"}
          </button>
        )}
      </div>
    </div>
  );
}
