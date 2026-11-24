#!/bin/sh
# ly runs this before it draws (start_cmd in /etc/ly/config.ini). The goal is the
# same Nord palette as system/etc/vtrgb, but the boot-time setvtrgb can fire
# while Plymouth still owns the console, and a VT in KD_GRAPHICS ignores palette
# writes. OSC P sets one entry on the VT this is written to, which is the one ly
# is about to draw on, so the login screen does not depend on that timing.
for entry in \
	0:2e3440 1:bf616a 2:a3be8c 3:ebcb8b 4:81a1c1 5:b48ead 6:88c0d0 7:e5e9f0 \
	8:4c566a 9:bf616a a:a3be8c b:ebcb8b c:81a1c1 d:b48ead e:8fbcbb f:eceff4
do
	printf '\033]P%s%s' "${entry%%:*}" "${entry#*:}"
done
