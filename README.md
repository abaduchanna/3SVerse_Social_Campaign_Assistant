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
- It does not press the final Post button.
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
6. Click **Open Facebook review tab**, check the group rules and draft, then press Facebook's Post button yourself.
7. Return to the extension for the next group.

If the file chooser says **No file chosen**, the assistant deliberately prepares a text-only post. Select the reel again before starting the next group if you want media attached; Chrome does not allow an extension to retain a local file selection after its popup closes.

Meta Business Suite remains the recommended scheduler for Facebook Page and Instagram posts. YouTube Studio remains the recommended scheduler for YouTube. Facebook does not provide a dependable public API for automatically posting to every group a personal account has joined.

## Privacy

Campaign text and progress are stored only in Chrome's local extension storage. Selected media stays local and is passed directly to the Facebook composer. No 3SVerse server receives Facebook credentials or content.

## License

MIT © 2026 3SVerse
