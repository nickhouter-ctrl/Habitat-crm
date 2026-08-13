/**
 * Unit tests voor de pure rekenlogica van de Meta-koppeling (brief §7):
 * geldconversie zonder floats, X-Business-Use-Case-Usage-throttling,
 * exponentiële backoff bij foutcode 17, NL-foutvertaling en de
 * lifetime-budget-validatie voor dagdelen.
 */
import { describe, expect, it } from "vitest";

import {
  MetaError,
  backoffDelayMs,
  eurToCents,
  metaErrorMessage,
  parseBucUsage,
  throttleDelayMs,
  withMetaRetry,
} from "../client";
import { buildObjectStorySpec, validateAdSetScheduling } from "../publish";

/* ------------------------------------------------------------- eurToCents */

describe("eurToCents", () => {
  it("converteert db-numeric-strings (punt-decimaal) exact naar centen", () => {
    expect(eurToCents("19.90")).toBe(1990);
    expect(eurToCents("1234.56")).toBe(123456);
    expect(eurToCents("0.1")).toBe(10);
    expect(eurToCents("0.01")).toBe(1);
  });

  it("vult hele euro's aan tot centen", () => {
    expect(eurToCents("1234")).toBe(123400);
    expect(eurToCents("0")).toBe(0);
  });

  it("kent geen float-artefacten (stringrekenen, geen * 100)", () => {
    // 19.90 * 100 === 1989.9999999999998 — de klassieke float-valkuil.
    expect(eurToCents("19.90")).toBe(1990);
    expect(eurToCents("0.29")).toBe(29);
    expect(eurToCents("1.13")).toBe(113);
  });

  it("weigert negatieve bedragen, meer dan 2 decimalen en rommel", () => {
    expect(() => eurToCents("-1.00")).toThrow();
    expect(() => eurToCents("1.234")).toThrow();
    expect(() => eurToCents("abc")).toThrow();
    expect(() => eurToCents("")).toThrow();
  });
});

/* ---------------------------------------------------------- parseBucUsage */

describe("parseBucUsage", () => {
  it("geeft 0% bij ontbrekende header", () => {
    expect(parseBucUsage(null).pct).toBe(0);
  });

  it("pakt de hoogste benutting over alle metrics en accounts", () => {
    const header = JSON.stringify({
      "123456": [
        { type: "ads_management", call_count: 30, total_cputime: 12, total_time: 85 },
      ],
      "654321": [{ type: "ads_insights", call_count: 40, total_cputime: 5, total_time: 10 }],
    });
    expect(parseBucUsage(header).pct).toBe(85);
  });

  it("neemt estimated_time_to_regain_access (minuten) mee als aanwezig", () => {
    const header = JSON.stringify({
      "123": [{ type: "ads_management", call_count: 100, estimated_time_to_regain_access: 3 }],
    });
    const usage = parseBucUsage(header);
    expect(usage.pct).toBe(100);
    expect(usage.regainMinutes).toBe(3);
  });

  it("is robuust tegen kapotte JSON", () => {
    expect(parseBucUsage("{niet-json").pct).toBe(0);
  });
});

/* ------------------------------------------------- throttle & backoff */

describe("throttleDelayMs", () => {
  it("remt niet onder de 80%", () => {
    expect(throttleDelayMs(0)).toBe(0);
    expect(throttleDelayMs(79)).toBe(0);
    expect(throttleDelayMs(80)).toBe(0);
  });

  it("schaalt boven de 80% op naar maximaal 60 s bij 100%", () => {
    expect(throttleDelayMs(90)).toBe(30000);
    expect(throttleDelayMs(100)).toBe(60000);
    expect(throttleDelayMs(150)).toBe(60000); // cap
  });
});

describe("backoffDelayMs", () => {
  it("verdubbelt per poging: 1s, 2s, 4s, 8s", () => {
    expect(backoffDelayMs(0)).toBe(1000);
    expect(backoffDelayMs(1)).toBe(2000);
    expect(backoffDelayMs(2)).toBe(4000);
    expect(backoffDelayMs(3)).toBe(8000);
  });
});

describe("withMetaRetry", () => {
  it("probeert opnieuw bij foutcode 17 met oplopende wachttijd", async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await withMetaRetry(
      async () => {
        calls++;
        if (calls < 3) throw new MetaError(400, {}, "rate", 17);
        return "ok";
      },
      { sleep: async (ms) => void delays.push(ms) },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
    expect(delays).toEqual([1000, 2000]);
  });

  it("geeft andere Meta-fouten direct door (geen retry)", async () => {
    let calls = 0;
    await expect(
      withMetaRetry(
        async () => {
          calls++;
          throw new MetaError(400, {}, "invalid", 100);
        },
        { sleep: async () => {} },
      ),
    ).rejects.toThrow("invalid");
    expect(calls).toBe(1);
  });

  it("geeft na het maximum aantal pogingen de laatste fout door", async () => {
    let calls = 0;
    await expect(
      withMetaRetry(
        async () => {
          calls++;
          throw new MetaError(400, {}, "rate", 17);
        },
        { attempts: 3, sleep: async () => {} },
      ),
    ).rejects.toBeInstanceOf(MetaError);
    expect(calls).toBe(3);
  });
});

