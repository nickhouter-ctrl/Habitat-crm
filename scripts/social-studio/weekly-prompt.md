# Wekelijkse social-content (Flex-Surfaces by Habitat One)

You are running unattended on Nick's Mac (Thursday morning) to finish next week's social posts for
Habitat One in Jávea (Costa Blanca): flexible stone wall panels (Flex-Surfaces / Stone-Motion).
The CRM has already planned next week (Mon/Wed/Fri 08:00) as DRAFTS. Your job: replace those drafts
with high-quality, realistic content per the mix below. Nick reviews and approves everything himself.

Work in the repo root (the directory this prompt lives two levels below). Scratch work goes in
`~/Library/Application Support/habitat-social/<weekStart>/`. Keep a short log of what you did in
`~/Library/Application Support/habitat-social/history.md` (append; read it first to avoid repeating
scenes, panels, music or themes from the last 6 weeks).

## Hard rules
- NEVER approve, schedule or publish anything. Only touch posts with status `draft` or `failed`.
  Skip posts that are `approved`, `scheduled`, `published`, `rejected`, or already `customMedia: true`.
- If next week has no posts yet, stop and log "geen posts gepland".
- Always realistic: real Spanish homes on the Costa Blanca / Ibiza style (whitewashed lime walls,
  wooden beams, terracotta, olive trees, pools, sea light). Nothing that looks fake or CGI.
  No black or dark marble. No close-ups of hands pressing a panel onto a wall (looked fake before).
- No unverifiable claims in text: no prices, thickness, weight, fire ratings, warranties, durations
  ("in 1 day"), certifications. Formats/colour names only as they appear in our file names
  (e.g. `MS-033-Roman-White-1200x600-mm` → "Roman White · 1200 × 600 mm").
- Budget: at most ONE Higgsfield video per week, as a DRAFT (`seedance_2_5`, `mode: omni_reference`,
  `draft: true`, `generate_audio: false`, `aspect_ratio: 9:16`, 12–15 s ≈ 45 credits). Never
  finalize (720p costs 240). Check `mcp__higgsfield__balance` first; below 60 credits, or if the
  Higgsfield tools are unavailable, skip the video and leave the post as "Video nodig" (log it). Music: reuse `public/brand/music/*.mp3` (prefer
  `guitar-1.mp3`); never generate new music in the unattended run.
- Inspect every generated image/video yourself (extract frames with
  `node_modules/ffmpeg-static/ffmpeg`, then Read them). If something looks fake, wrong or off-brand,
  regenerate once; if still bad, fall back to real photos from the library and log why.

## Content mix (vary, never the same thing three times)
Use the ISO week number of the week being filled:
- **Odd week** — Mon: *product* (formats, close-up of the texture, which colours/types exist —
  real photos from `<scratch>/library` or the Drive download with explanation text in the image);
  Wed: *how it works / before → after* video; Fri: *ambience* (villa scenes).
- **Even week** — Mon: *before → after* photo carousel (Codex before + after, text "Antes / Before",
  "Después / After"); Wed: *ambience* video (camera along a stone wall, a hand gently touching the
  stone, curved walls, pool, sea light); Fri: *ambience* or *product detail*, whichever was used
  least recently according to history.md.

## Vary the panels (Nick, 14-11: "you keep doing the same kinds")
We have 200+ panels (MS-001 … MS-288 in the Drive library, each with a real `…-01-panel.jpg`).
Do NOT keep using the same few travertine/white ones (Roman White, Beige, White Golden). Every week
pick panels you have not used in the last 8 weeks (check history.md and log every MS code you use),
and spread across families: lime/plaster, concrete, bush-hammered stone, rammed earth / clay tones,
wood looks, rust/corten, gradient yellow, red/terracotta, Italian travertines, light greys, khaki,
textured/3D lines. Light and warm is the default, but colourful ones (red, rust, yellow, wood) are
welcome. Only avoid black / dark marble looks.

## Panel sizes must be right (Nick, 14-11)
Our panels come in real formats, visible in the file names: large sheets such as 1200 × 3000 mm,
1200 × 2900, 1200 × 2400, 600 × 3000 / 595 × 2800, and smaller ones like 1200 × 600 mm. Every image
or video must show the format of the panel it uses: large sheets go up VERTICALLY in one piece from
floor to ceiling (seams only every ~1.2 m, no horizontal seams, cut to height at the top); 1200 × 600
panels are laid in a neat running bond. Installation scenes: two workmen carry ONE large, thin,
slightly flexing sheet at a time and press it onto the wall — never small tiles, never horizontal
strips for a large-format panel. Say the format explicitly in every Codex and Higgsfield prompt.
BUT: file names are not always consistent (e.g. MS-033 appears as both 2400×1200 and 1200×600), so
never print a size in on-screen text or captions unless Nick has confirmed it — write "large,
flexible sheets" / "láminas grandes y flexibles" instead.

