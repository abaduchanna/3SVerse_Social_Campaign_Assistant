# 3SVerse Social Campaign Assistant

Five local-first Chrome extensions in one repository that publish the same campaign everywhere 3SVerse posts: Facebook groups, Facebook Live destinations, the Facebook Page + Instagram (Meta Business Suite), the LinkedIn company page, and the 3SVerse YouTube channel. Nothing leaves the machine except what Facebook, LinkedIn, Meta, and YouTube themselves publish — no 3SVerse server ever sees credentials, captions, or media.

**Folder automation:** [CAMPAIGN-FOLDERS.md](CAMPAIGN-FOLDERS.md) defines the exact per-extension folder layout (one folder per extension, named after it) plus copy-paste prompts that make any AI produce the videos, images, captions, and hashtags ready to drop in.

## The five extensions at a glance

| # | Extension | Folder in this repo | What it publishes | Where it posts | Content source |
|---|-----------|--------------------|-------------------|----------------|----------------|
| 1 | **Facebook Group Posting** v1.6.0 | root | Caption text + hashtags + any number of images and/or videos | Every joined Facebook group the operator ticks | Manual paste + multi-file picker |
| 2 | **Facebook Live Group Poster** v1.3.0 | `facebook-live-group-poster/` | A Facebook Live link + saved message + hashtags | A saved selection of joined groups | Manual paste (no media files) |
| 3 | **Meta Planner Scheduler** v1.6.0 | `meta-planner-scheduler/` | Day-matched Reels (videos), image posts, and Stories | Facebook Page + Instagram via Meta Business Suite Planner | Campaign folder (Markdown + media) |
| 4 | **LinkedIn Campaign Uploader** v1.3.0 | `linkedin-campaign-uploader/` | One day-matched image **or** video post per day | 3S Verse LinkedIn company page | Campaign folder (Markdown + media) |
| 5 | **YouTube Campaign Uploader** v1.2.0 | `youtube-campaign-uploader/` | One day-matched video or Short per day | The verified 3S Verse YouTube channel | Campaign folder (Markdown + videos) |

Every extension reads its version from its own `manifest.json` and shows it in the footer, so the popup always proves which build is loaded.

## How the work is divided: text, hashtags, files, posting

**Text.** Extensions 1 and 2 take the message from a textarea the operator pastes into. Extensions 3, 4, and 5 never ask for text — they read it from the campaign Markdown: every `## Day N — Title` block becomes one scheduled post, and the block's lines (after removing image markup and `**Campaign stage:**`-style annotations) become the caption. Paragraph breaks are preserved exactly.

**Hashtags.** Hashtags are ordinary caption lines everywhere. Paste them at the end of the caption for extensions 1, 3, 4, and 5. Extension 2 has a separate hashtags box because its message and link layout is fixed; both boxes are saved so the next campaign starts with the last used text.

**File picking.**
- Extension 1 uses a multi-file picker (any number of images and `mp4`/`webm` videos — Ctrl+click or drag to select several). Every selected group receives ALL chosen files in one post. No file chosen means a text-only post. The chosen media is stored in extension storage immediately and survives popup closes.
- Extension 2 needs no files at all — Live posts are link + text + hashtags only.
- Extensions 3, 4, and 5 use folder pickers (`webkitdirectory`): link one campaign folder, or a second one when media is split across two folders. Every file inside is scanned, so `images/` and `videos/` subfolders are welcome but not required — media is matched by day number in the filename.

**Posting.** All five follow the same discipline: nothing posts until the operator explicitly clicks the start button; each destination is handled one at a time; progress is persisted locally so a closed popup never loses position; the run stops on the first error instead of duplicating; and a Stop button ends the campaign before the next destination.

## Campaign folder — what goes in it

Extensions 3, 4, and 5 are driven by one folder (or two). Build it like this:

```
3SVerse_30_Day_Social_Campaign_Bundle/
├── campaign.md            ← the first .md containing "## Day N" headings is used
├── day-1.mp4              ← Reel / video for Day 1
├── day-1.jpg              ← image for Day 1 (post / story)
├── reel-2.mp4             ← "reel" prefix matches too
├── day-2.jpg
└── ...                    ← or organize into images/ and videos/ subfolders;
                              files are matched by name, so folders are optional
```

**The Markdown.** Each day is a `## Day N — Title` heading. Everything after the heading until `---` (or the next Day heading) is the caption for that day:

```markdown
## Day 1 — Stop Losing Rebates

Your caption line one.
Your caption line two.

#3SVerse #VidaPay #Rebates

---
```

Lines that start with `![` (image markup), `[image]`/`[video]`/`[reel]`/`[creative]` tags, or `**Campaign stage:**`/`**Creative hook:**`/`**CTA:**` annotations are filtered out of the caption automatically. Hashtag lines stay in.

**The media names.** A media file is matched to a day by the first `day`/`reel` number found in its filename: `day-1.mp4`, `day_2.jpg`, `reel-3.mp4`, `Day 4.png` all work (numbers 1–99; YouTube accepts up to 999). Media with no day number in the name is ignored, and a Day whose media is missing simply does not enter that extension's queue.

**Who consumes what:**

| Extension | Reads | Queue rule |
|-----------|-------|-----------|
| Meta Planner Scheduler | Day captions + videos (Reels) + images (posts/Stories) | Per day: Reel if the checkbox is on and a video exists; image post if an image exists; Story from either |
| LinkedIn Campaign Uploader | Day captions + one chosen type (Images or Videos) | One post per day, using the day's image or video for the selected type |
| YouTube Campaign Uploader | Day captions + videos only | One video or Short per day |

