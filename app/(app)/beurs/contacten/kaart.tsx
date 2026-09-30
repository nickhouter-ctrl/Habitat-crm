"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import { ExternalLink, LocateFixed, MapPin, Search } from "lucide-react";
import type { Bereik, Speld } from "@/lib/beurs-kaart";
import { rolLabel } from "@/lib/beurs";
import styles from "./kaart.module.css";

type Taal = "nl" | "en" | "es";
type Locatie = { key: string; lat: number; lon: number; plaats: string; spelden: Speld[] };
const tekst = (taal: Taal, nl: string, en: string, es: string) => taal === "es" ? es : taal === "en" ? en : nl;
const zoektekst = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Only base-map tiles leave the browser. Contact data stays in local overlays. */
export function BeursKaart({ spelden, taal = "nl", zonderLocatie = 0, zonderContacten = [] }: {
  spelden: Speld[]; bereik: Bereik; taal?: Taal; zonderLocatie?: number; zonderContacten?: { id: string | null; naam: string; bedrijf: string | null }[];
}) {
  const t = (nl: string, en: string, es: string) => tekst(taal, nl, en, es);
  const [zoek, setZoek] = useState("");
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [kaart, setKaart] = useState<Leaflet.Map | null>(null);
  const [fout, setFout] = useState(false);
  const [tegelFout, setTegelFout] = useState(false);
  const element = useRef<HTMLDivElement>(null);
  const lijst = useRef<HTMLDivElement>(null);
  const leaflet = useRef<typeof Leaflet | null>(null);
  const locaties = useMemo(() => {
    const groepen = new Map<string, Locatie>();
    const query = zoektekst(zoek.trim());
    for (const s of spelden) {
      if (query && !zoektekst([s.plaats, ...s.namen, ...s.bedrijven].join(" ")).includes(query)) continue;
      const key = `${s.lat.toFixed(6)},${s.lon.toFixed(6)}`;
      const groep = groepen.get(key);
      if (groep) groep.spelden.push(s);
      else groepen.set(key, { key, lat: s.lat, lon: s.lon, plaats: s.plaats, spelden: [s] });
    }
    return [...groepen.values()].sort((a, b) => a.plaats.localeCompare(b.plaats));
  }, [spelden, zoek]);
  const aantal = locaties.reduce((n, l) => n + l.spelden.reduce((n, s) => n + s.contacten.length, 0), 0);

  useEffect(() => {
    let weg = false;
    let map: Leaflet.Map | undefined;
    let observer: ResizeObserver | undefined;
    import("leaflet").then(L => {
      if (weg || !element.current) return;
      leaflet.current = L;
      map = L.map(element.current, { center: [40, 0], zoom: 5, scrollWheelZoom: false, fadeAnimation: false, minZoom: 2, maxZoom: 18 });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
        referrerPolicy: "strict-origin-when-cross-origin",
      }).on("tileerror", () => setTegelFout(true)).on("tileload", () => setTegelFout(false)).addTo(map);
      L.control.scale({ imperial: false }).addTo(map);
      observer = new ResizeObserver(() => map?.invalidateSize());
      observer.observe(element.current);
      setKaart(map);
    }).catch(() => { if (!weg) setFout(true); });
    return () => { weg = true; observer?.disconnect(); map?.remove(); };
  }, []);

  useEffect(() => {
    if (!kaart || !locaties.length) return;
    kaart.fitBounds(locaties.map(l => [l.lat, l.lon] as [number, number]), { padding: [45, 45], maxZoom: 11, animate: false });
  }, [kaart, locaties]);

  useEffect(() => {
    if (!kaart || !gekozen) return;
    const l = locaties.find(l => l.key === gekozen);
    if (l) kaart.setView([l.lat, l.lon], Math.max(kaart.getZoom(), l.spelden.some(s => s.contacten.some(c => c.exact)) ? 16 : 11), { animate: false });
    const rij = lijst.current?.querySelector<HTMLElement>(`[data-locatie="${gekozen}"]`);
    if (rij && lijst.current) lijst.current.scrollTo({ top: rij.offsetTop - lijst.current.offsetTop, behavior: "smooth" });
  }, [kaart, gekozen, locaties]);

  useEffect(() => {
    const L = leaflet.current;
    if (!kaart || !L) return;
    const laag = L.layerGroup().addTo(kaart);
    function teken() {
      if (!kaart || !L) return;
      laag.clearLayers();
      const clusters: { x: number; y: number; leden: Locatie[] }[] = [];
      for (const l of locaties) {
        const p = kaart.latLngToContainerPoint([l.lat, l.lon]);
        const groep = clusters.find(c => Math.hypot(c.x - p.x, c.y - p.y) < 42);
        if (groep) groep.leden.push(l);
        else clusters.push({ x: p.x, y: p.y, leden: [l] });
      }
      for (const groep of clusters) {
        const meerderePlaatsen = groep.leden.length > 1;
        const n = groep.leden.reduce((n, l) => n + l.spelden.reduce((n, s) => n + s.contacten.length, 0), 0);
        const actief = groep.leden.some(l => l.key === gekozen);
        const kleur = actief ? "#b5532b" : "#287dad";
        const bounds = L.latLngBounds(groep.leden.map(l => [l.lat, l.lon]));
        // Only numbers and fixed colours enter this SVG; names use textContent below.
        const html = meerderePlaatsen
          ? `<span style="display:grid;place-items:center;width:38px;height:38px;border:3px solid white;border-radius:50%;background:${kleur};color:white;font:700 14px sans-serif;box-shadow:0 2px 6px #0004">${n}</span>`
          : `<svg width="34" height="44" viewBox="0 0 34 44" xmlns="http://www.w3.org/2000/svg"><path d="M17 42C13 36 2 24 2 17a15 15 0 1 1 30 0c0 7-11 19-15 25Z" fill="${kleur}" stroke="white" stroke-width="2"/><circle cx="17" cy="17" r="${n > 1 ? 10 : 6}" fill="white"/>${n > 1 ? `<text x="17" y="21" text-anchor="middle" fill="${kleur}" font-size="11" font-family="sans-serif" font-weight="700">${n}</text>` : ""}</svg>`;
        const marker = L.marker(bounds.getCenter(), {
          icon: L.divIcon({ html, className: styles.pin, iconSize: meerderePlaatsen ? [38, 38] : [34, 44], iconAnchor: meerderePlaatsen ? [19, 19] : [17, 42], popupAnchor: [0, -38] }),
          title: `${groep.leden.map(l => l.plaats).join(" / ")} (${n})`,
          alt: `${groep.leden.map(l => l.plaats).join(" / ")} (${n})`,
          riseOnHover: true, zIndexOffset: actief ? 1000 : 0,
        }).addTo(laag);
        if (meerderePlaatsen) marker.on("click", () => kaart.fitBounds(bounds, { padding: [60, 60], maxZoom: 18 }));
        else {
          const l = groep.leden[0];
          const inhoud = document.createElement("div");
          const titel = document.createElement("strong"); titel.textContent = l.plaats; inhoud.append(titel);
          for (const s of l.spelden) for (const c of s.contacten) {
            const p = document.createElement("p"); p.style.margin = "8px 0 0"; p.textContent = [c.bedrijf, c.naam, c.adres].filter(Boolean).join(" · "); inhoud.append(p);
          }
          marker.bindPopup(inhoud, { autoPan: false, maxWidth: 280 });
          marker.on("click", () => setGekozen(l.key));
          if (actief) marker.openPopup();
        }
      }
    }
    teken();
    kaart.on("moveend zoomend", teken);
    return () => { kaart.off("moveend zoomend", teken); laag.remove(); };
  }, [kaart, locaties, gekozen]);

  function overzicht() {
    setGekozen(null);
    if (kaart && locaties.length) kaart.fitBounds(locaties.map(l => [l.lat, l.lon] as [number, number]), { padding: [45, 45], maxZoom: 11 });
  }

  return <div className={`${styles.kaart} overflow-hidden rounded-xl border bg-surface`}>
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div className="flex items-center gap-2 text-sm"><MapPin className="size-4 text-muted" /><strong>{aantal} / {spelden.reduce((n, s) => n + s.contacten.length, 0) + zonderLocatie}</strong> {t("contacten op de kaart", "contacts on the map", "contactos en el mapa")}</div>
      <button type="button" onClick={overzicht} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-background"><LocateFixed className="size-4" />{t("Alle locaties", "All locations", "Todas las ubicaciones")}</button>
    </div>
    <div className="grid md:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
      <aside className="order-2 min-w-0 border-t md:order-1 md:border-r md:border-t-0" aria-label={t("Bedrijven op de kaart", "Companies on the map", "Empresas en el mapa")}>
        <div className="border-b p-3"><label className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2"><Search className="size-4 shrink-0 text-muted" /><input value={zoek} onChange={e => { setZoek(e.target.value); setGekozen(null); }} className="min-w-0 w-full bg-transparent text-sm outline-none" aria-label={t("Zoek bedrijf, contact of plaats", "Search company, contact or city", "Buscar empresa, contacto o localidad")} placeholder={t("Bedrijf, naam of plaats…", "Company, name or city…", "Empresa, nombre o localidad…")} /></label></div>
        <div ref={lijst} className="relative max-h-80 overflow-y-auto overscroll-contain md:h-[530px] md:max-h-none">
          {!locaties.length && <p className="p-5 text-sm text-muted">{t("Geen locaties gevonden.", "No locations found.", "No se han encontrado ubicaciones.")}</p>}
          {locaties.map(l => <section key={l.key} data-locatie={l.key} className={`border-b last:border-b-0 ${gekozen === l.key ? "bg-[#b5532b]/[0.07]" : ""}`}>
            <h3 className="px-4 pt-4 text-xs font-medium uppercase tracking-wide text-muted">{l.plaats}</h3>
            {l.spelden.flatMap(s => s.contacten.map((c, i) => <div key={`${c.id ?? c.naam}-${s.rol}-${i}`} className="px-4 pb-4 pt-2">
              <button type="button" onClick={() => setGekozen(l.key)} aria-pressed={gekozen === l.key} className="block w-full rounded text-left hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2">
                <span className="block text-base font-semibold leading-snug">{c.bedrijf || c.naam}</span>
                {c.bedrijf && <span className="mt-1 block text-sm text-muted">{c.naam}</span>}
              </button>
              {c.adres && <p className="mt-1 text-sm text-muted">{c.adres}</p>}
              <p className="mt-1 text-xs text-muted">{c.exact ? t("Adreslocatie", "Address location", "Ubicación de la dirección") : c.adres ? t("Adres bekend · pin bij benadering", "Address known · approximate pin", "Dirección conocida · ubicación aproximada") : t("Plaats / regio bij benadering", "Approximate city / region", "Localidad / región aproximada")}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><span className="size-2 rounded-full" style={{ background: s.kleur }} />{rolLabel(s.rol, taal)}</p>
              {c.id && <a href={`/contacts/${encodeURIComponent(c.id)}`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">{t("Contact bekijken", "View contact", "Ver contacto")}<ExternalLink className="size-3" /></a>}
            </div>))}
          </section>)}
        </div>
      </aside>
      <div className="relative order-1 min-w-0 md:order-2">
        <div ref={element} className="z-0 h-[380px] w-full bg-[#e9f0f1] md:h-[600px]" aria-label={t("Interactieve kaart met beurscontacten", "Interactive trade fair contact map", "Mapa interactivo de contactos de la feria")} />
        {!kaart && !fout && <div className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-muted">{t("Kaart laden…", "Loading map…", "Cargando mapa…")}</div>}
        {(fout || tegelFout) && <div role="status" className="absolute bottom-8 left-3 right-3 rounded-lg border bg-surface p-3 text-sm shadow">{t("De kaartachtergrond kon niet laden. De contacten blijven beschikbaar in de lijst.", "The base map could not load. Contacts remain available in the list.", "No se ha podido cargar el mapa. Los contactos siguen disponibles en la lista.")}</div>}
      </div>
    </div>
    {zonderContacten.length > 0 && <details className="border-t px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">{zonderContacten.length} {t("contacten zonder kaartlocatie", "contacts without a map location", "contactos sin ubicación en el mapa")}</summary>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">{zonderContacten.map((c, i) => <li key={c.id ?? i}>{c.id ? <a className="text-accent hover:underline" href={`/contacts/${encodeURIComponent(c.id)}`}>{c.bedrijf ? `${c.bedrijf} · ${c.naam}` : c.naam}</a> : c.naam}</li>)}</ul>
    </details>}
    <p className="border-t px-4 py-3 text-xs leading-relaxed text-muted">{t("Bij ieder contact staat of de pin op een bevestigd adres of bij benadering op een plaats/regio staat. Een getal groepeert contacten; klik om in te zoomen. Selecteer een bedrijf om het op de kaart te zien.", "Each contact indicates whether its pin is at a confirmed address or an approximate city/region. Numbers group contacts; click to zoom in. Select a company to locate it on the map.", "Cada contacto indica si su ubicación corresponde a una dirección confirmada o a una localidad/región aproximada. Los números agrupan contactos; pulsa para acercar. Selecciona una empresa para verla en el mapa.")}{zonderLocatie > 0 && <span className="ml-1 font-medium">{zonderLocatie} {t("contacten hebben nog geen kaartlocatie.", "contacts have no map location yet.", "contactos aún no tienen ubicación en el mapa.")}</span>}</p>
  </div>;
}