## Own material in view (Nick, 14-11)
Regularly show our OWN material: Habitat One samples/swatches held in real hands, sample books, our
own sample box / shipping box with the Habitat One logo (logo files in the website repo
`~/projects/Habitat-one/public/logo-habitat.png`, `logo-habitat-cream.png`), texture details. AI is
allowed for this as long as it looks truly real (real cardboard/paper texture, natural light, real
hands, stone texture from our own product photos). Inspiration: competitor ATerior
(@aterior.official) — take the approach (product in hand, consistent brand, logo on every post),
never copy their compositions, slogans, layouts or images, and not their black-and-white palette.
Published page posts are boosted automatically to Jávea by the CRM (cron meta-boost) — so every
post you prepare is also an ad; keep it worth paying for.

## Extra format: "one room, several stones — which one do you prefer?" (Nick likes this)
Inspired by a viral bathroom Reel ("une salle de bain, plusieurs coloris — laquelle est ta
préférée ?"). Make ONE realistic Spanish room (bathroom, living room, terrace) with Codex, then 3–5
edits of exactly the same image where only the clad wall changes to another of OUR panels (use the
real panel photo of each colour as reference; light/warm tones, no dark marble). Publish as a Reel
(quick cuts of ~1.5 s per version, a soft camera push via Higgsfield is optional, numbered labels
"1 · Roman White", "2 · Beige"…) or as a carousel, with the hook "¿Cuál elegirías tú?" / "Which one
would you choose?" and in the caption an invitation to answer with the number. Great for comments.
Use about once every 3–4 weeks, in the ambience or product slot.
What works (Nick loved it): the villa BATHROOM — a lived-in, richly styled room (bathtub, brass
taps, wooden stool, towel, olive branch, arched window with sea view, beams), normal ceiling
height, the stone wall as one element among many. What does NOT work (Nick: "fake" and "the room"):
an empty double-height living room with a huge bare wall and just a sofa — too sterile, too
CGI-like. Always choose a cosy, lived-in, realistically proportioned space with depth, real
clutter and natural light; the clad wall should not fill more than about half of the frame.

## Extra format: poster / ad graphic (Nick likes this a lot)
About once every two weeks (instead of a plain photo post, usually the Mon or Fri slot), make a
finished poster with Codex in the style of `scripts/social-studio/poster-style.jpeg`: warm cream
background, brand label "FLEX-SURFACES · BY HABITAT ONE", big two-tone headline in Spanish
(dark brown + caramel), English subline, a realistic Spanish villa interior/exterior with a feature
wall in one of our panels, a rounded inset of a hand bending a thin LIGHT stone sheet (reference
`material-bending-hand.jpg` from the library, but recolour to the panel shown — never dark grey),
a caramel call-to-action pill ("Ven a tocarla en nuestro showroom de Jávea") and
"habitat-one.com/showroom" at the bottom. Give Codex the exact text with correct accents and check
the result for spelling; regenerate if any text is wrong. Do NOT add the Flex-Surfaces lockup on top
of a poster (the brand is already in it) — publish the poster as-is.
Never announce events (open day etc.) unless Nick has put the date in the instructions.

Verified technical facts (from public/docs/flexible-stone-technical-data-sheet.pdf) that MAY be used
sometimes, e.g. as an icon strip on a poster or in a product post: fire class A2-s1 (tested to
GB/T 14402 / GB/T 20284); CE — EN 15102:2019; UV light-ageing tested (ASTM G154); freeze-thaw tested
(ASTM C1026, no visible change); PVC-free; no VOCs detected; flexible / bends around curves; indoor
and outdoor. Do NOT claim "lightweight", "waterproof"/"waterbestendig", a weight, a thickness or a
price — those are not in the data sheet.

## How to make things
- Real photos: `npx tsx scripts/social-studio/week-status.ts` shows the CRM's chosen images. The full
  Drive library is in `~/Library/Application Support/habitat-social/drive_all/` if present.
- Codex images (Nick's ChatGPT account): in a fresh empty folder,
  `echo "<prompt>" | codex exec --skip-git-repo-check -s workspace-write --image=ref.jpg`
  (prompt via stdin; `--image` per reference). Always give a REAL panel photo as reference for the
  stone texture/colour. For before→after: first `before.png` (old Spanish house, ugly cracked render,
  9:16, realistic smartphone-photo look), then `after.png` = edit of before.png with the panel
  reference: same camera, same room, only the wall clad + minimal styling.
- Higgsfield video (MCP tools `mcp__higgsfield__*`, paid from Nick's subscription credits):
  `media_upload` (filename) → `curl -X PUT -H "Content-Type: image/png" -H "If-None-Match: *"
  --data-binary @file '<upload_url>'` → `media_confirm` (type image) → `generate_video` with the
  draft params above → poll `jobs_wait` (≤15 s per call) → download `result_url` with curl.
  Images must be 9:16. Before→after: medias `start_image` = before, `end_image` = after; prompt
  "realistic renovation time-lapse from a fixed tripod, the camera does not move, two workmen in
  plain grey work clothes, faces not visible, they prepare the wall then fix the large stone panels,
  ends calm and still for two seconds". Ambience: `start_image` only, slow steady camera, a hand
  gently touching the stone, natural light. If a job ends with `ip_detected`, simplify the prompt
  (no people descriptions) and retry once.
- Finish video: `python3 scripts/social-studio/reel.py in.mp4 out.mp4 --cues cues.json --music
  public/brand/music/guitar-1.mp3` (cues: Spanish big, English small, 2–4 short lines, numbered
  steps for how-it-works).
- Hook style (inspired by the competitor @cusoftstone, whose Reels Nick likes — do NOT copy their
  content or wording): every video opens with ONE big, curiosity-driven hook in the first 0–2.5 s,
  centred (`--text-y 0.38` for that cue, or a separate reel.py pass), plus a short subline, e.g.
  "¿Parece piedra maciza?" / "It's a flexible panel"; "De pared vieja a piedra natural" / "From tired
  wall to natural stone"; "¿Una columna redonda? Sin problema" / "A round column? No problem".
  The first frame doubles as the Instagram cover, so the hook must be readable there. Real spaces,
  warm light, one clear surprise or transformation per video.
- Make it clearly SPANISH (Nick: "bij ons wel meer Spaans"): Spanish settings only — villas and
  casas on the Costa Blanca (Jávea, Moraira, Dénia), fincas and casas de campo, Ibiza-style houses,
  patios, porches with wooden beams, terracotta floors, whitewash, arches, pools with sea or pine
  views, Mediterranean light. No shops, cafés, offices or non-Spanish architecture. On-screen text
  is Spanish first and dominant (English only small underneath); hooks are written as a Spaniard
  would say them, not translated.
- Finish photos: `python3 scripts/social-studio/photo.py in out.jpg [--es "..."] [--en "..."]`
  (use ` ` between number and unit). Product posts: text on every slide; ambience: text on the
  first slide only or none.
- Caption (write it yourself), exactly this structure:
  English text (2–4 short sentences, warm, concrete, no hype, max one emoji) + blank line +
  `📅 Come and see and touch the panels in our showroom in Jávea. Book your visit 👉 habitat-one.com/showroom`
  + blank line + `—` + blank line + the same in native Castilian Spanish ending with
  `📅 Ven a ver y tocar los paneles en nuestro showroom en Jávea. Reserva tu visita 👉 habitat-one.com/showroom`
  + blank line + `📍 Jávea · Costa Blanca` + blank line + hashtags starting with
  `#Javea #Xabia #CostaBlanca #Denia #Moraira #Benitachell #flexiblestone #piedraflexible #FlexSurfaces #HabitatOne`
  plus 4–7 fitting ones. Save as `cap.txt`.
- Publish as draft: `python3 scripts/social-studio/zernio.py --caption cap.txt --post-id <zernioPostId
  from week-status, if any> [--ai] files...` → JSON with `zernioPostId` and `mediaUrls`. Use `--ai`
  whenever Codex or Higgsfield made any of the media.
- Then write `update.json` `{id, kind, theme, caption, mediaUrls, zernioPostId, aiGenerated}` and run
  `npx tsx scripts/social-studio/update-post.ts update.json`.

## Finish
Append to history.md: date, per post the type, scene, panel(s), music, credits used. Then show a
macOS notification: `osascript -e 'display notification "Posts voor volgende week staan klaar in het CRM" with title "Habitat One social"'`.
End with a 5-line summary.

Write history.md entries, notifications and the final summary in Dutch (Nick reads them).
