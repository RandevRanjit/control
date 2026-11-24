"use client";

import { type RefObject, useEffect, useRef } from "react";

const VERTEX = `attribute vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// A ribbon of heat: crisp on one side, a long cool tail on the other. One unit is the canvas's
// width, so a composition holds at any size. Heat 0..1 is looked up in the ramp; 0 is exactly the
// page's ground. Two shapes: "dive" enters top right and goes behind the hero's window; "river"
// runs along the reel's foot and rises behind its plates, anchored to the track by u_flow.
const FRAGMENT = `precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_gain;
uniform float u_river;
uniform float u_flow;
uniform sampler2D u_ramp;

const float TAU = 6.28318530718;

float hash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

// d > 0 on the crisp side; reach is how far the tail carries on the other.
float profile(float d, float reach, float crisp) {
  float edge = mix(reach * 0.35, 1.5 / u_res.x, crisp);
  float x = max(-d, 0.0);
  float core = mix(0.5, 1.0, smoothstep(0.0, reach * 0.22, x));
  // The tail is cut off at 10 % so that away from the ribbon the ground is the ground, not a haze.
  float tail = max(0.0, exp(-pow(x / reach, 1.6)) - 0.1) / 0.9;
  return d > 0.0 ? 0.5 * (1.0 - smoothstep(0.0, edge, d)) : core * tail;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_res.x;
  float tall = u_res.y / u_res.x;
  float t7 = u_time * TAU / 7.0;
  float t14 = u_time * TAU / 14.0;
  float t28 = u_time * TAU / 28.0;
  float heat;

  if (u_river < 0.5) {
    p += 0.02 * vec2(sin(p.y * 5.0 + t14), cos(p.x * 4.0 - t28));
    // s runs along the ribbon from its entrance, o across it towards the tail.
    vec2 q = p - vec2(1.03, 0.03);
    float s = dot(q, vec2(-0.565, 0.825));
    float o = dot(q, vec2(0.825, 0.565));
    float amp = 0.075 + 0.02 * sin(t14 + 1.0);
    float bend = s * 4.6 - 2.95 + 0.6 * sin(t28) + 0.25 * sin(t14);
    float d = (amp * sin(bend) - o) / sqrt(1.0 + pow(amp * 4.6 * cos(bend), 2.0));
    // Heat travels down the ribbon towards the window: the tail swells and the core flares.
    float swell = pow(0.5 + 0.5 * sin(s * 5.0 - t7), 3.0);
    float reach = 0.2 * mix(0.75, 1.25, 0.5 + 0.5 * sin(s * 2.4 + t14)) * (1.0 + 0.22 * swell);
    float crisp = smoothstep(-0.6, 0.2, sin(s * 2.6 - t14 + 1.4));
    heat = profile(d, reach, crisp) * (1.0 + 0.1 * swell);
    heat *= smoothstep(0.0, 0.05, p.y) * (1.0 - smoothstep(0.7, 1.0, p.y / tall));
  } else {
    float x = p.x + u_flow;
    p.y += 0.012 * sin(x * 7.0 - t14);
    float a1 = x * 2.3 + t28;
    float a2 = x * 5.1 - t14;
    float spine = tall * 0.86 + 0.04 * sin(a1) + 0.02 * sin(a2) + 0.02 * sin(x * 0.9 + 1.0);
    float slope = 0.092 * cos(a1) + 0.102 * cos(a2) + 0.018 * cos(x * 0.9 + 1.0);
    float d = (p.y - spine) / sqrt(1.0 + slope * slope);
    float swell = pow(0.5 + 0.5 * sin(x * 4.0 - t7), 3.0);
    float reach = tall * 0.26 * mix(0.7, 1.2, 0.5 + 0.5 * sin(x * 1.7 + t14)) * (1.0 + 0.2 * swell);
    float crisp = smoothstep(-0.95, -0.3, sin(x * 1.9 - t14 + 0.4));
    heat = profile(d, reach, crisp) * (1.0 + 0.1 * swell);
  }

  heat *= 0.5 + 0.5 * u_gain;
  heat += (hash(gl_FragCoord.xy) - 0.5) * 0.07 * smoothstep(0.0, 0.08, heat);
  gl_FragColor = vec4(texture2D(u_ramp, vec2(clamp(heat, 0.0, 1.0), 0.5)).rgb, 1.0);
}`;

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function toLab([r, g, b]: number[]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromLab([L, a, b]: number[]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Bakes the `--heat` stops ("colour 0%, …, colour 100%") into 256 RGBA pixels, mixed in OKLab as Bloom's bars are. */
function bakeRamp(heat: string) {
  const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  const stops = heat.split(",").map((stop) => {
    const cut = stop.trim().lastIndexOf(" ");
    probe.fillStyle = stop.trim().slice(0, cut);
    probe.fillRect(0, 0, 1, 1);
    const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
    return {
      at: Number.parseFloat(stop.trim().slice(cut + 1)) / 100,
      lab: toLab([r, g, b].map((c) => toLinear(c / 255))),
    };
  });
  const ramp = new Uint8Array(256 * 4).fill(255);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const next = Math.max(
      1,
      stops.findIndex((stop) => stop.at >= t),
    );
    const from = stops[next - 1];
    const to = stops[next];
    const k = (t - from.at) / (to.at - from.at);
    fromLab(from.lab.map((c, j) => c + (to.lab[j] - c) * k)).forEach((c, j) => {
      ramp[i * 4 + j] = Math.round(toGamma(Math.min(1, Math.max(0, c))) * 255);
    });
  }
  return ramp;
}

/**
 * The page's thermal field, placed by `.thermal` inside a positioned parent; its colours are the
 * `--heat` custom property. `flow` is the reel's travel in canvas widths, read every frame.
 */
export function Thermal({
  shape = "dive",
  flow,
}: {
  shape?: "dive" | "river";
  flow?: RefObject<number>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const gl = canvas?.getContext("webgl", { antialias: false, alpha: false });
    if (!canvas || !gl) return;

    const program = gl.createProgram();
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, FRAGMENT],
    ] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      gl.attachShader(program, shader);
    }
    gl.bindAttribLocation(program, 0, "a_pos");
    gl.linkProgram(program);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      bakeRamp(getComputedStyle(canvas).getPropertyValue("--heat")),
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const uRes = gl.getUniformLocation(program, "u_res");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uGain = gl.getUniformLocation(program, "u_gain");
    const uFlow = gl.getUniformLocation(program, "u_flow");
    gl.uniform1f(gl.getUniformLocation(program, "u_river"), shape === "river" ? 1 : 0);
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let born = 0;
    let frame = 0;
    let visible = false;

    const draw = () => {
      born ||= performance.now();
      const seconds = (performance.now() - born) / 1000;
      // The one entrance: the ribbon warms from blue to its hot core over two scenes (1.75 s).
      const warm = Math.min(1, seconds / 1.75);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, still ? 0 : seconds);
      gl.uniform1f(uGain, still ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * warm));
      gl.uniform1f(uFlow, flow?.current ?? 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.dataset.live = "";
      if (!still && visible) frame = requestAnimationFrame(draw);
    };

    const resize = new ResizeObserver(() => {
      const scale = Math.min(devicePixelRatio, 1.5);
      canvas.width = Math.round(canvas.clientWidth * scale);
      canvas.height = Math.round(canvas.clientHeight * scale);
      gl.viewport(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(frame);
      if (visible) draw();
    });
    resize.observe(canvas);

    const watch = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      cancelAnimationFrame(frame);
      if (visible) draw();
    });
    watch.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      watch.disconnect();
    };
  }, [shape, flow]);

  return <canvas ref={ref} className="thermal" aria-hidden="true" />;
}
