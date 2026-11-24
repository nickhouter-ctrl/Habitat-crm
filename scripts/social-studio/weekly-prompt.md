# Wekelijkse social-content (Flex-Surfaces by Habitat One)

You are running unattended on Nick's Mac (Thursday morning) to finish next week's social posts for
Habitat One in Jávea (Costa Blanca): flexible stone wall panels (Flex-Surfaces / Stone-Motion).
The CRM has already planned next week (Mon/Wed/Fri 08:00) as DRAFTS. Your job: replace those drafts
with high-quality, realistic content per the mix below. Nick reviews and approves everything himself.
On top of that you make 4 extra REELS FOR FOLLOWERS (Tue/Thu/Sat/Sun 19:00) — see "Reels for followers".

Work in the repo root (the directory this prompt lives two levels below). Scratch work goes in
`~/Library/Application Support/habitat-social/<weekStart>/`. Keep a short log of what you did in
`~/Library/Application Support/habitat-social/history.md` (append; read it first to avoid repeating
scenes, panels, music or themes from the last 6 weeks).

## Hard rules
- NEVER approve, schedule or publish anything. Only touch posts with status `draft` or `failed`.
  Skip posts that are `approved`, `scheduled`, `published`, `rejected`, or already `customMedia: true`.
- If next week has no posts yet, stop and log "geen posts gepland".
- IMPORTANT (Nick, 21-11): even when all Mon/Wed/Fri posts of next week are already approved/scheduled,
  you are NOT done: always make the 4 "Reels for followers" (Tue/Thu/Sat/Sun 19:00) for next week. Only
  skip a reel day if a post already exists on that date (add-reel-slot.ts tells you). The notification
  then says how many reels you made.
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

## Content mix (Nick, 14-11 — vary, never the same thing three times)
Every week: 3 posts (Mon/Wed/Fri), each a DIFFERENT format and a different room type, all in
realistic Spanish homes (villas, fincas, casas de pueblo, apartments on the Costa Blanca).
Rotate through these formats (check history.md; use each at least once per ~3 weeks):

1. **Before → after video** (Higgsfield time-lapse, fixed camera, workmen carry large flexible
   sheets): tired wall → finished wall. Max 1 Higgsfield video per week.
2. **Before / after poster** in the style of `scripts/social-studio/ad-style/voor-na-*.jpeg`:
   cream background, official Flex-Surfaces logo on top, small hook line "¿Baño antiguo?",
   big two-tone headline "Mismo baño. / Un gran cambio." (Spanish big, English small line),
   ANTES / DESPUÉS photos side by side (Codex: before.png, then after.png as edit of before),
   website at the bottom. Single image or as 3-slide carousel (poster, before, after).
3. **Ideas carousel** (5–7 slides): "5 ideas para tu baño / salón / cocina / dormitorio /
   fachada / piscina / entrada / escalera / columna" — each slide a different realistic Spanish
   room with one of our panels, a short Spanish line + small English line on each slide.
4. **One room, several stones** Reel or carousel ("¿Cuál elegirías tú?") — see below.
5. **How it works** (carousel or Reel): 4–6 numbered steps — measure, prepare the wall, apply the
   adhesive, place the large flexible sheet, cut/finish edges, done; plus "bends around curves".
   Show it realistically (no fake hand-pressing close-ups).
6. **Specifications** (carousel with clean text slides over real photos/texture close-ups): only
   facts from the data sheet (see "Verified technical facts") + "which formats/kinds exist" with
   real panel photos, e.g. "133 variantes de color", families (lime, concrete, wood, travertine, rust…),
   "Interior y exterior", "Se curva en paredes redondas", "Sobre azulejos bien adheridos", "Hasta 3000 × 1200 mm".
7. **Exterior / façades**: Spanish villa façades, garden walls, pool surrounds, entrances, columns —
   photo carousel or ambience video (camera along the façade, Mediterranean light).
8. **Ambience video**: camera along a stone wall, a hand gently touching the stone, curved walls.
9. **Poster** in the style of `ad-style/poster-*.jpeg` (headline + inset of a bending sheet).
10. **Own material**: samples in hand, sample box, texture close-ups (see below).