**Dates.** The chosen start date belongs to the first day in the queue — resuming at Day 2 schedules Day 2 on the start date itself, not a day later. Each entry lands on start date + (day − first queued day) at the chosen time (default 09:00; the first day can take a different time in Meta).

## Workflows

### 1. Facebook Group Posting (root)

1. Pin the extension and stay signed into Facebook in Chrome.
2. Paste the campaign caption (hashtags included) and optionally pick any number of images/videos (Ctrl+click for multiple).
3. Click **Import joined groups** — the background opens Facebook **Your groups**, scrolls the complete list, resolves every direct group URL, and fills the checklist. The list and the checked/unchecked ticks are saved in the background, so closing the popup never loses them, and re-importing keeps the operator's selection while adding newly found groups.
4. Filter with the search box, tick stores individually or with **Select all visible**.
5. Click **Start auto-post campaign** once. The worker opens each selected group by its direct URL, clears stale drafts, inserts the caption with paragraph breaks, attaches and verifies the media, publishes, waits 12 seconds, and continues. It stops on the first error; **Open Facebook review tab** shows progress and **Stop campaign** halts before the next group.
6. No picker selection means text-only posts; the stored-media card lists every saved file with Replace/Clear buttons.

### 2. Facebook Live Group Poster

1. Enter the Facebook Live link, the message above it, and the hashtags.
2. **Import / refresh Your groups** fills the joined-groups checklist; **Save group selection** stores the exact ticked groups so future campaigns reuse them untouched.
3. **Start selected-groups campaign** posts the link + text + hashtags only to the saved destinations, one group at a time, stopping on the first error. The live link, message, and hashtags are also saved between sessions.

### 3. Meta Planner Scheduler

1. Link campaign folder 1 (and folder 2 when the campaign is split).
2. Tick the content types to schedule — Reels, image posts, Stories — pick the start date and time, and resume at any Day.
3. Review the queue preview, then start: the extension drives Meta Business Suite Planner, sets both platform date fields, and activates Schedule reliably (with retries) before moving on. Days without the required media are skipped in the preview so nothing is half-scheduled.

### 4. LinkedIn Campaign Uploader

1. Link the campaign folder(s) and choose daily Images or Videos.
2. The queue shows one day-matched post per day with the complete caption and hashtags from the Markdown.
3. Start to schedule each post on the 3S Verse company page through LinkedIn's native composer and uploader.

### 5. YouTube Campaign Uploader

1. Link the campaign folder(s) containing the Markdown and day-named videos.
2. The queue shows one video or Short per day with its caption.
3. Start to upload and schedule each video on the verified 3S Verse channel through YouTube Studio, one upload at a time with persistent daily progress.

## Saved state and persistence (Downloads-deletion safe)

- **Joined-groups lists** (extensions 1 and 2) persist in background `chrome.storage` the moment an import finishes — the popup merely mirrors it. Owner can close the popup, scroll Facebook, or restart Chrome; reopening shows the full checklist with previous ticks intact. Re-import merges instead of discarding.
- **Campaign media in extension 1** is stored in extension storage for the running campaign and survives popup/panel restarts.
- **Campaign files in extensions 3, 4, and 5** are copied into an IndexedDB vault (`3sverseAssetVaultV1`) the moment a folder is linked. The Markdown, images, and videos all live inside the extension, so the original folder can be deleted from `Downloads` afterwards and the queue still rebuilds completely on the next app open. Relinking a folder replaces that slot's copies; **Clear saved file copies** wipes the vault on demand. Unchanged files are skipped by size + modification time so relinking is fast.
- Campaign text, progress, and selections are stored only in Chrome's local extension storage. No 3SVerse server receives Facebook, LinkedIn, Meta, or YouTube credentials or content.

## Install in Chrome

1. Download and unzip this repository (or load any subfolder separately — each extension is self-contained).
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the extension folder:
   - root folder → Facebook Group Posting
   - `facebook-live-group-poster/` → Facebook Live Group Poster
   - `meta-planner-scheduler/` → Meta Planner Scheduler
   - `linkedin-campaign-uploader/` → LinkedIn Campaign Uploader
   - `youtube-campaign-uploader/` → YouTube Campaign Uploader
3. Pin all five and stay signed into the matching site in Chrome.

## What the assistant intentionally does not do

- It does not bypass Facebook, LinkedIn, Meta, or YouTube login, account checks, rate limits, group rules, or moderation.
- It only publishes after an explicit start click for the displayed campaign.
- It does not scrape members or collect personal data.
- It cannot bypass platform throttling or future layout changes; errors stop the campaign and remain visible in the popup.

## Recent versions

- **FB Group Posting v1.6.0** — multi-file media (all selected photos/videos go to every group), 12-second gap between groups (was 30s), background persistence for the joined-groups checklist (popup-close no longer loses the list; ticks survive re-import); manifest-driven footer version.
- **FB Live Poster v1.3.0** — same background persistence for its saved selection and content.
- **Meta v1.6.0 / LinkedIn v1.3.0 / YouTube v1.2.0** — campaign folders copied into the IndexedDB asset vault (Downloads deletion safe), automatic queue rebuild from the vault, Clear saved file copies button.
- **FB Group Posting v1.4.0** — virtualized-list harvest step-scrolls Facebook's group window so very large lists import completely, with partial-import merge.

## License

MIT © 2026 3SVerse

---

**Folder automation:** see [CAMPAIGN-FOLDERS.md](CAMPAIGN-FOLDERS.md) for the per-extension folder layout, day-number file-naming rules, and copy-paste AI generation prompts.
