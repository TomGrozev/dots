--!nonstrict
-- REC / FOCUS / keyboard mode. The files are the contract with the scripts:
-- ${XDG_RUNTIME_DIR}/polar/state/{recording,focus,mode}. A missing file is the
-- same as false, so a stale badge cannot survive a crashed writer.

local state_dir = (noctalia.getenv("XDG_RUNTIME_DIR") or "/tmp") .. "/polar/state"

local function read(name)
  local value = noctalia.readFile(state_dir .. "/" .. name)
  if value == nil then
    return nil
  end
  return (value:gsub("%s+$", ""))
end

local function render()
  local chips = {}
  if read("recording") == "true" then
    chips[#chips + 1] = { text = "● REC", color = "#BF616A" }
  end
  if read("focus") == "true" then
    chips[#chips + 1] = { text = "FOCUS · Super+Z", color = "#EBCB8B" }
  end
  local mode = read("mode")
  if mode ~= nil and mode ~= "" and mode ~= "default" then
    chips[#chips + 1] = { text = mode .. " · Esc", color = "#EBCB8B" }
  end

  if #chips == 0 then
    barWidget.setVisible(false)
    return
  end

  local labels = {}
  for _, chip in ipairs(chips) do
    labels[#labels + 1] = ui.label({
      text = chip.text,
      color = chip.color,
      fontWeight = "bold",
    })
  end
  barWidget.render(ui.row({ gap = 10, align = "center" }, labels))
  barWidget.setVisible(true)
end

function update()
  render()
end

noctalia.setUpdateInterval(1000)
render()
