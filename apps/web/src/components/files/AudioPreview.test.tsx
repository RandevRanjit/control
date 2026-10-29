// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { AudioPreview } from "./AudioPreview";

const unmounts: Array<() => void> = [];
afterEach(() => {
  for (const unmount of unmounts.splice(0)) unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(element: React.ReactElement) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(element));
  unmounts.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return {
    host,
    rerender: (next: React.ReactElement) => act(() => root.render(next)),
    button: (name: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`),
  };
}

describe("compact audio chip", () => {
  it.each(["loadedmetadata", "loadeddata", "canplay"])(
    "plays audio with unknown duration after %s and updates the total later",
    async (readyEvent) => {
      const onOpen = vi.fn();
      const preview = (failed = false) => (
        <AudioPreview
          compact
          src="data:audio/webm;base64,"
          name="recording.webm"
          failed={failed}
          onOpen={onOpen}
        />
      );
      const screen = mount(preview());
      const audio = screen.host.querySelector("audio")!;
      const duration = vi.spyOn(audio, "duration", "get").mockReturnValue(Infinity);
      const play = vi.spyOn(audio, "play").mockResolvedValue();
      expect(screen.button("Loading recording.webm")?.disabled).toBe(true);
      act(() => {
        audio.dispatchEvent(new Event(readyEvent));
      });
      expect(screen.button("Play recording.webm")?.disabled).toBe(false);
      expect(screen.host.textContent).toContain("0:00");
      expect(screen.host.textContent).not.toContain("/");
      act(() => screen.button("Play recording.webm")!.click());
      expect(play).toHaveBeenCalledOnce();
      act(() => {
        vi.spyOn(audio, "currentTime", "get").mockReturnValue(3);
        audio.dispatchEvent(new Event("play"));
        audio.dispatchEvent(new Event("timeupdate"));
      });
      expect(screen.button("Pause recording.webm")?.disabled).toBe(false);
      expect(screen.host.textContent).toContain("0:03");
      const progress = screen.host.querySelector<HTMLElement>("span[aria-hidden]")!;
      expect(progress.style.width).toBe("0%");
      act(() => {
        duration.mockReturnValue(10);
        audio.dispatchEvent(new Event("durationchange"));
      });
      expect(screen.host.textContent).toContain("0:03 / 0:10");
      expect(progress.style.width).toBe("30%");
      screen.rerender(preview(true));
      expect(screen.host.textContent).toContain("Unavailable");
      act(() => screen.button("Audio unavailable. Open recording.webm")!.click());
      expect(onOpen).toHaveBeenCalledOnce();
    },
  );
});
