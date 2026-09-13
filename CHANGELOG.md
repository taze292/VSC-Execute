# Change Log

## 0.3.0

- **Fetch-and-run installers.** The README's **Install** section now leads with copy-paste one-liners that grab a platform installer and run it directly — nothing is cloned or left on disk:
  - Windows (PowerShell): `irm https://raw.githubusercontent.com/taze292/VSC-Execute/main/install.ps1 | iex`
  - Linux/macOS: `curl -fsSL https://raw.githubusercontent.com/taze292/VSC-Execute/main/install.sh | sh`
- The installers (`install.ps1`, `install.sh`) download the matching VSIX from the repo, check for VS Code's `code` CLI, install the extension, and clean themselves up. No dependencies required.
- Manual install command still available for those who have the repo checked out.

## 0.2.9

- README now leads with a copy-paste **Install** section: one command (`code --install-extension vsc-execute-0.2.9.vsix`) from the repo root. No functionality changes.

## 0.2.8

- **New settings button when connected.** When an executor is connected and a Lua/Luau file is open, a **gear button** appears in the status bar (next to Execute). Click it to open the setup menu — Auto-Execute, Uninstall, Copy Connect Script, Output and Notifications toggles — without disconnecting. Toggles apply immediately; reconnect not needed. When not connected the gear button is hidden and the main button still opens the menu as before.

## 0.2.7

- **Auto-Execute now scans all of `%APPDATA%`** (Local, LocalLow, and Roaming) instead of only `%LOCALAPPDATA%`, so executors that store their auto-exec folders in `Roaming` or `LocalLow` are found and installed into too (e.g. `%APPDATA%\Roaming\<Executor>\Auto-Execute`).
- Scan depth bumped to match the wider root; Windows Store app data (`%APPDATA%\Local\Packages`) is skipped to keep the scan fast and bounded.
- Repackaged as `vsc-execute-0.2.7.vsix`.

## 0.2.6

- No functionality changes. Documentation update:
  - README now lists **Requirements** up front and a **Test your setup** section that points to the bundled `examples/connectivity-test.luau` - a print-only script you can Execute to confirm VS Code can reach your executor - plus a short troubleshooting table.
  - Repackaged as `vsc-execute-0.2.6.vsix`.

## 0.2.5

- **All VSCode windows now share one connection.** Only the first window (the "leader") listens on the WebSocket port; every other window you open becomes a follower and routes its **Execute** button through the leader over a private IPC channel. Open as many windows as you like - the executor connects to the same pipe, and any window can send scripts with the same live connection status shown everywhere.
- If the leader window closes, another window automatically takes over and the executor reconnects on its own - no manual setup needed.
- The server now binds **exactly** `vscExecute.port`. If that port is taken by a non-VSC-Execute program, the extension reports an error instead of silently hopping to another port (change `vscExecute.port` to resolve it).

## 0.2.4

- **Fix: connection kept dropping / "not connected".** Control frames now use a plain-text marker (`!VSCE:...`) instead of a NUL-prefixed one, so executors that choke on control characters in WebSocket frames stay connected.
- The extension only pushes the output setting **after** the executor sends its `Hello` (guaranteeing the script's message handler is already attached), and the server no longer lets a socket dying mid-send crash the broadcast.
- Reinstall/copy the connect script once to pick this up.

## 0.2.3

- **Uninstall Auto-Execute** menu action: removes the installed connect script (`VSCE-Execute.luau`) from every auto-exec folder it finds.
- Connect script no longer prints the `Connected to VSCode on ws://...` line eagerly. It waits (~0.5s) for the extension to push the live output setting, so a stale script with `OUTPUT = true` baked in stays silent when the Output toggle is off. Falls back to the baked value only if the extension never replies.
- Connect script's `Hello` message is now a single-line string (no multi-line concatenation).

## 0.2.2

- **Output toggle now applies live.** The extension sends a control frame over the WebSocket the moment `vscExecute.showOutput` changes (and again on every connect/reconnect), so the connect script's own `[VSC Execute] ...` messages turn on/off instantly - even for scripts installed while Output was On. Old pre-`0.2.2` connect scripts are never sent control frames, so they keep their baked-in behavior until you reinstall/copy the script once.

## 0.2.1

- **Output toggle now defaults to OFF.** The connect script stays silent by default (no `[VSC Execute] Connected to VSCode...` / `Failed to compile...` messages).
- Clarified that the Output toggle only controls the connect script's own status messages - it NEVER suppresses `print`/`warn` calls inside scripts you run.

## 0.2.0

- Setup menu toggles: **Output** (connect-script prints in the executor console, on by default) and **Notifications** (VSCode toasts, on by default).
- `vscExecute.showOutput` and `vscExecute.showNotifications` settings (also editable from the Not Connected menu).
- Connect script stays fully silent when Output is off (reduces detectable prints); it still reconnects and runs received scripts as normal.
- Many more auto-exec folder names matched by the scan (24 total, including `AutoExecute`, `Autorun`, `Autoload`, `Executor Scripts`, etc.).
- Prebuilt `vsc-execute-0.2.0.vsix` committed to the repo so no one has to build it.

## 0.1.0

- Initial release.
- Status bar execute button (bottom left) shown for Lua/Luau files.
- "Not Connected" menu with Auto-Execute (LocalAppData scan + install) and Copy Connect Script actions.
- WebSocket server (default port 29999, auto-fallback) and Potassium connect script with auto-reconnect.
- `vscExecute.port` and `vscExecute.autoExecFolderNames` settings.