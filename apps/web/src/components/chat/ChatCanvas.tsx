import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
} from "react";
import { flushSync } from "react-dom";
import { motionReduced } from "~/lib/motion";
import { useSidebarMakingRoom } from "../ui/sidebar";
import { ChatCanvasContext } from "./ChatCanvasContext";
import { resolveChatCanvasLayout, type ChatCanvasPreview } from "./chatCanvasLayout";
import type { PreviewMiniPlayerObstacles } from "../preview/previewMiniPlayerLayout";

// The auto-hidden sidebar's own slide (ui/sidebar.tsx): Bloom's --d-quick, out on --e-out and
// back on --e-in.
const SIDEBAR_SLIDE_MS = 218.75;
const SIDEBAR_EASE_OUT = "cubic-bezier(.61,1,.88,1)";
const SIDEBAR_EASE_IN = "cubic-bezier(.12,0,.39,0)";
// What --chat-lane-push moves: the timeline, the composer and the scroll-to-bottom button.
const LANE_CONTENT =
  ".messages-timeline-scroll > *, .chat-composer-lane > *, .chat-scroll-to-bottom > *";

/**
 * The lanes take their new place in one layout, then each glides there from where it was, in step
 * with the sidebar. Animating the padding instead re-wrapped the text on every frame.
 */
function glideLanes(canvas: HTMLElement, push: string, previousPush: string, running: Animation[]) {
  const lanes = [...canvas.querySelectorAll<HTMLElement>(LANE_CONTENT)];
  // Measure a centred column where there is one: the timeline's rows sit inside a wider block.
  const left = () =>
    lanes.map(
      (lane) => (lane.querySelector(".chat-content-lane") ?? lane).getBoundingClientRect().left,
    );
  // Where each lane shows now, mid-glide included.
  canvas.style.setProperty("--chat-lane-push", previousPush);
  const from = left();
  for (const animation of running.splice(0)) animation.cancel();
  canvas.style.setProperty("--chat-lane-push", push);
  const to = left();
  lanes.forEach((lane, index) => {
    const offset = from[index]! - to[index]!;
    if (Math.abs(offset) < 0.5) return;
    running.push(
      lane.animate([{ translate: `${offset}px 0` }, { translate: "0 0" }], {
        duration: SIDEBAR_SLIDE_MS,
        easing: push === "0px" ? SIDEBAR_EASE_IN : SIDEBAR_EASE_OUT,
      }),
    );
  });
}

/**
 * Owns the available conversation space. Cards only report where they sit; chat
 * moves over only for the floating preview, never for the workspace card.
 */
export function ChatCanvas({
  composerOverlayElement,
  detailsCardTopInset = 0,
  children,
  ...props
}: Omit<ComponentProps<"div">, "className" | "style" | "ref"> & {
  composerOverlayElement: HTMLElement | null;
  detailsCardTopInset?: number;
}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const widthProbeRef = useRef<HTMLDivElement | null>(null);
  const [timelineElement, registerTimeline] = useState<HTMLElement | null>(null);
  const [preview, setPreview] = useState<ChatCanvasPreview | null>(null);
  const [detailsCard, setDetailsCard] = useState<PreviewMiniPlayerObstacles["detailsCard"]>(null);
  const reportDetailsCard = useCallback((next: PreviewMiniPlayerObstacles["detailsCard"]) => {
    setDetailsCard((current) =>
      current?.left === next?.left &&
      current?.right === next?.right &&
      current?.bottom === next?.bottom
        ? current
        : next,
    );
  }, []);
  const [measurements, setMeasurements] = useState({
    width: 0,
    height: 0,
    padding: 20,
    maxChatWidth: 768,
    minChatWidth: 640,
    composerHeight: 0,
    timelineGutter: 0,
  });
  const reportPreview = useCallback((next: ChatCanvasPreview) => {
    setPreview((current) =>
      current?.key === next.key &&
      current.width === next.width &&
      current.lastInteraction === next.lastInteraction &&
      current.position?.x === next.position?.x &&
      current.position?.y === next.position?.y &&
      current.source.width === next.source.width &&
      current.source.height === next.source.height
        ? current
        : next,
    );
  }, []);
  const clearPreview = useCallback(
    (key: string) => setPreview((current) => (current?.key === key ? null : current)),
    [],
  );
  useLayoutEffect(() => {
    const element = elementRef.current;
    const probe = widthProbeRef.current;
    if (!element || !probe) return;
    const measure = () => {
      const styles = getComputedStyle(probe);
      const next = {
        width: element.clientWidth,
        height: element.clientHeight,
        padding: Number.parseFloat(styles.paddingLeft),
        maxChatWidth: Number.parseFloat(styles.width),
        minChatWidth: Number.parseFloat(styles.minWidth),
        composerHeight: composerOverlayElement?.getBoundingClientRect().height ?? 0,
        timelineGutter: timelineElement
          ? (timelineElement.offsetWidth - timelineElement.clientWidth) / 2
          : 0,
      };
      setMeasurements((current) =>
        Object.keys(next).every(
          (key) => current[key as keyof typeof current] === next[key as keyof typeof next],
        )
          ? current
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(() => flushSync(measure));
    observer.observe(element);
    observer.observe(probe);
    if (composerOverlayElement) observer.observe(composerOverlayElement);
    if (timelineElement) observer.observe(timelineElement);
    return () => observer.disconnect();
  }, [composerOverlayElement, timelineElement]);
  const context = useMemo(() => {
    const container = { width: measurements.width, height: measurements.height };
    return {
      container,
      lane: { padding: measurements.padding, maxChatWidth: measurements.maxChatWidth },
      layout: resolveChatCanvasLayout({ ...measurements, container, preview, detailsCard }),
      previewKey: preview?.key ?? null,
      reportPreview,
      clearPreview,
      registerTimeline,
      reportDetailsCard,
      detailsCardTopInset,
    };
  }, [
    measurements,
    preview,
    detailsCard,
    reportPreview,
    clearPreview,
    reportDetailsCard,
    detailsCardTopInset,
  ]);
  const { layout } = context;
  // An auto-hidden sidebar that makes room pushes the lanes over by its width while it is out.
  const lanePush = useSidebarMakingRoom() ? "var(--sidebar-width)" : "0px";
  const shownLanePush = useRef(lanePush);
  const laneGlides = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    const previousPush = shownLanePush.current;
    shownLanePush.current = lanePush;
    const element = elementRef.current;
    if (previousPush === lanePush || !element || motionReduced()) return;
    glideLanes(element, lanePush, previousPush, laneGlides.current);
  }, [lanePush]);
  return (
    <ChatCanvasContext value={context}>
      <div
        {...props}
        ref={elementRef}
        data-chat-canvas
        data-preview-overlaps-chat={layout.overlapsChat || undefined}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col"
        style={
          {
            "--chat-timeline-gutter": `${measurements.timelineGutter}px`,
            "--chat-lane-push": lanePush,
            "--chat-lane-inset-start": `calc(${layout.chat.insetStart}px + var(--chat-lane-push))`,
            "--chat-lane-inset-end": `${layout.chat.insetEnd}px`,
          } as CSSProperties
        }
      >
        <div
          ref={widthProbeRef}
          aria-hidden
          className="pointer-events-none invisible absolute h-0 w-(--chat-content-max-width) min-w-[40rem] box-content ps-3 sm:ps-5"
        />
        {children}
      </div>
    </ChatCanvasContext>
  );
}
