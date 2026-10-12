# 3SVerse LinkedIn Campaign Uploader

Separate Chrome extension for the **3S Verse LinkedIn company page**. It does not modify the Meta Planner Scheduler.

## What it does

- Links one campaign folder, or two when captions and media are split.
- Reads complete `## Day N` captions and keeps their hashtags on separate lines.
- Matches `day-10.png` and `3SVerse-Reel-10.mp4` to Day 10.
- Supports image posts, video posts, or both.
- Uses the recorded LinkedIn company-page route and exact controls: **Create → Start a post → Add media → Next → Text editor → Post**.
- Waits for LinkedIn to complete media upload and to close/confirm the composer before moving to the next queue item.
- Opens the Published posts page after every successful item.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `linkedin-campaign-uploader` folder.
5. Pin the blue LinkedIn `in` icon.

## Use

1. Click the LinkedIn extension icon.
2. Link the folder containing the campaign Markdown and images. Link the second folder only when videos are separate.
3. Select Image posts and/or Video posts.
4. Select the starting campaign day and click **Post complete queue**.

The linked folder is the normal upload source. Windows paths are optional fallbacks only.

The extension publishes immediately because the supplied, verified LinkedIn flow ends at **Post**. It does not invent a scheduling flow that was not recorded.
