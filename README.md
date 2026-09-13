# VSC Execute

Execute Luau/Lua scripts from VSCode directly in your Roblox executor (built for [Potassium](https://docs.potassium.pro/)) over a local WebSocket.

## Features

- A status bar button in the **bottom left** of VSCode, visible whenever a `.lua` / `.luau` file is open.
- While no executor is connected the button reads **Not Connected**. Click it to open a setup menu:
  - **Auto-Execute** - scans `%LOCALAPPDATA%` (bounded) for folders named `Auto-Execute` (or the names in the `vscExecute.autoExecFolderNames` setting) and installs the connect script into every match.
  - **Copy Connect Script** - copies the connect script to your clipboard so you can place it manually.
- Once the executor connects, the button reads **Execute** (next to a lazy-loading **Execute** icon). Click it to send the current file's contents over the WebSocket; the executor `loadstring`s and runs it.

## How it works

1. The extension starts a local WebSocket server (`ws://127.0.0.1:<port>`, default **29999**).
2. The connect script (installed into an auto-exec folder or copied manually) makes the executor connect to that server when a game loads, using Lua's `WebSocket.connect`.
3. Clicking **Execute** sends the text of the active file as a single WebSocket message; the connect script `loadstring`s it on the executor side.

## Install & run from source

```powershell
npm install
```

Press **F5** in VSCode to launch the Extension Development Host (the `npm: watch` build task runs automatically).

To build a `.vsix`:

```powershell
npm run package
```

## Usage

1. Open a `.lua` / `.luau` file. The status bar button appears (bottom left, shows **Not Connected**).
2. Click it and pick **Auto-Execute**. The extension installs `VSCE-Execute.luau` into each auto-exec folder found under `%LOCALAPPDATA%`.
3. Open Roblox and inject/attach your executor so it runs its auto-exec scripts.
4. The button turns into **Execute** - click it to run your script. Editing is not needed; the unsaved buffer is what gets sent.

> No auto-exec folder found? Use **Copy Connect Script** and save the script to your executor's auto-exec location manually.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `vscExecute.port` | `29999` | Port the local WebSocket server listens on. If occupied, the next free port up to +5 is used. Update the connect script (reinstall/copy) after changing it. |
| `vscExecute.autoExecFolderNames` | `["Auto-Execute", ...]` | Folder names (case-insensitive) matched while scanning `%LOCALAPPDATA%`. |

## Notes & security

- The server binds to loopback only and speaks plain `ws://` so it works with executor sandboxes.
- The connect script echoes executor identity via `identifyexecutor()` so the extension can show which executor connected.
- Only scripts you click **Execute** on are ever sent; nothing is sent automatically.