# Campaign Folders — what each Social Assistant extension needs

This file is the automation contract between your AI tools and the five extensions.
Generate content with any AI (ChatGPT, Claude, Gemini, Grok, Midjourney, Veo, Sora…),
save the outputs under the exact filenames below inside the folder named after the
extension, link that folder in the extension once, and the whole campaign queues
itself. Nothing else is manual.

Two ideas drive the whole layout:

1. **Folder names = extension names.** `3-Meta-Planner-Scheduler/` belongs to the
   Meta Planner Scheduler extension, `4-LinkedIn-Campaign-Uploader/` to the LinkedIn
   extension, and so on. Media for one platform never gets mixed with another, so
   linking the right folder to the right extension is automatic.
2. **Day numbers in filenames do the matching.** Extensions 3, 4, and 5 scan every
   file in the linked folder and attach it to a campaign day by the `day`/`reel`
   number in its name. Subfolders are for human clarity only — matching never
   depends on them.

## The master folder layout

Create one parent folder per campaign, then one folder per extension inside it:

```
3SVerse-Social-Campaign/
│
├── 1-Facebook-Group-Posting/        ← Extension 1: manual paste, one media file
│   ├── caption.txt                    full caption incl. hashtags (paste into popup)
│   ├── hashtags.txt                   optional extra hashtag block
│   └── post-media.jpg                 optional: exactly ONE image (.jpg/.png/.webp)
│                                      or video (.mp4/.webm) — no file = text-only post
│
├── 2-Facebook-Live-Group-Poster/    ← Extension 2: text only, no media files
│   ├── live-link.txt                  the Facebook Live URL
│   ├── message.txt                    message shown above the link
│   └── hashtags.txt                   hashtags box content
│
├── 3-Meta-Planner-Scheduler/        ← Extension 3: Facebook Page + Instagram
│   ├── campaign.md                    the only .md file in this folder
│   ├── images/                        day-1.jpg  day-2.jpg …   (posts / stories)
│   └── videos/                        day-1.mp4  reel-2.mp4 …  (Reels)
│
├── 4-LinkedIn-Campaign-Uploader/    ← Extension 4: LinkedIn company page
│   ├── campaign.md
│   ├── images/                        day-1.jpg …   (image-post mode)
│   └── videos/                        day-1.mp4 …   (video-post mode)
│
└── 5-YouTube-Campaign-Uploader/     ← Extension 5: YouTube videos / Shorts
    ├── campaign.md
    └── videos/                        day-1.mp4 … day-30.mp4   (up to day-999)
```

Notes:

- Extensions 3/4/5 also accept **flat folders** — `images/` and `videos/` are
  optional because matching is purely by filename. Keeping them just makes large
  campaigns easier to audit before a run.
- Extensions 3/4/5 each support a **second folder slot**: when one AI produces
  videos and another produces images, keep them in separate folders and link both.
- Keep **one `campaign.md` per extension folder**. If you want identical captions
  everywhere, copy the same file into folders 3, 4, and 5. For platform-specific
  captions (recommended), have Prompt A below generate one variant per platform.
- Extensions 1 and 2 have no folder picker by design — their folders above are
  where your AI output lands, and you paste the three text pieces into the popup.
  Everything is saved between sessions, so it is a one-time paste per campaign.

## The one rule that matters: day numbers

A file is attached to campaign Day N by the **first** `day` or `reel` number found
in its filename:

| Filename            | Day | Result                          |
|---------------------|-----|---------------------------------|
| `day-1.mp4`         | 1   | Day 1 video                     |
| `day_2.jpg`         | 2   | Day 2 image                     |
| `reel-3.mp4`        | 3   | Day 3 video                     |
| `Day 4.png`         | 4   | Day 4 image                     |
| `day-30-final.mp4`  | 30  | Day 30 video (suffix ignored)   |
| `holiday-post.mp4`  | —   | **ignored** — no day number     |

- Valid range: **1–99** for extensions 3 and 4, **1–999** for extension 5.
- At most **one video and one image per day**. If two files carry the same day
  number, the last file scanned silently replaces the first — avoid duplicates.
- Files without a day number never enter the queue for extensions 3/4/5, and a day
  whose media is missing simply does not enter that extension's queue.
