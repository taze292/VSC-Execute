# VSC Execute

Execute Luau/Lua scripts from VSCode directly in your Roblox executor (built for [Potassium](https://docs.potassium.pro/)) over a local WebSocket.

## Features

- A status bar button in the **bottom left** of VSCode, visible whenever a `.lua` / `.luau` file is open.
- While no executor is connected the button reads **Not Connected**. Click it to open a setup menu:
  - **Auto-Execute** - scans `%LOCALAPPDATA%` (bounded) for folders named `Auto-Execute` (or the names in the `vscExecute.autoExecFolderNames` setting) and installs the connect script into every match.
  - **Uninstall Auto-Execute** - removes the installed connect script (`VSCE-Execute.luau`) from every auto-exec folder it finds (it stops running the next time the game loads).
  - **Copy Connect Script** - copies the connect script to your clipboard so you can place it manually.
  - **Output** - toggle (off by default) whether the connect script prints its own status/error messages (`[VSC Execute] Connected to VSCode...`, `Failed to compile script...`, etc.) in the executor console. Applies immediately to connected executors - no reinstall needed. This never affects `print`/`warn` calls in scripts you run.
  - **Notifications** - toggle (on by default) the VSCode toast notifications that appear bottom-right (connected / disconnected / sent events).
- Once the executor connects, the button reads **Execute** (next to a lazy-loading **Execute** icon). Click it to send the current file's contents over the WebSocket; the executor `loadstring`s and runs it.
- **Multiple VSCode windows work together.** The first window you open becomes the "leader" and owns the WebSocket port; every other VSCode window becomes a follower that routes its Execute button through the leader. No matter which window you send from, it reaches the executor, and the connection status stays in sync across all windows. If the leader window closes, another window takes over automatically and the executor reconnects on its own.

## How it works

1. The extension starts a local WebSocket server (`ws://127.0.0.1:<port>`, default **29999**). Only one VSCode window runs this server at a time; other windows connect to it over a private IPC channel (`<port> + 7`) decided via a heartbeat file in the extension's global storage.
2. The connect script (installed into an auto-exec folder or copied manually) makes the executor connect to that server when a game loads, using Lua's `WebSocket.connect`.
3. Clicking **Execute** sends the text of the active file as a single WebSocket message; the connect script `loadstring`s it on the executor side. From a follower window, the script is relayed to the leader first, which forwards it to the executor.

## Install & run from source

```powershell
npm install
```

Press **F5** in VSCode to launch the Extension Development Host (the `npm: watch` build task runs automatically).

To build a `.vsix`:

```powershell
npm run package
```

> A prebuilt `vsc-execute-<version>.vsix` is committed in the repository root, so you can grab it and use `Extensions: Install from VSIX...` instead of building yourself.

## Usage

1. Open a `.lua` / `.luau` file. The status bar button appears (bottom left, shows **Not Connected**).
2. Click it and pick **Auto-Execute**. The extension installs `VSCE-Execute.luau` into each auto-exec folder found under `%LOCALAPPDATA%`.
3. Open Roblox and inject/attach your executor so it runs its auto-exec scripts.
4. The button turns into **Execute** - click it to run your script. Editing is not needed; the unsaved buffer is what gets sent.

> No auto-exec folder found? Use **Copy Connect Script** and save the script to your executor's auto-exec location manually.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `vscExecute.port` | `29999` | Port the leader window's WebSocket server listens on. Binds exactly this port (freed port + 7 is used internally for window-to-window IPC). If it's taken by another program, the extension shows an error - change this setting to resolve. Update the connect script (reinstall/copy) after changing it. |
| `vscExecute.autoExecFolderNames` | `["Auto-Execute", ...]` | Folder names (case-insensitive) matched while scanning `%LOCALAPPDATA%`. |
| `vscExecute.showOutput` | `false` | Whether the connect script prints its own status/error messages (`[VSC Execute] ...`) in the executor console. Applies live to connected executors (reinstall the connect script once after upgrading to get live toggling). Your scripts' `print`/`warn` calls are never suppressed. |
| `vscExecute.showNotifications` | `true` | Whether VSCode shows toast notifications (bottom-right) for connect/disconnect and sends. Toggle from the setup menu. |

## Notes & security

- The server binds to loopback only and speaks plain `ws://` so it works with executor sandboxes.
- The connect script echoes executor identity via `identifyexecutor()` so the extension can show which executor connected.
- Only scripts you click **Execute** on are ever sent; nothing is sent automatically.