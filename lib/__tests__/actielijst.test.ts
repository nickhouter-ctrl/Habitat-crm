import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { actieKleur, actieMailSleutel, bestaandeIndeling, dagenTeLaat, groepeer, isAchterstallig, type ActieRegel } from "../actielijst";
import { staffNotificationEmail } from "../staff-notification-email";

const punt = (over: Partial<ActieRegel>): ActieRegel => ({ id: "1", groupName: "Showroom", subgroup: null, title: "Stalenkast opruimen", dueDate: null, status: "open", assigneeId: null, ...over });

describe("kleur van een actiepunt", () => {
  it("laat de dag van de deadline zelf nog op tijd zijn", () => {
    const vandaag = "2026-11-18";
    expect(isAchterstallig(punt({ dueDate: vandaag }), vandaag)).toBe(false);
    expect(isAchterstallig(punt({ dueDate: "2026-11-17" }), vandaag)).toBe(true);
  });

  it("is nooit achterstallig als het punt al klaar is", () => {
    expect(isAchterstallig(punt({ dueDate: "2026-01-01", status: "done" }), "2026-11-18")).toBe(false);
    expect(actieKleur(punt({ dueDate: "2026-01-01", status: "done" }), "2026-11-18")).toBe("klaar");
  });

  it("laat rood voorgaan op bezig, en bezig op neutraal", () => {
    expect(actieKleur(punt({ dueDate: "2026-11-17", status: "in_progress" }), "2026-11-18")).toBe("achterstallig");
    expect(actieKleur(punt({ dueDate: "2026-12-01", status: "in_progress" }), "2026-11-18")).toBe("bezig");
    expect(actieKleur(punt({ dueDate: "2026-12-01" }), "2026-11-18")).toBe("neutraal");
    expect(actieKleur(punt({}), "2026-11-18")).toBe("neutraal");
  });
});

describe("herinnering bij een gemiste deadline", () => {
  it("telt de dagen dagnauwkeurig over een zomertijdgrens heen", () => {
    // 25 oktober 2026 gaat de klok in Madrid een uur terug.
    expect(dagenTeLaat("2026-10-24", "2026-10-26")).toBe(2);
    expect(dagenTeLaat("2026-11-20", "2026-11-18")).toBe(-2);
  });

  it("stuurt één mail per dag en daarna één keer per week", () => {
    const sleutel = (dag: string) => actieMailSleutel("abc", "2026-11-17", dag);
    // Dag na de deadline en de dagen erna: dezelfde sleutel, dus één mail.
    expect(sleutel("2026-11-18")).toBe(sleutel("2026-11-20"));
    expect(sleutel("2026-11-18")).toBe("actie:abc:2026-11-17:w0");
    // Een week later mag hij zich opnieuw melden.
    expect(sleutel("2026-11-24")).toBe("actie:abc:2026-11-17:w1");
    expect(sleutel("2026-12-01")).toBe("actie:abc:2026-11-17:w2");
  });

  it("geeft een verzette deadline een eigen sleutel", () => {
    expect(actieMailSleutel("abc", "2026-12-01", "2026-12-02")).not.toBe(actieMailSleutel("abc", "2026-11-17", "2026-12-02"));
  });

  it("noemt de taak en de gemiste deadline, met een link naar het punt", () => {
    const m = staffNotificationEmail({ kind: "action_overdue", itemId: "00000000-0000-4000-8000-000000000001", title: "Stalenkast opruimen", body: "Showroom · Stalen", day: "2026-11-17" }, { name: "Mourad", locale: "nl" });
    expect(m.subject).toBe("Actie nodig – Stalenkast opruimen is nog niet uitgevoerd");
    expect(m.text).toContain("Gemiste deadline: 17 november 2026");
    expect(m.html).toContain("/actielijst?taak=00000000-0000-4000-8000-000000000001");
  });

  it("vertaalt de mail en laat geen regeleinde in het onderwerp staan", () => {
    const m = staffNotificationEmail({ kind: "action_overdue", itemId: "00000000-0000-4000-8000-000000000002", title: "Voorraad tellen\nBcc: attacker", body: "<script>alert(1)</script>", day: "2026-11-17" }, { name: "Teresa", locale: "es" });
    expect(m.subject).not.toMatch(/[\r\n]/);
    expect(m.subject).toContain("Se requiere acción");
    expect(m.text).toContain("Fecha límite incumplida");
    expect(m.html).not.toContain("<script>");
  });
});

describe("indeling van de lijst", () => {
  const regels = [
    punt({ id: "1", groupName: "Showroom", subgroup: "Afwerking" }),
    punt({ id: "2", groupName: "Showroom", subgroup: "Afwerking" }),
    punt({ id: "3", groupName: "Showroom", subgroup: "Stalen" }),
    punt({ id: "4", groupName: "Magazijn", subgroup: null }),
    punt({ id: "5", groupName: "Magazijn", subgroup: "  " }),
  ];

  it("houdt de volgorde van de query aan en voegt subgroepen samen", () => {
    const groepen = groepeer(regels);
    expect(groepen.map(g => g.groep)).toEqual(["Showroom", "Magazijn"]);
    expect(groepen[0].subgroepen.map(s => s.naam)).toEqual(["Afwerking", "Stalen"]);
    expect(groepen[0].subgroepen[0].regels.map(r => r.id)).toEqual(["1", "2"]);
    // Een leeg veld is geen eigen subgroep: anders staan er twee naamloze kopjes.
    expect(groepen[1].subgroepen).toHaveLength(1);
    expect(groepen[1].subgroepen[0].regels.map(r => r.id)).toEqual(["4", "5"]);
  });

  it("stelt alleen bestaande groepen en subgroepen voor", () => {
    expect(bestaandeIndeling(regels)).toEqual({ groepen: ["Magazijn", "Showroom"], subgroepen: ["Afwerking", "Stalen"] });
  });
});
