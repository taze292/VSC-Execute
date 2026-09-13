# VSC Execute

Execute Luau/Lua scripts from VSCode directly in your Roblox executor over a local WebSocket. Built for [Potassium](https://docs.potassium.pro/), works with any executor that supports `WebSocket.connect`.

## Install

No files to download by hand — just fetch and run the installer for your platform (it pulls the VSIX and installs it, nothing is kept on disk):

**Windows** (PowerShell)

```powershell
irm https://raw.githubusercontent.com/taze292/VSC-Execute/main/install.ps1 | iex
```

**Linux / macOS**

```sh
curl -fsSL https://raw.githubusercontent.com/taze292/VSC-Execute/main/install.sh | sh
```

Prefer to install by hand? From the repo root, run:

```powershell
code --install-extension vsc-execute-0.3.0.vsix
```

That's it — reload VS Code if prompted. (Manual GUI route: Extensions → **...** → **Install from VSIX...** → pick the file.)

## Requirements

- **Windows** 10 or 11.
- **VS Code** 1.85 or newer (latest recommended).
- A **Roblox executor** that supports:
  - `WebSocket.connect` (shared with the connect script below),
  - running Luau scripts (the connect script's `loadstring`),
  - auto-exec scripts **or** manual script placement (see [Quick start](#quick-start)).
- **Roblox** running so your executor can attach.

## Features

- A status bar button in the **bottom left** of VSCode, visible whenever a `.lua` / `.luau` file is open.
- While no executor is connected the button reads **Not Connected**. Click it to open a setup menu:
  - **Auto-Execute** - scans all of `%APPDATA%` (Local, LocalLow, and Roaming - bounded) for folders named `Auto-Execute` (or the names in the `vscExecute.autoExecFolderNames` setting) and installs the connect script into every match.
  - **Uninstall Auto-Execute** - removes the installed connect script (`VSCE-Execute.luau`) from every auto-exec folder it finds (it stops running the next time the game loads).
  - **Copy Connect Script** - copies the connect script to your clipboard so you can place it manually.
  - **Output** - toggle (off by default) whether the connect script prints its own status/error messages (`[VSC Execute] Connected to VSCode...`, `Failed to compile script...`, etc.) in the executor console. Applies immediately to connected executors - no reinstall needed. This never affects `print`/`warn` calls in scripts you run.
  - **Notifications** - toggle (on by default) the VSCode toast notifications that appear bottom-right (connected / disconnected / sent events).
- Once the executor connects, the button reads **Execute**. Click it to send the current file's contents over the WebSocket; the executor `loadstring`s and runs it. A **gear button** also appears in the status bar — click it at any time while connected to open the same settings menu (Auto-Execute, Output, Notifications, etc.) without interrupting execution. Toggles apply instantly; no reconnect needed.
- **Multiple VSCode windows work together.** The first window you open becomes the "leader" and owns the WebSocket port; every other window becomes a "follower" that routes its Execute button through the leader. No matter which window you send from, it reaches the executor, and connection status stays in sync everywhere. If the leader window closes, another window takes over automatically and the executor reconnects on its own.

## How it works

1. The extension starts a local WebSocket server (`ws://127.0.0.1:<port>`, default **29999**). Only one VSCode window runs this server at a time; other windows connect to it over a private IPC channel (`<port> + 7`), hand-picked via a heartbeat file in global storage.
2. The connect script (installed into an auto-exec folder or copied manually) makes the executor connect to that server when a game loads, using Lua's `WebSocket.connect`.
3. Clicking **Execute** sends the text of the active file as a single WebSocket message; the connect script `loadstring`s it on the executor side. From a follower window, the script is relayed to the leader first, which forwards it to the executor.

## Install

The easiest way is the prebuilt VSIX:

1. Grab `vsc-execute-<version>.vsix` from the repo root.
2. In VS Code, open **Extensions** (`Ctrl+Shift+X`), click **...** (**Views and More Actions**) and pick **Install from VSIX...**.
3. Select the downloaded file. Reload VS Code if prompted.

Or build from source:

```powershell
npm install
npm run package   # produces vsc-execute-<version>.vsix in the repo root
```

For development, press **F5** to launch the Extension Development Host (the `npm: watch` build task runs automatically).

## Quick start

1. Open a `.lua` / `.luau` file. The status bar button appears (bottom left, shows **Not Connected**).
2. Click it and pick **Auto-Execute**. The extension installs `VSCE-Execute.luau` into each auto-exec folder found under all of `%APPDATA%` (Local, LocalLow, and Roaming).
3. Open Roblox and inject/attach your executor so it runs its auto-exec scripts.
4. The button turns into **Execute** - click it to run your script. The unsaved buffer is what gets sent.

> No auto-exec folder found? Use **Copy Connect Script** and save the script to your executor's auto-exec location manually.

## Test your setup

Once the button reads **Execute**, verify the whole round trip with the bundled test script:

1. Open [`examples/connectivity-test.luau`](examples/connectivity-test.luau) in VS Code.
2. Click the bottom-left **Execute** button.
3. Open the console (**F9** in Roblox, or your executor's console) and look for:

   ```
   [VSC Execute] Connectivity test started
   [VSC Execute] Executor:  <your executor>
   [VSC Execute] PASSED - VS Code can reach this executor.
   ```

   If **PASSED** shows up, VSC Execute can send scripts to your executor. It only prints; it never touches the game.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Button still reads **Not Connected** after joining a game | Run the setup menu and pick **Auto-Execute** (or **Copy Connect Script**), then leave and rejoin the game. |
| Executor says `Could not reach VSCode at ws://127.0.0.1:29999` | VS Code isn't running with the extension, or the port doesn't match `vscExecute.port`. Recheck the connect script's `PORT`. |
| Connect script installed but nothing connects | Your executor may not support `WebSocket.connect`; VSC Execute needs that API. |
| Test script runs but prints nothing | `print` output hides in some executors - show **Output** toggle in the setup menu, or switch on the executor's own console. |

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `vscExecute.port` | `29999` | Port the leader window's WebSocket server listens on. Binds exactly this port (`port + 7` is used internally for window-to-window IPC). If it's taken by another program, the extension shows an error - change this setting to resolve. Update the connect script (reinstall/copy) after changing it. |
| `vscExecute.autoExecFolderNames` | `["Auto-Execute", ...]` | Folder names (case-insensitive) matched while scanning all of `%APPDATA%` (Local, LocalLow, and Roaming). |
| `vscExecute.showOutput` | `false` | Whether the connect script prints its own status/error messages (`[VSC Execute] ...`) in the executor console. Applies live to connected executors (reinstall the connect script once after upgrading to get live toggling). Your scripts' `print`/`warn` calls are never suppressed. |
| `vscExecute.showNotifications` | `true` | Whether VSCode shows toast notifications (bottom-right) for connect/disconnect and sends. Toggle from the setup menu. |

## Notes & security

- The server binds to loopback only and speaks plain `ws://` so it works with executor sandboxes.
- The connect script echoes executor identity via `identifyexecutor()` so the extension can show which executor connected.
- Only scripts you click **Execute** on are ever sent; nothing is sent automatically.