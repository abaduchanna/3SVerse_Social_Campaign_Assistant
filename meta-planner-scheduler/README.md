# 3SVerse Meta Planner Scheduler

This Chrome extension is the Meta Business Suite companion inside the 3SVerse Social Campaign Assistant repository.

## Current live campaign workflow

- Folder count is flexible: select one folder when it contains everything, or select a second optional folder when text/images/videos are split.
- It finds the Markdown file containing `Day 1`, `Day 2`… sections and uses each section's main post text and hashtags.
- It pairs `day-01.png` images and `3SVerse-Reel-01.mp4` videos by day number.
- Default start is tomorrow at 9:00 AM in the computer's Central Time setting.
- Reels are enabled by default. Image posts and Stories are optional.
- It uses the detected 3SVerse Meta Planner URL and requires Meta's **Post to** selector to contain both Facebook and Instagram before continuing.
- v1.1.0 uses Meta's real native upload chooser through Chrome's debugger bridge instead of waiting for a file input that Meta removes from the DOM. The parent path is saved once; linked folder selections continue to supply all filenames.
- v1.1.1 adds **Start from campaign day** so a verified/manual item can be skipped without duplicating it; dates still remain anchored to the campaign's Day 1 start date.
- v1.1.2 replaces the ambiguous single parent path with exact Folder 1 / Folder 2 paths, strips a duplicated selected root segment, and adds hard timeouts around chooser interception and native file assignment so Chrome's debugger is always detached on failure.
- v1.1.3 replaces the synthetic upload-button click with a trusted Chrome DevTools mouse click and falls back to a directly exposed file input when Meta does not emit its chooser event.
- v1.1.4 enters Meta's custom hour/minute spinbuttons with trusted digit key events (their HTML value is intentionally blank) and verifies the real `aria-valuenow` values before the final Schedule click.
- v1.1.5 no longer requires Meta to keep the local filename visible after processing. It detects the enabled Next/processed preview state and automatically reloads and retries an upload up to three times when Meta stalls at 0% or stops advancing.
- v1.2.0 replaces Meta's remaining synthetic Next, Story, Schedule-option and final Schedule clicks with trusted browser input. Every item now runs a date/time and caption preflight before the final Schedule click.
- v1.2.1 sends the selected media bytes directly to Meta using the same proven File/DataTransfer method as Social Campaign Assistant. Manual Windows paths and the native chooser are now optional fallback only.
- Facebook and Instagram receive separate verified date and time fields. A different Day 1 time is optional; every later day uses the daily time.
- Reel sharing to the connected Facebook Story is enabled before scheduling when Meta exposes that option. Campaign hashtags remain part of the verified caption.
- Reels open directly in Meta's dedicated Reel Composer and are considered ready only after the upload, caption, Cancel, and Next controls are present. This avoids false timeouts when Meta changes Planner's intermediate menu page.
- The current Meta account picker exposes its `combobox` semantics only through the accessibility tree, not through a literal DOM `role` attribute. The scheduler therefore anchors on the visible **Post to** heading and verifies Facebook + Instagram icons inside its smallest containing section.
- Each item stops on the first missing control, lost caption, upload error, or missing scheduling confirmation.

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this `meta-planner-scheduler` folder—not the repository root.
5. Click the extension icon to open its full-page dashboard.

## Use

1. Select one campaign folder. Select folder 2 only if the assets are split.
2. Check the queue count and dates.
3. Leave **Facebook + Instagram Reels** selected, and enable image posts/Stories when required. The Windows-path fields under **Advanced upload fallback** are optional.
4. Click **Schedule complete queue** once.
5. Keep Chrome open. A dedicated, unfocused Meta Planner tab is used for the run.

Stories do not support an ordinary feed caption. The Story option schedules the selected day media; the Markdown caption is not inserted as a Story overlay.

## Privacy and limits

Files stay local until the operator starts scheduling. They are then uploaded directly to Meta Business Suite from the signed-in Chrome profile. The extension does not receive passwords, bypass Meta checks, or use a 3SVerse server.

MIT license (repository root).
