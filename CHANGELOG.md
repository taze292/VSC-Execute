# Change Log

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