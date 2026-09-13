--[[
  VSC Execute - Connectivity Test

  A quick end-to-end check that VSC Execute can actually reach your executor.

  How to use:
    1. Install the extension and get the bottom-left status bar button to say
       "Execute" (not "Not Connected") - i.e. the connect script is running.
       See the README's "Requirements" / "Quick start" sections if it is not.
    2. Open THIS file in VS Code.
    3. Click the bottom-left Execute button, or run the
       "VSC Execute: Execute Current Script" command (Ctrl+Shift+P).
    4. Open the console and look for the [VSC Execute] lines below:
       - In Roblox: press F9 (Developer Console)
       - Your executor may also have its own console which shows the same output.

  If you see "[VSC Execute] PASSED", the full round trip works:
  VS Code -> WebSocket -> your executor -> running script.

  This script only prints; it never touches the game.
]]

local function executorName()
    local ok, name = pcall(function()
        return identifyexecutor()
    end)
    return ok and tostring(name) or "unknown"
end

local function placeId()
    local ok, id = pcall(function()
        return game.PlaceId
    end)
    return ok and tostring(id) or "unknown"
end

print("[VSC Execute] ============================================")
print("[VSC Execute] Connectivity test started")
print("[VSC Execute] Executor:  " .. executorName())
print("[VSC Execute] PlaceId:   " .. placeId())
warn("[VSC Execute] PASSED - VS Code can reach this executor.")
print("[VSC Execute] If you can read this line, the connection round-trip works end to end.")
print("[VSC Execute] ============================================")