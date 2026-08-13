/**
 * Unit tests voor de website-crawl (U9): pure HTML-extractie van media
 * (afbeeldingen, video's, YouTube/Vimeo-embeds), linkontdekking en de
 * sectie-/omgevingstags. Netwerk komt er hier niet aan te pas.
 */
import { describe, expect, it } from "vitest";

import {
  embedRefFromUrl,
  extractLinks,
  extractMediaFromHtml,
  inferEnvironmentTag,
  sectionTagsForPage,
} from "../website-crawl";

const BASE = "https://habitat-one.com";

describe("extractMediaFromHtml", () => {
  it("vindt afbeeldingen (src én srcset) als absolute URL's", () => {
    const html = `
      <img src="/images/projects/montgo-1.jpg" alt="badkamer">
      <img srcset="/img/a-480.webp 480w, /img/a-1080.webp 1080w" alt="">
      <img src="https://cdn.habitat-one.com/b.png">`;
    const media = extractMediaFromHtml(html, BASE);
    expect(media.images).toEqual([
      `${BASE}/images/projects/montgo-1.jpg`,
      `${BASE}/img/a-1080.webp`, // grootste srcset-kandidaat
      "https://cdn.habitat-one.com/b.png",
    ]);
  });

  it("slaat logo's, iconen, svg en data-URI's over", () => {
    const html = `
      <img src="/brand/logo.svg"><img src="/favicon.ico">
      <img src="data:image/png;base64,xx"><img src="/img/icon-arrow.png">`;
    expect(extractMediaFromHtml(html, BASE).images).toEqual([]);
  });

  it("vindt video's uit <video src> en <source>", () => {
    const html = `
      <video src="/media/tour.mp4"></video>
      <video poster="/media/p.jpg"><source src="/media/before-after.webm" type="video/webm"></video>`;
    expect(extractMediaFromHtml(html, BASE).videos).toEqual([
      `${BASE}/media/tour.mp4`,
      `${BASE}/media/before-after.webm`,
    ]);
  });

  it("vindt YouTube- en Vimeo-embeds met provider en id", () => {
    const html = `
      <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0"></iframe>
      <iframe src="https://player.vimeo.com/video/76979871"></iframe>`;
    expect(extractMediaFromHtml(html, BASE).embeds).toEqual([
      { provider: "youtube", id: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      { provider: "vimeo", id: "76979871", url: "https://vimeo.com/76979871" },
    ]);
  });

  it("decodeert HTML-entities in URL's (&amp; uit servergerenderde HTML)", () => {
    const html = `<img src="/_next/image?url=%2Fprojects%2Fwip%2F93.jpg&amp;w=3840&amp;q=75">`;
    expect(extractMediaFromHtml(html, BASE).images).toEqual([
      `${BASE}/projects/wip/93.jpg`,
    ]);
  });

  it("pakt bij _next/image-URL's het originele pad uit de url=-parameter", () => {
    const html = `
      <img src="/_next/image?url=%2Fimg%2Fhero.webp&w=1920&q=80">
      <img src="https://habitat-one.com/_next/image?url=https%3A%2F%2Fcdn.habitat-one.com%2Fx.jpg&w=640">`;
    expect(extractMediaFromHtml(html, BASE).images).toEqual([
      `${BASE}/img/hero.webp`,
      "https://cdn.habitat-one.com/x.jpg",
    ]);
  });

  it("ontdubbelt ook wanneer optimizer- en origineel-URL naar hetzelfde beeld wijzen", () => {
    const html = `
      <img src="/_next/image?url=%2Fa.jpg&w=640">
      <img src="/_next/image?url=%2Fa.jpg&amp;w=3840">
      <img src="/a.jpg">`;
    expect(extractMediaFromHtml(html, BASE).images).toEqual([`${BASE}/a.jpg`]);
  });

  it("ontdubbelt binnen één pagina", () => {
    const html = `<img src="/a.jpg"><img src="/a.jpg"><video src="/v.mp4"></video><video src="/v.mp4"></video>`;
    const media = extractMediaFromHtml(html, BASE);
    expect(media.images).toHaveLength(1);
    expect(media.videos).toHaveLength(1);
  });
});

describe("embedRefFromUrl", () => {
  it("herkent youtube-varianten", () => {
    expect(embedRefFromUrl("https://www.youtube.com/embed/abc123XYZ_-")).toEqual({
      provider: "youtube",
      id: "abc123XYZ_-",
      url: "https://www.youtube.com/watch?v=abc123XYZ_-",
    });
    expect(embedRefFromUrl("https://www.youtube-nocookie.com/embed/abc123XYZ_-")?.id).toBe(
      "abc123XYZ_-",
    );
  });

  it("geeft null op niet-embed-URL's", () => {
    expect(embedRefFromUrl("https://example.com/video.mp4")).toBeNull();
  });
});

describe("extractLinks", () => {
  it("vindt interne links onder een prefix, ontdubbeld en absoluut", () => {
    const html = `
      <a href="/projects/montgo">Montgo</a>
      <a href="/projects/montgo">nogmaals</a>
      <a href="${BASE}/projects/altea-hills/">Altea</a>
      <a href="/inspiration/tips">tips</a>
      <a href="/contact">contact</a>`;
    expect(extractLinks(html, BASE, "/projects/")).toEqual([
      `${BASE}/projects/montgo`,
      `${BASE}/projects/altea-hills`,
    ]);
  });
});

describe("sectionTagsForPage", () => {
  it("tagt projectpagina's met project + slug", () => {
    expect(sectionTagsForPage(`${BASE}/projects/montgo`)).toEqual(["project", "montgo"]);
  });

  it("tagt inspiratiepagina's met inspiratie + subsectie", () => {
    expect(sectionTagsForPage(`${BASE}/inspiration/tips/kleine-badkamer`)).toEqual([
      "inspiratie",
      "tips",
    ]);
  });
});

describe("inferEnvironmentTag", () => {
  it("leidt exterieur af uit buiten-context", () => {
    expect(inferEnvironmentTag("pool terrace garden view")).toBe("exterieur");
    expect(inferEnvironmentTag("gevel en terras vernieuwd")).toBe("exterieur");
  });

  it("leidt interieur af uit binnen-context", () => {
    expect(inferEnvironmentTag("nieuwe badkamer met walk-in shower")).toBe("interieur");
    expect(inferEnvironmentTag("kitchen wall panels")).toBe("interieur");
  });

  it("geeft null als het niet afleidbaar is", () => {
    expect(inferEnvironmentTag("project opgeleverd in 2026")).toBeNull();
  });
});
