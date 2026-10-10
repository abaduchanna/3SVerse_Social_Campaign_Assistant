# 3SVerse Meta Planner Scheduler

This Chrome extension is the Meta Business Suite companion inside the 3SVerse Social Campaign Assistant repository.

## Current live campaign workflow

- Folder count is flexible: select one folder when it contains everything, or select a second optional folder when text/images/videos are split.
- It finds the Markdown file containing `Day 1`, `Day 2`… sections and uses each section's main post text and hashtags.
- It pairs `day-01.png` images and `3SVerse-Reel-01.mp4` videos by day number.
- Default start is tomorrow at 9:00 AM in the computer's Central Time setting.
- Reels are enabled by default. Image posts and Stories are optional.
- It uses the detected 3SVerse Meta Planner URL and requires Meta's **Post to** selector to contain both Facebook and Instagram before continuing.
- Reels open directly in Meta's dedicated Reel Composer and are considered ready only after the upload, caption, Cancel, and Next controls are present. This avoids false timeouts when Meta changes Planner's intermediate menu page.
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
3. Leave **Facebook + Instagram Reels** selected for the current 30 MP4 campaign.
4. Click **Schedule complete queue** once.
5. Keep Chrome open. A dedicated, unfocused Meta Planner tab is used for the run.

Stories do not support an ordinary feed caption. The Story option schedules the selected day media; the Markdown caption is not inserted as a Story overlay.

## Privacy and limits

Files stay local until the operator starts scheduling. They are then uploaded directly to Meta Business Suite from the signed-in Chrome profile. The extension does not receive passwords, bypass Meta checks, or use a 3SVerse server.

MIT license (repository root).
