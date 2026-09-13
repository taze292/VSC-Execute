# Testing VSC Execute

Two ways to test: an **automated** integration test, and a **manual** end-to-end test with a fake executor.

## Quick automated test

From the project root:

```powershell
npm test
```

This bundles `src/wsServer.ts`, starts the WebSocket server on an isolated port (32123),
launches `tests/mock-executor.mjs`, waits for it to connect, sends a script, and confirms the
mock received it and saved it to `tests/received/`. Prints `PASS` on success.

## Manual test (simulate the executor)

The extension itself runs inside the VSCode Extension Development Host - use this to click
through the real UI.

1. Open this project in VSCode and press **F5** (Extension Development Host opens).
2. In the dev window open a script from `tests/sample-scripts/` - the status bar button
   appears bottom-left showing **Not Connected**.
3. Start the fake executor (from the project root, so it picks up `ws` from `node_modules`):

   ```powershell
   node tests/mock-executor.mjs
   ```

   It connects to `ws://127.0.0.1:29999`, announces itself, and saves every script it
   receives to `tests/received/`.
4. The button flips to **Execute <filename>**. Click it - the mock prints a preview of what
   it received and saves the full file to `tests/received/`.
5. While the mock is connected, try the setup menu too: the button only shows the menu when
   no executor is connected, so kill the mock (Ctrl+C in its terminal) *first*, then click
   the **Not Connected** button:
   - **Auto-Execute** - scans all of `%APPDATA%` for auto-exec folders and installs
     `VSCE-Execute.luau` into each; VSCode reports how many folders it wrote to.
   - **Copy Connect Script** - copies the connect script (same as `tests/connect-script.luau`)
     to your clipboard.

## Manual test (real executor / Potassium)

1. With no mock running, open a sample script and click the **Not Connected** button.
2. Pick **Auto-Execute** (or **Copy Connect Script** and save it to your executor's auto-exec
   location yourself).
3. Open Roblox with your executor attached so its auto-exec scripts run.
4. The button flips to **Execute** - click it to run the sample script in-game
   (`hello.lua` prints your player name to the console).

## Notes

- The extension listens on `ws://127.0.0.1:29999` by default (next free port is used if busy).
  If it is busy, see the button tooltip for the actual port and pass it to the mock:
  `node tests/mock-executor.mjs <port>`.
- Received scripts accumulate in `tests/received/` - delete the folder whenever.