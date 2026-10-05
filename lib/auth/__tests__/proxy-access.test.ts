import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { NextAuthConfig } from "next-auth";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), config: undefined as NextAuthConfig | undefined }));
vi.mock("next-auth", () => ({ default: (config: NextAuthConfig) => { mocks.config = config; return { auth: vi.fn() }; } }));
vi.mock("@/lib/db", () => ({ db: { query: { users: { findFirst: mocks.lookup } } } }));
import "@/proxy";

const authorize = (path: string, role = "admin", loggedIn = true) => mocks.config!.callbacks!.authorized!({
  request: new NextRequest(`https://crm.example.invalid${path}`, { headers: { RSC: "1" } }),
  auth: loggedIn ? { user: { id: "70d2d5b8-042a-4afe-9ced-4b242dadcbaf", role }, expires: "2030-01-01" } : null,
});
beforeEach(() => { mocks.lookup.mockReset(); });

it("denies project and invoice requests before rendering even with an old admin cookie", async () => {
  mocks.lookup.mockResolvedValue({ role: "sales" });
  for (const path of ["/projects", "/projects/private-id", "/invoices", "/documents/private-id", "/inbox"]) {
    const response = await authorize(path);
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(307);
    expect((response as Response).headers.get("location")).toBe("https://crm.example.invalid/?geen-toegang=1");
    expect(await (response as Response).text()).toBe("");
  }
});

it("allows sales customer pages and passes a trusted pathname to the layout", async () => {
  mocks.lookup.mockResolvedValue({ role: "sales" });
  const response = await authorize("/contacts/project-customer?tab=projecten") as Response;
  expect(response.headers.get("x-middleware-next")).toBe("1");
  expect(response.headers.get("x-middleware-request-x-pathname")).toBe("/contacts/project-customer");
});

it("uses current full access even when a cookie still claims a restricted role", async () => {
  mocks.lookup.mockResolvedValue({ role: "admin" });
  const response = await authorize("/projects", "sales") as Response;
  expect(response.headers.get("x-middleware-next")).toBe("1");
});

it("retains public routes and rejects anonymous private requests without DB reads", async () => {
  expect(await authorize("/login", "admin", false)).toBe(true);
  expect(await authorize("/projects", "admin", false)).toBe(false);
  expect(mocks.lookup).not.toHaveBeenCalled();
});

it("rejects deleted users", async () => {
  mocks.lookup.mockResolvedValue(undefined);
  expect(await authorize("/projects")).toBe(false);
});

it("fails closed without disclosing database errors", async () => {
  mocks.lookup.mockRejectedValue(new Error("private database details"));
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = await authorize("/contacts") as Response;
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private database details");
    expect(log).toHaveBeenCalledWith("CRM access check unavailable; request denied.");
  } finally { log.mockRestore(); }
});
