# Right panel

The right panel sits beside a thread. Open it with the panel toggle in the thread's head or
`mod+alt+b`. It has five tabs:

- **Outputs**: what the agent made in this thread, newest turn first: pages it published, files and
  screenshots it sent, and the documents, pictures and builds it wrote into the folder. Code it
  changed is in Git, not here. The newest turn starts open; click an older turn to open it. Pick an
  output to see it underneath, with Markdown shown rendered.
- **Folder**: the thread's folder, with each file you open as a tab after **Files**, the tree.
  Files with uncommitted changes carry Git's letter (M, A, D, R), and their folders a dot.
  Click **Files** to go back to the tree; the files stay open. When the panel is wide, the tree can
  also sit beside a file.
- **Browser**: pages the agent or you opened, and devices. Use **+** for another page or a device.
- **Git**: **Graph** shows the branch's commits beside its upstream and default branch; click a
  commit for its message and files, and a file to open it in Folder. **Diff** opens on what the
  latest turn changed; its menu picks another turn, **Changes** against a branch, or uncommitted
  work. Each file is marked M, A, D or R. **PR** holds the pull requests.
- **Terminal**: the thread's own shells.

With nothing open, the panel shows Git. A tab remembers what it last showed. When a tab holds more
than one page, file or shell, they show as a row under the tabs; middle-click one or use its menu to
close it. `mod+t` opens a new page, or a new shell while Terminal is on show. The command palette
has **Show outputs**, **Show folder**, **Show browser** and **Show Git**, plus **Show Git graph** and
**Show Git diff**. Each tab has a shortcut that shows it, or hides the panel when it's already on show:
`mod+alt+o` Outputs, `mod+alt+f` Folder, `mod+shift+j` Browser, `mod+d` Git and `mod+j` Terminal.