Room types to rotate: bathroom, shower, living room, kitchen, bedroom (wall behind the bed),
hallway/entrance, staircase, terrace/porch, pool area, garden wall, façade, columns/arches.
On-screen text: English big, Spanish small underneath (Nick, 21-11).

## Vary the panels (Nick, 14-11: "you keep doing the same kinds")
We have 37 panels in 133 colour variants (MS codes in the Drive library, each with a real `…-01-panel.jpg`).
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

Verified facts — ONLY from our own website flex-surfaces.com (checked 21-11; it overrules the old data sheet):
- Flexible decorative panels with the look and relief of stone, travertine, concrete, wood or earth;
  they bend with the form: curves, columns, rounded walls, niches.
- Material: MODIFIED CLAY. They are NOT natural stone, NOT solid travertine/concrete/wood. Never write
  "real stone", "natural stone", "piedra natural", "100% piedra" or #piedranatural. Say "stone look",
  "aspecto de piedra", "flexible stone panels" / "paneles de piedra flexible" (brand term) is fine.
- Can go over existing tiles, if the tiles are firmly bonded and the surface is clean, dry and level.
- Three standard sizes: 3000 × 1200, 1200 × 600 and 900 × 600 mm ("up to 3000 × 1200 mm"). No other sizes.
- Collection: 37 panels, 133 colour variants, 7 texture families (travertine, concrete, wood, marble,
  stone textures, linear/relief, earth). Not "200+".
- Indoors and outdoors (walls, columns, bathrooms, kitchens, façades) — always as "possible", never as a
  guarantee; a panel is not waterproofing.
- Do NOT claim: a fire class (A2-s1 is NOT confirmed — never use it), PVC-free, waterproof, lightweight, a
  weight, a thickness, a bend radius, an installation time, prices, warranties.
- Samples and the showroom: Habitat One in Jávea / Xàbia is the stockist with a showroom.

## REAL FOOTAGE FIRST (Nick, 21-11 — "die is perfect")
Nick approved Reels cut from our own real 4K footage and rejected AI-looking/static ones ("te nep",
"te simpel"). Default for Reels from now on:
- Source: `~/Library/Application Support/habitat-social/bron/graded-footage.mp4` (28:48, 3840x2160, no text)
  plus supplier product clips in the same folder, and Nick's own clips in the eigen-beeld mirror.
  Timecodes (s): 36 mixing adhesive · 60-66 two men unroll a big sheet in a garage · 84/312-324 measuring
  on the panel · 348-396 cutting on the lawn (villa, palm) · 238-244 carrying a panel to the pool wall ·
  456-530 placing/pressing panels on a pool wall with sea view · 551-556 palm + view over Jávea ·
  612-680 sample wall in the showroom · 684-900 truck, forklift, crates, warehouse racks · 900-1320
  texture close-ups with a hand (ribbed, rough stone, travertine, wood, fanned samples) · 1320-1372
  a hand bends a sheet (hero shot) · 1375-1400 showroom ("Experience stone" sign, person holding a
  panel) · 1404-1536 niche project indoors · 1540-1728 drone over the Habitat One building.
- Cut with `python3 scripts/social-studio/cut_shots.py <source> shots.json raw.mp4`
  (shots.json = [[start, duration, x], ...], x = left edge of the 9:16 crop in source pixels; check every
  shot with a frame grab). Then `reel.py raw.mp4 out.mp4 --cues cues.json --music … --text-y 0.13`.
- EVERY shot must show our panel (bending, carrying, cutting, placing, texture, samples). Never a shot
  of just a bare wall, adhesive or tools without the panel.
- Text: ENGLISH FIRST (big line = cue "es" field) and Spanish small underneath (cue "en" field).
  Captions too: English block first, then Spanish.
- Fun questions that invite comments ("Real stone? Look closely.", "Guess what this is made of.",
  "Which wall for your home in Jávea? Comment your number", "Guess how many fit in here?",
  "Would you put this on your wall?") and ALWAYS end with a follow call
  ("Follow us for more real projects in Jávea" / "Síguenos para más obras reales en Jávea").
