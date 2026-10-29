# Terminal

## History

Each terminal keeps up to 5,000 lines and 8 MiB of scrollback on its environment
server. CONTROL removes the oldest output when either limit is reached. A long
line can be shortened at the start. New terminal output is not truncated.

These limits apply when you reconnect and when CONTROL restores saved terminal
history. A client can show less scrollback than the server keeps.

## Font and size

The terminal uses IBM Plex Mono, CONTROL's mono font, by default. Settings › Typography ›
Terminal font lists CONTROL's fonts first, then the ones installed on your computer.
**Load…** adds a font file to try: it stays on that device until you **Remove** it.
A font whose letters differ in width is drawn one letter per cell, so columns still
line up.

While a terminal has focus, ⌘+ and ⌘− change its font size and ⌘0 puts it back.
Anywhere else, they zoom the window.
