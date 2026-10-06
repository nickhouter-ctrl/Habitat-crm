import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { additionalContactEmailsSchema, appendContactEmails } from "../contact-email-addresses";
const m = vi.hoisted(() => ({ resolve: vi.fn(), smtp: vi.fn() }));
vi.mock("@/lib/contact-email-recipients", () => ({ contactEmailRecipients: m.resolve }));
vi.mock("@/lib/gmail", () => ({ sendMail: m.smtp, getPurchaseAccount: () => null, getMarketingAccount: () => null }));
import { sendEmail } from "../email";
const env = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env.GMAIL_USER = "hi@example.com";
  process.env.GMAIL_APP_PASSWORD = "mock-password";
  m.resolve.mockResolvedValue("primary@example.com, second@example.com");
  m.smtp.mockResolvedValue({ messageId: "mock" });
});
afterEach(() => { process.env = { ...env }; vi.unstubAllGlobals(); });
const mail = { to: "primary@example.com", subject: "Appointment", html: "<p>Confirmation</p>" };
describe("additional contact recipients", () => {
  it("validates and deduplicates extra addresses without accepting header injection", () => {
    expect(additionalContactEmailsSchema.parse("Second@Example.com; second@example.com, third@example.com")).toEqual(["second@example.com", "third@example.com"]);
    expect(additionalContactEmailsSchema.safeParse("a@example.com\r\nBcc: hidden@example.com").success).toBe(false);
    expect(additionalContactEmailsSchema.safeParse(Array(11).fill("a@example.com")).success).toBe(false);
    expect(appendContactEmails("Primary <PRIMARY@example.com>", ["primary@example.com", "second@example.com", "SECOND@example.com", "invalid"])).toBe("Primary <PRIMARY@example.com>, second@example.com");
  });
  it("sends business mail to both addresses and reports the actual recipients", async () => {
    expect(await sendEmail(mail)).toMatchObject({ sent: true, recipients: "primary@example.com, second@example.com" });
    expect(m.smtp).toHaveBeenCalledWith(expect.objectContaining({ to: "primary@example.com, second@example.com" }));
  });
  it("does not copy personal login messages", async () => {
    await sendEmail({ ...mail, noCompanyBcc: true });
    expect(m.resolve).not.toHaveBeenCalled();
    expect(m.smtp).toHaveBeenCalledWith(expect.objectContaining({ to: mail.to }));
  });
  it("never expands internal mail, even if explicitly requested", async () => {
    await sendEmail({ ...mail, to: "nick@habitat-one.com", interneMelding: true, copyToContactEmails: true });
    expect(m.resolve).not.toHaveBeenCalled();
  });
  it("allows customer replies from the marketing mailbox to include copies", async () => {
    await sendEmail({ ...mail, noCompanyBcc: true, copyToContactEmails: true });
    expect(m.resolve).toHaveBeenCalledWith(mail.to);
    expect(m.smtp).toHaveBeenCalledWith(expect.objectContaining({ to: "primary@example.com, second@example.com" }));
  });
  it("does not send a partial recipient list when lookup fails", async () => {
    m.resolve.mockRejectedValueOnce(new Error("unavailable"));
    expect(await sendEmail(mail)).toEqual({ sent: false, reason: "contact-recipients-unavailable" });
    expect(m.smtp).not.toHaveBeenCalled();
  });
  it("passes multiple recipients as an array to Resend", async () => {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    process.env.RESEND_API_KEY = "mock";
    process.env.EMAIL_FROM = "hi@example.com";
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    await sendEmail(mail);
    expect(JSON.parse(fetch.mock.calls[0][1].body).to).toEqual(["primary@example.com", "second@example.com"]);
  });
});
