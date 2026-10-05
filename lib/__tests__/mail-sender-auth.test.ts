import { expect, it } from "vitest";
import { gmailAuthenticatedSender } from "../mail-sender-auth";

const result = (line: string) => ({ key: "authentication-results", line });
it("accepts Gmail's aligned DMARC result, including folded headers", () => {
  expect(gmailAuthenticatedSender("Mourad.H@habitat-one.com", [result("Authentication-Results: mx.google.com;\r\n dkim=pass;\r\n dmarc=pass (p=NONE) header.from=habitat-one.com")])).toBe(true);
});
it("denies unauthenticated, misaligned or forwarded results", () => {
  for (const line of [
    "Authentication-Results: mx.google.com; spf=pass; dmarc=fail header.from=habitat-one.com",
    "Authentication-Results: mx.google.com; dmarc=pass header.from=attacker.example",
    "Authentication-Results: attacker.example; dmarc=pass header.from=habitat-one.com",
  ]) expect(gmailAuthenticatedSender("mourad.h@habitat-one.com", [result(line)])).toBe(false);
  expect(gmailAuthenticatedSender("mourad.h@habitat-one.com", [])).toBe(false);
  expect(gmailAuthenticatedSender("mourad.h@habitat-one.com", [
    result("Authentication-Results: mx.google.com; dmarc=fail header.from=habitat-one.com"),
    result("Authentication-Results: mx.google.com; dmarc=pass header.from=habitat-one.com"),
  ])).toBe(false);
});
