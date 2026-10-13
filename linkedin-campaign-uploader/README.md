# 3SVerse LinkedIn Campaign Uploader

Version 1.1.5 schedules exactly one LinkedIn company-page post per campaign day. It commits the schedule date/time first, returns to the scheduled composer, and only then inserts and verifies the complete caption and hashtags before the final Schedule click. This prevents LinkedIn from clearing text while schedule mode is being selected. The exact caption editor and date/time inputs are focus-locked before trusted keyboard entry. The time suggestion is explicitly selected with Arrow Down + Enter so LinkedIn's summary and internal validation state both update. It uses LinkedIn's composer-level **Schedule post** dialog; it does not claim LinkedIn has a separate Planner or queue. The native file chooser remains intercepted, so no Windows Explorer popup is left open.

Separate Chrome extension for the **3S Verse LinkedIn company page**. It does not modify the Meta Planner Scheduler.

## What it does

- Links one campaign folder, or two when captions and media are split.
- Reads complete `## Day N` captions and keeps their hashtags on separate lines.
- Matches `day-10.png` and `3SVerse-Reel-10.mp4` to Day 10.
- Selects either the daily campaign images or the daily campaign videos, producing one post per Day entry—not duplicate image and video posts.
- Uses the inspected LinkedIn company-page route and exact controls: **Create → Start a post → Add media → Next → Schedule post → Date/Time → Next → Text + hashtags → verify → final Schedule**.
- Day 1 uses the selected start date/time, Day 2 uses the next date at the same time, and so on.
- Waits for LinkedIn to confirm each scheduled post before preparing the next campaign day.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `linkedin-campaign-uploader` folder.
5. Pin the blue LinkedIn `in` icon.

## Use

1. Click the LinkedIn extension icon.
2. Link the folder containing the campaign Markdown and images. Link the second folder only when videos are separate.
3. Select daily campaign Images or Videos.
4. Select the starting campaign day, start date, and daily time.
5. Click **Schedule all daily posts**.

The linked folder is the normal upload source. Windows paths are optional fallbacks only.

The extension uses LinkedIn's live-inspected `Schedule post` fields (`Date`, `Time`, `Next`) and final `Schedule` action.
