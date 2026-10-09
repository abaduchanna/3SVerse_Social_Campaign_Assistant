# 3SVerse Social Campaign Assistant

A local-first Chrome extension that helps prepare Facebook group posts from the Chrome profile you are already signed into.

## What it does

- Accepts exact Facebook group names or group URLs separated by commas.
- Reuses an existing Facebook tab, or opens one if needed.
- Waits for slow pages, searches the exact group, opens the composer, fills the caption, and attaches the selected image or video.
- Remembers campaign progress and avoids silently posting duplicates.
- Stops before Facebook's final **Post** button so the account owner can review the group, rules, caption, and media.

## What it intentionally does not do

- It does not bypass Facebook login, account checks, rate limits, group rules, or moderation.
- It only presses Facebook's final Post button after you explicitly click **Post this prepared draft** for the reviewed group.
- It does not scrape members or collect personal data.
- It does not promise background posting. Facebook can throttle inactive tabs, so use **Open Facebook review tab** before posting.

## Install in Chrome

1. Download and unzip this repository.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and choose this folder.
5. Pin **3SVerse Social Campaign Assistant**.
6. Stay signed into Facebook in Chrome.

## Use

1. Enter exact group names, separated by commas.
2. Paste one approved campaign caption.
3. Choose its image or video.
4. Click **Save campaign**.
5. Click **Start / prepare next group** once. The assistant automatically resumes through Facebook search and group-page navigation, including slower page loads.
6. Click **Open Facebook review tab** and check the group rules, destination, caption and media.
7. Return to the extension and click **Post this prepared draft**. The campaign advances only after Facebook closes the composer.
7. Return to the extension for the next group.

If the file chooser says **No file chosen**, the assistant deliberately prepares a text-only post. Select the reel again before starting the next group if you want media attached; Chrome does not allow an extension to retain a local file selection after its popup closes.

Version 1.0.2 recognizes Facebook's current group-search cards by their profile-photo accessibility label, opens the exact result, and verifies the destination from the group page title before preparing the composer.

Version 1.0.3 scopes text entry to Facebook's active **Create post** dialog, ignores the covered background-feed textbox, prevents duplicate caption insertion, and confirms the dialog's Post button is enabled before marking a group prepared.

Version 1.0.4 replaces any stale draft instead of appending to it, inserts caption line breaks explicitly, scopes the file input to the active **Create post** dialog, and waits for a visible media preview before marking a reel or image as attached.

Version 1.0.5 adds a separate **Post this prepared draft** confirmation button. It publishes the currently reviewed Facebook composer—even while the Facebook tab is unfocused—and advances the campaign only after Facebook closes the composer. Each group still requires an explicit click after review.

Meta Business Suite remains the recommended scheduler for Facebook Page and Instagram posts. YouTube Studio remains the recommended scheduler for YouTube. Facebook does not provide a dependable public API for automatically posting to every group a personal account has joined.

## Privacy

Campaign text and progress are stored only in Chrome's local extension storage. Selected media stays local and is passed directly to the Facebook composer. No 3SVerse server receives Facebook credentials or content.

## License

MIT © 2026 3SVerse
