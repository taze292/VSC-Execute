--[[
  VSC Execute - Connect Script

  Connects this executor to the VSC Execute extension over a local
  WebSocket server and executes every script it receives.

  Change PORT below if you changed vscExecute.port in your VSCode
  settings, then install/copy this script again.
]]

local PORT = 29999
local URL = "ws://127.0.0.1:" .. tostring(PORT)
local OUTPUT = false
local CONTROL_PREFIX = string.char(0) .. "VSCE:"
local RECONNECT_DELAY = 3
local connecting = false

local function log(...)
    if OUTPUT then
        print(...)
    end
end

local function logWarn(...)
    if OUTPUT then
        warn(...)
    end
end

local function handleMessage(script)
    if type(script) ~= "string" then
        return
    end

    if script:sub(1, #CONTROL_PREFIX) == CONTROL_PREFIX then
        local key, value = script:sub(#CONTROL_PREFIX + 1):match("^(%w+)=([%w+-]+)$")
        if key == "output" then
            OUTPUT = value == "true"
        end
        return
    end

    if #script == 0 then
        return
    end

    local chunk, compileError = loadstring(script)
    if not chunk then
        logWarn("[VSC Execute] Failed to compile script: " .. tostring(compileError))
        return
    end

    local ok, runError = xpcall(chunk, debug.traceback)
    if not ok then
        logWarn("[VSC Execute] Script runtime error: " .. tostring(runError))
    end
end

local function createConnection()
    if connecting then
        return true
    end

    local socket
    local ok = pcall(function()
        socket = WebSocket.connect(URL)
    end)

    if not ok or socket == nil then
        return false
    end

    connecting = true
    socket.OnMessage:Connect(handleMessage)

    socket.OnClose:Connect(function()
        connecting = false
        task.spawn(function()
            task.wait(RECONNECT_DELAY)
            createConnection()
        end)
    end)

    log("[VSC Execute] Connected to VSCode on " .. URL)

    pcall(function()
        socket:Send(
            "[VSC Execute] Hello from "
                .. tostring(identifyexecutor())
                .. "\n[VSCE-PROTO] 2"
        )
    end)

    return true
end

task.spawn(function()
    for _ = 1, 10 do
        if createConnection() then
            return
        end
        task.wait(2)
    end
    logWarn("[VSC Execute] Could not reach VSCode at " .. URL .. ". Start VSCode with the VSC Execute extension.")
end)