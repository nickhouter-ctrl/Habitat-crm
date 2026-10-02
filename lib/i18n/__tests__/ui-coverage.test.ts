import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { en } from "@/lib/i18n/en";
import { es } from "@/lib/i18n/es";

/** User-facing literals must not silently fall back to Dutch after later edits. */
describe("CRM interface translations", () => {
  it("covers literal translation calls throughout the authenticated UI", () => {
    const files: string[] = [];
    const scan = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(file);
        else if (file.endsWith(".tsx")) files.push(file);
      }
    };
    scan("app/(app)"); scan("components");
    const technical = new Set(["m²", "×", "Holded", "kB", "OpenStreetMap", "Google Places", "Vimeo", "YouTube", "empirical Bayes", "OS"]);
    const missing: string[] = [];
    const check = (node: ts.Expression, file: string) => {
      if (ts.isConditionalExpression(node)) { check(node.whenTrue, file); check(node.whenFalse, file); }
      else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const key = node.text;
        if (!/[A-Za-zÀ-ÿ]/.test(key) || technical.has(key) || /^(?:[/@#]|https?:|\w+@)/.test(key)) return;
        if (!(key in en) || !(key in es)) missing.push(`${file}: ${key}`);
      }
    };
    for (const file of files) {
      const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ["t", "uiT"].includes(node.expression.text) && node.arguments[0]) check(node.arguments[0], file);
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(missing).toEqual([]);
  });
});
