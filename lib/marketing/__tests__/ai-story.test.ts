import { describe, expect, it } from "vitest";

import { parseCarouselStory } from "../ai-story";

const LIMITS = { eyebrow: 29, headline: 36, subline: 63, cta: 24, badge: 16 };

const validPayload = {
  order: [2, 0, 1],
  cards: [
    { headline: "Kaart een", subline: "Sub een" },
    { headline: "Kaart twee", subline: "Sub twee" },
    { headline: "Kaart drie" },
  ],
  message: "Het verhaal boven de carrousel.",
  name: "Testcarrousel",
};

describe("parseCarouselStory", () => {
  it("parseert een geldig antwoord, ook met markdown-fences", () => {
    const story = parseCarouselStory(
      "```json\n" + JSON.stringify(validPayload) + "\n```",
      3,
      LIMITS,
    );
    expect(story).not.toBeNull();
    expect(story!.order).toEqual([2, 0, 1]);
    expect(story!.cards).toHaveLength(3);
    expect(story!.cards[2].subline).toBeUndefined();
    expect(story!.message).toBe("Het verhaal boven de carrousel.");
    expect(story!.name).toBe("Testcarrousel");
  });

  it("valt terug op de aangeleverde volgorde als de permutatie niet klopt", () => {
    for (const order of [[0, 0, 1], [0, 1], [3, 1, 0], undefined]) {
      const story = parseCarouselStory(
        JSON.stringify({ ...validPayload, order }),
        3,
        LIMITS,
      );
      expect(story!.order).toEqual([0, 1, 2]);
    }
  });

  it("kapt koppen en subregels af op de sjabloonlimieten (op woordgrens)", () => {
    const story = parseCarouselStory(
      JSON.stringify({
        ...validPayload,
        cards: [
          { headline: "Een veel te lange kop die ver over de limiet heen gaat" },
          { headline: "Kort", subline: "s".repeat(200) },
          { headline: "Ook kort" },
        ],
      }),
      3,
      LIMITS,
    );
    expect(story!.cards[0].headline.length).toBeLessThanOrEqual(LIMITS.headline);
    expect(story!.cards[0].headline.endsWith(" ")).toBe(false);
    expect(story!.cards[1].subline!.length).toBeLessThanOrEqual(LIMITS.subline);
  });

  it("weigert onbruikbare antwoorden", () => {
    // geen JSON
    expect(parseCarouselStory("sorry, geen idee", 3, LIMITS)).toBeNull();
    // verkeerd aantal kaarten
    expect(parseCarouselStory(JSON.stringify(validPayload), 5, LIMITS)).toBeNull();
    // kaart zonder kop
    expect(
      parseCarouselStory(
        JSON.stringify({
          ...validPayload,
          cards: [{ headline: "" }, { headline: "b" }, { headline: "c" }],
        }),
        3,
        LIMITS,
      ),
    ).toBeNull();
    // zonder message geen verhaal
    expect(
      parseCarouselStory(JSON.stringify({ ...validPayload, message: "" }), 3, LIMITS),
    ).toBeNull();
  });

  it("geeft een standaardnaam als het model er geen bedenkt", () => {
    const story = parseCarouselStory(
      JSON.stringify({ ...validPayload, name: undefined }),
      3,
      LIMITS,
    );
    expect(story!.name).toBe("Carrousel");
  });
});