- Reuse is fine but vary: never the same shot sequence twice within 6 weeks (log the timecodes you used
  in history.md). AI (Codex/Higgsfield) only for before/after or "one room, several panels", and then
  rich, beautiful, realistic rooms — never simple/empty scenes.

## Reels for followers (Nick, 21-11: "reels voor meer volgers", besides the Mon/Wed/Fri posts)
Own photos/clips: Nick and colleagues fill the shared iCloud folder "Habitat One - Eigen beeld";
a launchd job (com.habitatone.eigen-beeld-sync, hourly rsync, never deletes) mirrors it to
`~/Library/Application Support/habitat-social/eigen-beeld/` — always read from that mirror (iCloud itself is
blocked for unattended runs). Skip files ending in `.icloud` (not downloaded yet) and log them.
LOCAL FOCUS (Nick, 21-11): the goal is to become known in Jávea and surroundings (Xàbia, Dénia, Moraira,
Benitachell, Calp, El Poble Nou de Benitatxell, Teulada, Pedreguer, Gata). Every Reel must feel local:
local hooks ("¿Vives en Jávea?", "Jávea, ¿qué pared cambiarías?", "From Jávea with love"), local scenes
(white Mediterranean villas with the Montgó in view, riu-rau porches, terraces with sea view, casas de
pueblo in the old town, pool terraces), local light. Questions in BOTH Spanish (big) and English (small,
many residents are international), in the video and in the caption. Promote the product in a fun,
light way and always end with an invitation to the showroom in Jávea. Never use real addresses or
recognisable private houses of others; Codex scenes are "inspired by" the area.
Goal: reach and new followers on Instagram, and showing what Habitat One really does (panels AND full renovations/projects). Every week 4 extra Reels on Tue, Thu, Sat and Sun at 19:00.
The Mon/Wed/Fri posts stay exactly as described above.
- Create the empty draft rows first: `npx tsx scripts/social-studio/add-reel-slot.ts <date>` for each of
  the 4 dates (prints the new id; does nothing if a post already exists that day). Then fill each one
  like the other posts (zernio.py → update.json with kind "video" → update-post.ts).
- 9:16 mp4, 7–15 s, fast and light-hearted. The first 1–2 s carry a big Spanish hook QUESTION or
  surprise (small English line below), centred (`"y": 0.38`). Music from public/brand/music.
- Default is 0 credits: build from real library photos and/or Codex images with
  `python3 scripts/social-studio/slideshow.py a.jpg b.jpg c.jpg raw.mp4 [--sec 2.5] [--transition wipeleft]`
  then `reel.py raw.mp4 out.mp4 --cues cues.json --music ...`. The Higgsfield budget stays the same
  (max 1 draft video per week in total).
