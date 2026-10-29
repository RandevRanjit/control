import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { DiffStatLabel } from "./DiffStatLabel";

describe("DiffStatLabel", () => {
  it("leaves out the side with nothing, as Diff's file headers do", () => {
    const added = renderToStaticMarkup(<DiffStatLabel additions={20} deletions={0} />);
    expect(added).toContain("+20");
    expect(added).not.toContain("-0");
    const removed = renderToStaticMarkup(<DiffStatLabel additions={0} deletions={3} />);
    expect(removed).toContain("-3");
    expect(removed).not.toContain("+0");
    // A binary file counts no lines, so it says nothing rather than `+0 -0`.
    const binary = renderToStaticMarkup(<DiffStatLabel additions={0} deletions={0} />);
    expect(binary).not.toContain("+0");
    expect(binary).not.toContain("-0");
    const both = renderToStaticMarkup(<DiffStatLabel additions={2} deletions={1} />);
    expect(both).toContain("+2");
    expect(both).toContain("-1");
  });
});
