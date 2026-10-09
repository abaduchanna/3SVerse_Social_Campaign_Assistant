# 3SVerse Social Campaign Assistant

A local-first Chrome extension that posts a reviewed campaign sequentially to named Facebook groups from the Chrome profile you are already signed into.

## What it does

- Accepts exact Facebook group names or group URLs separated by commas.
- Reuses an existing Facebook tab, or opens one if needed.
- Waits for slow pages, searches the exact group, opens the composer, fills the caption, and attaches the selected image or video.
- Verifies the caption, selected media preview, and enabled Facebook **Post** button before publishing.
- Remembers posted progress, waits 30 seconds between groups, and stops on the first error to avoid duplicates.

## What it intentionally does not do

- It does not bypass Facebook login, account checks, rate limits, group rules, or moderation.
- It only starts publishing after you explicitly click **Start auto-post campaign** for the displayed group list, caption, and selected media.
- It does not scrape members or collect personal data.
- It cannot bypass Facebook throttling or future Facebook layout changes; errors stop the campaign and remain visible in the popup.

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
4. Click **Start auto-post campaign** once. This is confirmation to publish the displayed campaign.
5. Leave Chrome running. The assistant searches each group, replaces stale composer text, preserves paragraph breaks, attaches and verifies the chosen media when present, publishes, then waits 30 seconds before the next group.
6. Use **Open Facebook review tab** to watch progress or **Stop campaign** to stop before the next post.

If the file chooser says **No file chosen**, the full campaign is posted as text-only. A selected reel or image is stored locally for the running campaign and reused for every listed group.

Version 1.0.2 recognizes Facebook's current group-search cards by their profile-photo accessibility label, opens the exact result, and verifies the destination from the group page title before preparing the composer.

Version 1.0.3 scopes text entry to Facebook's active **Create post** dialog, ignores the covered background-feed textbox, prevents duplicate caption insertion, and confirms the dialog's Post button is enabled before marking a group prepared.

Version 1.0.4 replaces any stale draft instead of appending to it, inserts caption line breaks explicitly, scopes the file input to the active **Create post** dialog, and waits for a visible media preview before marking a reel or image as attached.

Version 1.0.5 adds a separate **Post this prepared draft** confirmation button. It publishes the currently reviewed Facebook composer—even while the Facebook tab is unfocused—and advances the campaign only after Facebook closes the composer. Each group still requires an explicit click after review.

Version 1.0.6 changes that flow to one-click sequential posting. **Start auto-post campaign** confirms the whole displayed campaign; the background worker posts one group at a time, waits 30 seconds, resumes through a Chrome alarm, persists progress locally, and stops on the first error. Facebook line breaks now use editor paragraphs rather than unsupported line-break insertion.

Version 1.0.7 replaces synthetic DOM caption typing with Chrome DevTools Protocol trusted input for Facebook's Lexical editor. The complete caption—including blank lines between the website and hashtags—is inserted in one operation and must pass an exact normalized-text check before media or posting continues. Selected media is saved immediately in local extension storage and remains available after the popup/panel is reopened or a Facebook error stops the campaign; the hint shows the stored filename even though browsers do not permit repopulating the native file chooser display.

Version 1.0.8 removes general Facebook search and every partial-name fallback from campaign routing. At Start, the assistant opens Facebook **Your groups**, scans and scrolls `All groups you've joined`, resolves every requested entry to an exact joined-group URL, and only then starts posting. A missing name stops the campaign. If multiple joined groups have the same exact name, it stops and lists their URLs so the owner can select the intended destination without guessing.

Meta Business Suite remains the recommended scheduler for Facebook Page and Instagram posts. YouTube Studio remains the recommended scheduler for YouTube. Facebook does not provide a dependable public API for automatically posting to every group a personal account has joined.

## Privacy

Campaign text and progress are stored only in Chrome's local extension storage. Selected media stays local and is passed directly to the Facebook composer. No 3SVerse server receives Facebook credentials or content.

## License

MIT © 2026 3SVerse