/* ------------------------------------------------------ metaErrorMessage */

describe("metaErrorMessage", () => {
  it("verkiest Meta's eigen gebruikersboodschap als die er is", () => {
    const err = new MetaError(400, {}, "x", 100, undefined, "Deze link is niet toegestaan.");
    expect(metaErrorMessage(err)).toContain("Deze link is niet toegestaan.");
  });

  it("vertaalt bekende codes naar een NL-uitleg met vervolgactie", () => {
    expect(metaErrorMessage(new MetaError(400, {}, "x", 17))).toMatch(/limiet|later/i);
    expect(metaErrorMessage(new MetaError(401, {}, "x", 190))).toMatch(/token/i);
  });

  it("valt nooit terug op alleen een kale code", () => {
    const msg = metaErrorMessage(new MetaError(400, {}, "Unsupported request", 3));
    expect(msg.length).toBeGreaterThan(10);
    expect(msg).not.toBe("3");
  });

  it("kan ook met niet-MetaError-waarden overweg", () => {
    expect(metaErrorMessage(new Error("netwerk weg"))).toContain("netwerk weg");
  });
});

/* --------------------------------------------- validateAdSetScheduling */

describe("validateAdSetScheduling", () => {
  const start = new Date("2026-09-01T08:00:00+02:00");
  const end = new Date("2026-09-15T20:00:00+02:00");

  it("keurt dagdelen zonder lifetime-budget af (Meta-eis, anders cryptische fout)", () => {
    const errors = validateAdSetScheduling({
      startTime: start,
      endTime: end,
      dayparting: [{ days: [1, 2, 3], start_minute: 480, end_minute: 1200 }],
      lifetimeBudgetEur: null,
      dailyBudgetEur: "25.00",
    });
    expect(errors.some((e) => /lifetime|looptijdbudget/i.test(e))).toBe(true);
  });

  it("accepteert dagdelen mét lifetime-budget en einddatum", () => {
    expect(
      validateAdSetScheduling({
        startTime: start,
        endTime: end,
        dayparting: [{ days: [1, 2, 3], start_minute: 480, end_minute: 1200 }],
        lifetimeBudgetEur: "350.00",
        dailyBudgetEur: null,
      }),
    ).toEqual([]);
  });

  it("eist een einddatum bij een lifetime-budget", () => {
    const errors = validateAdSetScheduling({
      startTime: start,
      endTime: null,
      dayparting: null,
      lifetimeBudgetEur: "350.00",
      dailyBudgetEur: null,
    });
    expect(errors.some((e) => /eind/i.test(e))).toBe(true);
  });

  it("eist einde ná begin", () => {
    const errors = validateAdSetScheduling({
      startTime: end,
      endTime: start,
      dayparting: null,
      lifetimeBudgetEur: "350.00",
      dailyBudgetEur: null,
    });
    expect(errors.some((e) => /na|vóór/i.test(e))).toBe(true);
  });

  it("eist precies één budgetvorm (daily óf lifetime)", () => {
    const both = validateAdSetScheduling({
      startTime: start,
      endTime: end,
      dayparting: null,
      lifetimeBudgetEur: "350.00",
      dailyBudgetEur: "25.00",
    });
    expect(both.length).toBeGreaterThan(0);
    const none = validateAdSetScheduling({
      startTime: start,
      endTime: end,
      dayparting: null,
      lifetimeBudgetEur: null,
      dailyBudgetEur: null,
    });
    expect(none.length).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------- buildObjectStorySpec */

describe("buildObjectStorySpec", () => {
  it("bouwt de object_story_spec met image_hash, tekst, link en CTA", () => {
    const spec = buildObjectStorySpec({
      pageId: "111",
      igUserId: "222",
      imageHash: "abc123",
      message: "Nieuwe badkamer?",
      link: "https://habitat-one.com/badkamer",
      callToAction: "LEARN_MORE",
    });
    expect(spec).toEqual({
      page_id: "111",
      instagram_user_id: "222",
      link_data: {
        image_hash: "abc123",
        message: "Nieuwe badkamer?",
        link: "https://habitat-one.com/badkamer",
        call_to_action: {
          type: "LEARN_MORE",
          value: { link: "https://habitat-one.com/badkamer" },
        },
      },
    });
  });

  it("laat instagram_user_id weg als die niet is geconfigureerd", () => {
    const spec = buildObjectStorySpec({
      pageId: "111",
      igUserId: null,
      imageHash: "abc123",
      message: "m",
      link: "https://x.example",
      callToAction: "CONTACT_US",
    });
    expect("instagram_user_id" in spec).toBe(false);
  });
});
