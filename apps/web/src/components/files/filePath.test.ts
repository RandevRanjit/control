import { describe, expect, it } from "vite-plus/test";

import {
  chatPathOfTreeEntry,
  fileBreadcrumbChildren,
  fileBreadcrumbParent,
  fileBreadcrumbs,
  parentFolder,
  treePathOfChatPath,
} from "./filePath";

describe("fileBreadcrumbs", () => {
  it("builds project, directory, and file crumbs", () => {
    expect(fileBreadcrumbs("control", "apps/web/src/main.tsx")).toEqual([
      { label: "control", path: "", kind: "project" },
      { label: "apps", path: "apps", kind: "directory" },
      { label: "web", path: "apps/web", kind: "directory" },
      { label: "src", path: "apps/web/src", kind: "directory" },
      { label: "main.tsx", path: "apps/web/src/main.tsx", kind: "file" },
    ]);
  });

  it("normalizes repeated separators", () => {
    expect(fileBreadcrumbs("workspace", "src//index.ts").map((crumb) => crumb.label)).toEqual([
      "workspace",
      "src",
      "index.ts",
    ]);
  });

  it("starts host paths outside the workspace at the filesystem root", () => {
    expect(fileBreadcrumbs("control", "/tmp/control-cleanup/report.md")).toEqual([
      { label: "tmp", path: "/tmp", kind: "directory" },
      { label: "control-cleanup", path: "/tmp/control-cleanup", kind: "directory" },
      { label: "report.md", path: "/tmp/control-cleanup/report.md", kind: "file" },
    ]);
    expect(fileBreadcrumbs("control", "C:\\Temp\\report.md")).toEqual([
      { label: "C:", path: "C:", kind: "directory" },
      { label: "Temp", path: "C:\\Temp", kind: "directory" },
      { label: "report.md", path: "C:\\Temp\\report.md", kind: "file" },
    ]);
    expect(fileBreadcrumbs("control", "\\\\server\\share\\report.md").map((c) => c.path)).toEqual([
      "\\\\server",
      "\\\\server\\share",
      "\\\\server\\share\\report.md",
    ]);
  });
});

describe("fileBreadcrumbChildren", () => {
  const entries = [
    { path: "README.md", kind: "file" as const },
    { path: "src", kind: "directory" as const },
    { path: "src-old", kind: "directory" as const },
    { path: "src/index.ts", kind: "file" as const },
    { path: "src/lib", kind: "directory" as const },
    { path: "src/lib/file10.ts", kind: "file" as const },
    { path: "src/lib/file2.ts", kind: "file" as const },
    { path: "src-old/index.ts", kind: "file" as const },
  ];

  it("returns only the immediate children of the project root", () => {
    expect(fileBreadcrumbChildren(entries, "")).toEqual([
      { path: "src", kind: "directory", label: "src" },
      { path: "src-old", kind: "directory", label: "src-old" },
      { path: "README.md", kind: "file", label: "README.md" },
    ]);
  });

  it("honors segment boundaries and sorts folders before files", () => {
    expect(fileBreadcrumbChildren(entries, "src")).toEqual([
      { path: "src/lib", kind: "directory", label: "lib" },
      { path: "src/index.ts", kind: "file", label: "index.ts" },
    ]);
  });

  it("uses natural file-name ordering and preserves input order for equivalent names", () => {
    const files = ["file10.ts", "File2.ts", "file02.ts", "file2.ts"].map((name) => ({
      path: `src/lib/${name}`,
      kind: "file" as const,
    }));

    expect(fileBreadcrumbChildren(files, "src/lib").map((entry) => entry.label)).toEqual([
      "File2.ts",
      "file02.ts",
      "file2.ts",
      "file10.ts",
    ]);
  });

  it("returns an empty list for an empty or missing directory", () => {
    expect(fileBreadcrumbChildren(entries, "missing")).toEqual([]);
  });
});

describe("fileBreadcrumbParent", () => {
  it.each([
    ["src/lib", "src"],
    ["src", ""],
    ["", null],
  ])("returns the parent of %j", (path, expected) => {
    expect(fileBreadcrumbParent(path)).toBe(expected);
  });
});

describe("parentFolder", () => {
  it.each([
    ["/Users/a/Projects/control", "/Users/a/Projects"],
    ["/Users/a/Projects/control/", "/Users/a/Projects"],
    ["/Users", "/"],
    ["/", null],
    ["C:\\Users\\a", "C:\\Users"],
    ["C:\\Users", "C:\\"],
    ["C:\\", null],
  ])("goes up from %j", (folder, expected) => {
    expect(parentFolder(folder)).toBe(expected);
  });
});

describe("tree paths above the chat's folder", () => {
  const chatFolder = "/Users/a/Projects/control";

  it("names a tree entry inside the chat's folder relatively, anything else absolutely", () => {
    expect(chatPathOfTreeEntry("/Users/a/Projects", "control/docs/a.md", chatFolder)).toBe(
      "docs/a.md",
    );
    expect(chatPathOfTreeEntry("/Users/a/Projects", "bench/b.py", chatFolder)).toBe(
      "/Users/a/Projects/bench/b.py",
    );
    expect(chatPathOfTreeEntry("/", "tmp/r.pdf", chatFolder)).toBe("/tmp/r.pdf");
  });

  it("finds the open file's row, or none outside the tree's folder", () => {
    expect(treePathOfChatPath("docs/a.md", "/Users/a/Projects", chatFolder)).toBe(
      "control/docs/a.md",
    );
    expect(
      treePathOfChatPath("/Users/a/Projects/bench/b.py", "/Users/a/Projects", chatFolder),
    ).toBe("bench/b.py");
    expect(treePathOfChatPath("/tmp/r.pdf", "/Users/a", chatFolder)).toBeNull();
  });
});