- Rotate these Reel types (each at least once every 2 weeks, never the same type twice in a row):
  1. **Before → after reveal**: before photo, `--transition wipeleft` to the after photo.
     Hook "¿Te atreverías?" / "De esto… a esto".
  2. **¿Cuál elegirías tú?**: one room, 3–4 of our panels, numbered; the caption asks for a number.
  3. **Quiz**: "¿Piedra maciza o panel flexible?", "¿Interior o exterior?" — answer at the end,
     only verified facts.
  4. **How it works in 15 s**: 4–5 numbered steps (photos), ending with the bending sheet.
  5. **You asked, we answer** (Nick loves @dizzplace's version): moving background clips (Higgsfield
     kling3_0 std 5 s, sound off, ≈7.5 credits each, from library photos), and per question a comment
     bubble (as if a follower from Jávea asks it), a numbered info card (01/04) and a short answer —
     made with `python3 scripts/social-studio/faq_cards.py spec.json outdir/` (card types: layers,
     sizes, curve, pin) and placed with `reel.py --overlays overlays.json` (bubble y≈0.20, card y≈0.30,
     answer y≈0.60). 3–4 questions, ~3.5 s each, last one = showroom in Jávea (pin card). Only facts
     from "Verified facts".
  6. **Behind the scenes** (also like @dizzplace: real, light-hearted clips of cutting, sorting and
     packing samples, the showroom, a delivery): ONLY from Nick's own clips/photos in
     `~/Library/Application Support/habitat-social/eigen-beeld/Achter de schermen/` (newest first, never reuse a file, log used files in
     history.md). Cut 2–4 short clips to 9:16 with ffmpeg, add hook text + music via reel.py. If the
     folder is empty, skip this type. Never fake behind-the-scenes footage with AI.
  7. **Our projects — renovations** (Nick, 21-11: "mensen moeten zien wat wij doen, ook verbouwingen
     en projecten", photos of ongoing projects will be delivered): ONLY real photos/clips from
     `~/Library/Application Support/habitat-social/eigen-beeld/Projecten/<project>/1-voor|2-tijdens|3-na/` or `Voor|Tijdens|Na/` (+ optional info.txt).
     Tell the story in 10–15 s: hook ("¿Cómo quedó esta casa en Moraira?" / "Día 1 vs. día 30"),
     before → work in progress (craftsmen, demolition, new walls, panels going up) → result.
     Use `reel.py --brand habitat` (Habitat One logo instead of Flex-Surfaces), Habitat One does the
     whole renovation. Place = town only, never an address or client name; no recognisable client
     faces. A project can return as a series ("Parte 2") when new 2-tijdens/3-na photos arrive.
     Whenever a project folder has new, unused photos, make at least ONE project Reel that week —
     this type has priority over the others. Nick (24-11) added photos of several projects
     (Costa Nova, Xixona, Finca Lisa, het Palijsje, appartement Thomas) and wants fun content from
     them: while unused project photos remain, make TWO project Reels a week (two different
     projects, rotate so every project gets a turn) and make one of the Mon/Wed/Fri posts a project
     carousel (5–8 best photos, story voor → tijdens → na) with the same place/privacy rules.
     Folders may also be named `Voor`/`Tijdens`/`Na` (e.g. Finca Lisa) — treat them the same.
     Big folders (Costa Nova has 200+ files): pick the sharpest, most telling shots, skip
     near-duplicates; short clips (.mp4/.MOV) from the folder may be cut in. A project with only
     "tijdens" photos is fine: frame it as "work in progress / Parte 1". Renders/3D designs only if they are in the project folder
     (then label them "Diseño" on screen).
- Caption: short and chatty (1–3 sentences per language), ends with a question that invites a
  comment, then the showroom lines, `📍 Jávea · Costa Blanca` and the hashtags (add #reels #reelsespaña
  #reformas #interiorismo where they fit).
- Log the Reels in history.md like the posts (type, hook, photos used).

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
- Before/after poster: `python3 scripts/social-studio/before_after_poster.py before.png after.png
  bend.jpg out.jpg --hook "¿Baño antiguo?" --line1 "Mismo baño." --line2 "Un gran cambio." --en
  "Same bathroom. A big difference."` — bend.jpg = a REAL photo of a bending sheet from the library
  (`bending-roll.jpg`, `faq-bending-hand.jpg`; never the dark grey one). Publish as a carousel:
  slide 1 the poster, slide 2 the real bending photo full-size via photo.py with "Una lámina fina
  que se curva" (Nick: always show how flexible it is), slide 3 the after photo.
- Finish photos: `python3 scripts/social-studio/photo.py in out.jpg [--es "..."] [--en "..."]`
  (use ` ` between number and unit). Product posts: text on every slide; ambience: text on the
  first slide only or none.
- Caption (write it yourself), exactly this structure:
  English text (2–4 short sentences, warm, concrete, no hype, max one emoji, ending with ONE
  question that invites a comment, e.g. "Which one would you put in your living room?") + blank line +
  `📅 Come and see and touch the panels in our showroom in Jávea. Book your visit 👉 habitat-one.com/showroom`
  + blank line + `—` + blank line + the same in native Castilian Spanish (with the same question,
  e.g. "¿Cuál pondrías tú en tu salón?") ending with
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
macOS notification: `osascript -e 'display notification "3 posts + 4 reels voor volgende week staan klaar in het CRM" with title "Habitat One social"'`.
End with a 5-line summary.

Write history.md entries, notifications and the final summary in Dutch (Nick reads them).
