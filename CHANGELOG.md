# Change Log

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