- Only these file types are picked up at all:
  **.md, .png, .jpg/.jpeg, .webp, .gif, .mp4, .mov, .webm, .m4v** —
  PDFs, ZIPs, DOCX, AI chat exports, etc. inside the folder are skipped.

## campaign.md — the caption source (extensions 3, 4, 5)

Each day block starts with `## Day N — Title`. Everything after the heading until
`---` (or the next `## Day` heading) is that day's caption:

```markdown
## Day 1 — Stop Losing Rebates

Your caption line one.
Your caption line two.

#3SVerse #VidaPay #Rebates

---

## Day 2 — The Rebate Trap
…
```

Rules the parser enforces (verified against the extension code):

- Day headings must look like `## Day 7 — Title` (a plain `-` separator also works).
- **Hashtags are ordinary caption lines.** Put them on the last line of each block —
  they stay in the caption. On YouTube they are additionally extracted automatically
  as the video's tags, and the Day title becomes the video title (first 100 characters).
- These line types are auto-filtered out of captions, so an AI may include them
  freely without breaking the post:
  - lines starting with `![` (Markdown image markup)
  - lines starting with `[image]`, `[video]`, `[reel]`, `[creative]`
  - annotation lines: `**Campaign stage:**`, `**Creative hook:**`, `**CTA:**`,
    `**Image:**`, `**Video:**`, `**Reel:**`
- Paragraph breaks are preserved exactly — blank lines matter.
- Keep exactly **one** `.md` containing `## Day` headings per extension folder. The
  scanner uses the first one it finds; stray Markdown notes in the same folder can
  hijack the campaign.

## What each extension consumes

| # | Extension | Reads from its folder | Media types | Day range | Queue behavior |
|---|-----------|----------------------|-------------|-----------|----------------|
| 1 | Facebook Group Posting | `caption.txt` + `hashtags.txt` + one media file (manual paste) | any image; `.mp4`/`.webm` video | — | text-only post when no media is chosen |
| 2 | Facebook Live Group Poster | `live-link.txt` + `message.txt` + `hashtags.txt` (manual paste) | none | — | link + text + hashtags posts only |
| 3 | Meta Planner Scheduler | `campaign.md` captions + videos + images | video `.mp4/.mov/.webm`; image `.png/.jpg/.jpeg/.webp` | 1–99 | Reel = day video, post = day image, Story = image or video; per-type checkboxes |
| 4 | LinkedIn Campaign Uploader | `campaign.md` captions + images or videos | video `.mp4/.mov/.webm/.m4v`; image `.png/.jpg/.jpeg/.webp` | 1–99 | one post per day; choose Images or Videos mode before starting |
| 5 | YouTube Campaign Uploader | `campaign.md` captions + videos only | video `.mp4/.mov/.webm/.m4v` | 1–999 | Day title → video title, hashtags → video tags, one upload per day |

Recommended media specs (safe on every platform):

- Reels / Shorts / Stories video: **9:16 vertical, 1080×1920, MP4 (H.264 + AAC),
  15–60 seconds**.
- Feed images: **1080×1350 (4:5) JPG or PNG**. Story images: 1080×1920.
- LinkedIn video also accepts 1:1 or 16:9; vertical 9:16 works there too.

## Copy-paste AI prompts

Fill the bracket placeholders once, then paste the prompt into any AI. Save every
output under the exact filenames from the tree above.

**Placeholders:** `[BUSINESS]` = brand name · `[DAYS]` = campaign length (e.g. 30) ·
`[TOPIC]` = what the campaign sells or says · `[TONE]` = voice (e.g. bold, friendly) ·
`[WEBSITE]` = link to include.

### Prompt A — generate `campaign.md` (any text AI)

```text
You are the content strategist for [BUSINESS]. Write a [DAYS]-day social media
campaign about [TOPIC]. Tone: [TONE].

Output ONE Markdown document and nothing else, formatted exactly like this:

## Day 1 — <punchy title, max 8 words>

<caption body: 2–5 short plain-text lines, blank line between thoughts>

#<hashtag1> #<hashtag2> #<hashtag3>

---

(repeat for Day 1 through Day [DAYS], in order)

Hard rules:
- Headings are exactly "## Day N — Title" with N from 1 to [DAYS].
- Captions are plain text: no Markdown bold, links, or lists.
- Mention [WEBSITE] naturally at least every third day.
- Each day ends with one hashtag line (8–12 hashtags, letters/numbers/underscores
  only, no commas). Vary the hashtags per day — never repeat the identical block.
- You may add optional production notes as separate lines starting with
  [image], [video], or **CTA:** — they are filtered out automatically.
```

