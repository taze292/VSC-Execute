local Players = game:GetService("Players")
local player = Players.LocalPlayer
if player then
    print("Hello, " .. player.Name .. "! VSC Execute works.")
else
    warn("VSC Execute: no LocalPlayer found - are you in a game?")
end