"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { Thermal } from "./Thermal";

/**
 * The feature reel: a heading and its panels (the children). Wide screens pin it and turn the page's scroll
 * into the track's travel, one pixel for one; narrow screens and Reduce motion keep the sideways
 * scroller the CSS gives. A panel off screen is marked `data-off`, which pauses its scene, and
 * `--fit` shrinks the panels on a short window.
 */
export function Reel({ title, children }: { title: string; children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const flow = useRef(0);

  useEffect(() => {
    const section = root.current!;
    const strip = track.current!;
    const wide = matchMedia("(min-width: 900px) and (prefers-reduced-motion: no-preference)");
    let frame = 0;

    const place = () => {
      frame = 0;
      const travel = strip.scrollWidth - innerWidth;
      const progress = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / travel));
      strip.style.transform = `translate3d(${-progress * travel}px, 0, 0)`;
      section.style.setProperty("--progress", String(progress));
      flow.current = (progress * travel) / innerWidth;
    };
    const onScroll = () => {
      frame ||= requestAnimationFrame(place);
    };
    const arm = () => {
      removeEventListener("scroll", onScroll);
      section.toggleAttribute("data-pinned", wide.matches);
      strip.style.transform = "";
      // Below 960 px of height the panels shrink, which keeps air around the heading above them.
      section.style.setProperty("--fit", String(wide.matches ? Math.min(1, innerHeight / 960) : 1));
      flow.current = 0;
      // Set in one go: clearing it first shortens the page for a moment, and a reader part-way
      // through the reel is thrown down the page when they resize.
      section.style.height = wide.matches ? `${strip.scrollWidth - innerWidth + innerHeight}px` : "";
      if (!wide.matches) return;
      addEventListener("scroll", onScroll, { passive: true });
      place();
    };
    arm();
    addEventListener("resize", arm);

    const watch = new IntersectionObserver((entries) => {
      for (const entry of entries) entry.target.toggleAttribute("data-off", !entry.isIntersecting);
    });
    for (const panel of strip.children) watch.observe(panel);

    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", arm);
      cancelAnimationFrame(frame);
      watch.disconnect();
    };
  }, []);

  return (
    <section ref={root} className="reel" id="features">
      <div className="reel-view">
        <Thermal shape="river" flow={flow} />
        <header className="reel-head">
          <h2>{title}</h2>
          <p className="reel-progress" aria-hidden="true">
            <i />
          </p>
        </header>
        <div className="reel-scroll">
          <div ref={track} className="reel-track">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
