--!nonstrict
-- Pending package count written by `dots-update --check`. The bar only reads
-- the cache, so it never competes with pacman or the update timer for locks.

local cache = (noctalia.getenv("XDG_CACHE_HOME") or ((noctalia.getenv("HOME") or "") .. "/.cache")) .. "/dots/updates"

function update()
  local raw = noctalia.readFile(cache)
  local count = raw ~= nil and tonumber(raw:match("%d+")) or nil
  if count == nil or count <= 0 then
    barWidget.setVisible(false)
    return
  end

  barWidget.setGlyph("download")
  barWidget.setText(tostring(count))
  barWidget.setTooltip("Package updates pending. Click to run dots-update.")
  barWidget.setVisible(true)
end

function onClick()
  noctalia.runInTerminal("dots-update; read -rp 'Press Enter to close. ' _")
end

noctalia.setUpdateInterval(60000)
update()
