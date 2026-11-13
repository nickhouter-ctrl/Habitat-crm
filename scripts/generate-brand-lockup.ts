/**
 * Genereert public/brand/flex-surfaces-lockup.png: het witte woordmerk
 * "FLEX-SURFACES" met daaronder "BY HABITAT ONE", transparante achtergrond en
 * een zachte schaduw. lib/social/image-prep.ts plakt dit linksonder op elk
 * social-beeld.
 *
 * Waarom een PNG en geen live SVG-tekst: op Vercel staan geen systeemfonts, dus
 * librsvg zou de tekst daar in een willekeurig font (of als blokjes) zetten.
 * Eenmalig lokaal renderen (macOS heeft Avenir Next) en het bestand meeleveren.
 *
 *   npx tsx scripts/generate-brand-lockup.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

const W = 1600;
const H = 340;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <filter id="shadow" x="-10%" y="-30%" width="120%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="9"/>
      <feOffset dx="0" dy="4" result="blur"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.38"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g filter="url(#shadow)" fill="#FFFFFF">
    <text x="24" y="170" font-family="Avenir Next, Avenir, Montserrat, Helvetica Neue, Arial, sans-serif"
      font-weight="500" font-size="150" letter-spacing="22" textLength="${W - 60}" lengthAdjust="spacingAndGlyphs">FLEX-SURFACES</text>
    <text x="30" y="272" font-family="Avenir Next, Avenir, Montserrat, Helvetica Neue, Arial, sans-serif"
      font-weight="500" font-size="62" letter-spacing="20">BY HABITAT ONE</text>
  </g>
</svg>`;

async function main() {
  const out = path.join(process.cwd(), "public", "brand", "flex-surfaces-lockup.png");
  mkdirSync(path.dirname(out), { recursive: true });
  const png = await sharp(Buffer.from(svg)).png().trim({ threshold: 1 }).toBuffer();
  writeFileSync(out, png);
  const meta = await sharp(png).metadata();
  console.log(`Geschreven: ${out} (${meta.width}×${meta.height})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