### Prompt B — per-day image prompts (any image AI)

```text
Using the campaign below, write one image-generation prompt per day for [BUSINESS].

For each day output exactly one block:

Day <N> — save as: day-<N>.jpg
Prompt: <one paragraph: subject, setting, brand colors, mood, and any on-image
text of max 5 words>

Rules:
- Vertical or square compositions (4:5 or 1:1) with space for a text overlay.
- Consistent palette across all [DAYS] days: <your 2–3 brand colors>.
- Photorealistic or clean branded graphic style; no other brands' logos, no
  watermarks, no recognizable faces without consent.

(paste your campaign.md below)
```

### Prompt C — per-day video prompts (any video AI: Veo, Sora, Runway…)

```text
Using the campaign below, write one video-generation prompt per day for [BUSINESS].

For each day output exactly one block:

Day <N> — save as: day-<N>.mp4
Prompt: <one paragraph: vertical 9:16 scene, subject, camera motion, on-screen
text, and a visual hook in the first 2 seconds; 15–45 seconds total>

Rules:
- Vertical 9:16, 1080×1920, no speech or narration needed — the caption comes
  from campaign.md.
- Hook within the first 2 seconds; one idea per video; strong final frame.
- No burned-in captions, no other brands, no watermarks.

(paste your campaign.md below)
```

### Prompt D — fresh hashtag packs

```text
Give me [DAYS] hashtag lines for [BUSINESS] about [TOPIC]. One line per day,
formatted exactly as "#tag1 #tag2 …" with 8–12 hashtags each. Mix per line:
3–4 broad-reach tags, 4–5 niche tags, 1–2 branded tags (include #3SVerse).
No two lines identical. Letters, numbers, underscores only.
```

### Prompt E — one-shot campaign planner

```text
Do all of the following for [BUSINESS]: a [DAYS]-day campaign on [TOPIC],
tone [TONE].

1. Output the complete campaign.md (format: "## Day N — Title" headings,
   plain-text captions, one hashtag line per day, --- separators).
2. Then a per-day image prompt list (save each as day-N.jpg).
3. Then a per-day vertical video prompt list (save each as day-N.mp4).
4. Then a placement checklist telling me exactly which generated files go into
   3-Meta-Planner-Scheduler/, 4-LinkedIn-Campaign-Uploader/, and
   5-YouTube-Campaign-Uploader/ from the 3SVerse-Social-Campaign folder.
```

## End-to-end workflow

1. Create the `3SVerse-Social-Campaign/` tree above (any empty folders 1 and 2 as
   text placeholders).
2. Run Prompt E (or A → B → C → D) in any AI. Copy the Markdown block to
   `campaign.md` in folders 3, 4, and 5 (same file or per-platform variants).
3. Feed each Day N image prompt into your image AI and save the download as
   `day-N.jpg` in the extension's `images/` folder. Same for video prompts →
   `day-N.mp4` in `videos/`.
4. Rename anything the AI named differently so it matches `day-N.ext` exactly.
5. Fill folders 1 and 2 text files from the same campaign output.
6. Load unpacked extensions, run the installer batch file once if you have not
   already, then link each extension to its own numbered folder (and the second
   slot to a split-media folder if you used one).
7. Review each queue preview (days without the needed media are skipped, nothing
   half-schedules), pick start date/time, and start each campaign.

## Do / Don't checklist

- DO name files `day-1.mp4`, `day_2.jpg`, `reel-3.mp4` — one video + one image max per day.
- DO keep one `## Day`-bearing `.md` per extension folder; copy it to all three if captions are shared.
- DO keep the folder structure: one numbered folder per extension, named after it.
- DON'T put PDFs, ZIPs, chat exports, or numberless filenames in extension folders — they are ignored at best, hijack the Markdown at worst.
- DON'T reuse one day number twice in the same folder (last file scanned wins silently).
- DON'T exceed Day 99 for Meta/LinkedIn media (Day 999 for YouTube).
- DON'T delete extension source folders after Load unpacked — load from the permanent copy the installer created under `%LOCALAPPDATA%\3SVerse\Extensions\` instead.
