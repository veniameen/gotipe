"use client";

import { useEffect, useRef } from "react";

/** The drawing buffer's longer side at most, in pixels: the stage is tall, the GPU is shared. */
const BUFFER_SIDE = 1600;
/** Boxes the shader keeps calm (u_calm): as many as the shader header reads. */
const CALM_BOXES = 2;
/** A box far off the stage: no calm. */
const NOWHERE = -1e4;
/** How fast the pointer's light follows it, comes and goes, and how fast its stir fades (per s). */
const FOLLOW = 6;
const PRESENCE = 2.5;
const FLOW = 3;
/** The moment a reader who asked for less motion sees: one frame, still. */
const STILL_TIME = 21;

const VERTEX = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

/** The stage's colours: the theme token, a hex colour, each uniform takes. */
export const STAGE_COLOURS = {
  u_deep: "--site-shade-deep",
  u_main: "--site-shade-main",
  u_second: "--site-shade-second",
  u_light: "--site-shade-light",
} as const;
type ColourUniform = keyof typeof STAGE_COLOURS;
const COLOUR_UNIFORMS = Object.keys(STAGE_COLOURS) as ColourUniform[];

/**
 * What every stage shader gets before its own source: the buffer's size; the time; the pointer (a
 * share of the stage, y up), whether it is there and how fast it moves (shares per second); the
 * theme's colours, dark or not; the first screen's height from the stage's top; the boxes to keep
 * calm (the copy, the head), y up. And two helpers: the first screen's frame (its centre at 0, a
 * unit its height) and the calm at a pixel.
 */
export const STAGE_HEADER = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_presence;
uniform vec2 u_flow;
${COLOUR_UNIFORMS.map((name) => `uniform vec3 ${name};`).join("\n")}
uniform float u_dark;
uniform float u_fold;
uniform vec4 u_calm[${CALM_BOXES}];

vec2 screenAt(vec2 frag) {
  return (frag - vec2(0.5 * u_res.x, u_res.y - 0.5 * u_fold)) / u_fold;
}
float calmAt(vec2 frag) {
  float calm = 0.0;
  for (int i = 0; i < ${CALM_BOXES}; i++) {
    vec4 box = u_calm[i];
    vec2 size = 0.5 * (box.zw - box.xy);
    float corner = min(size.x, size.y);
    vec2 q = abs(frag - 0.5 * (box.xy + box.zw)) - size + corner;
    float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - corner;
    float soft = clamp(corner * 0.8, 0.16 * u_fold, 0.25 * u_fold);
    calm = max(calm, 1.0 - smoothstep(-0.2 * soft, soft, dist));
  }
  return calm;
}
`;

type Colour = [number, number, number];

/** `#rrggbb` or `#rgb` → three channels in 0..1, or null. */
export function hexColour(value: string): Colour | null {
  const hex = value.trim().replace(/^#/, "");
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16) / 255) as Colour;
}

/** Moves `from` toward `to` by the share of the way a spring covers in `dt` seconds. */
export function approach(from: number, to: number, dt: number, rate: number): number {
  return to + (from - to) * Math.exp(-rate * dt);
}

interface Palette {
  colours: [ColourUniform, Colour][];
  dark: number;
}

/** The theme's stage colours (STAGE_COLOURS), or null while a token is missing or not hex. */
function readPalette(element: HTMLElement): Palette | null {
  const style = getComputedStyle(element);
  const colours: [ColourUniform, Colour][] = [];
  for (const name of COLOUR_UNIFORMS) {
    const colour = hexColour(style.getPropertyValue(STAGE_COLOURS[name]));
    if (!colour) return null;
    colours.push([name, colour]);
  }
  const dark = document.documentElement.getAttribute("data-theme") === "dark" ? 1 : 0;
  return { colours, dark };
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.warn("GoTipe site: a stage shader did not compile", gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

/** No box to keep calm; one array for every render, so the effect does not restart. */
const NO_CALM: readonly string[] = [];

/** Whether an element sits in a fixed box: it does not scroll with the stage. */
function inFixed(element: Element): boolean {
  for (let at: Element | null = element; at; at = at.parentElement)
    if (getComputedStyle(at).position === "fixed") return true;
  return false;
}

export interface ShaderStageProps {
  /** The fragment shader's body, after STAGE_HEADER. */
  fragment: string;
  /** Selectors of what lies over the stage and must stay legible: the shader calms under them. */
  calm?: readonly string[];
}

/**
 * A WebGL layer behind the first stage's content: one fragment shader over the whole stage, with
 * the time, the pointer (where it is, whether it is there, how it moves) and the theme's colours.
 * Decoration: hidden from assistive technology, no pointer events of its own, the stage's CSS light
 * underneath for a browser without WebGL. It draws only on screen in a visible tab; for a reader who
 * asked for less motion it draws one still frame and does not follow the pointer.
 */
export function ShaderStage({ fragment, calm = NO_CALM }: ShaderStageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const stage = element?.parentElement?.parentElement;
    if (!element || !stage) return;
    const gl = element.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) return;
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    const shader = compile(gl, gl.FRAGMENT_SHADER, STAGE_HEADER + fragment);
    const program = gl.createProgram();
    if (!vertex || !shader || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, shader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const at = (name: string) => gl.getUniformLocation(program, name);
    const uniform = {
      res: at("u_res"),
      time: at("u_time"),
      pointer: at("u_pointer"),
      presence: at("u_presence"),
      flow: at("u_flow"),
      dark: at("u_dark"),
      fold: at("u_fold"),
      calm: at("u_calm"),
    };
    const colourAt = new Map(COLOUR_UNIFORMS.map((name) => [name, at(name)]));

    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let palette = readPalette(element);
    let frame = 0;
    let last = 0;
    let time = still ? STILL_TIME : 0;
    let onScreen = false;
    const pointer = { x: 0.5, y: 0.72, tx: 0.5, ty: 0.72, presence: 0, target: 0 };
    const flow = { x: 0, y: 0, lx: 0.5, ly: 0.72 };
    const calmBoxes = new Float32Array(CALM_BOXES * 4);
    let fold = 1;

    const size = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      const scale = Math.min(
        1,
        window.devicePixelRatio || 1,
        BUFFER_SIDE / Math.max(width, height, 1),
      );
      element.width = Math.max(1, Math.round(width * scale));
      element.height = Math.max(1, Math.round(height * scale));
      gl.viewport(0, 0, element.width, element.height);
    };

    /** The first screen's height and the calm boxes, in buffer pixels, y up, as at the page's top. */
    const measure = () => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const scale = element.width / box.width;
      const top = box.top + window.scrollY;
      fold = Math.max(1, Math.min(box.height, window.innerHeight - top) * scale);
      calmBoxes.fill(NOWHERE);
      calm.slice(0, CALM_BOXES).forEach((selector, index) => {
        const target = document.querySelector(selector);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const from = inFixed(target) ? top : box.top;
        calmBoxes.set(
          [
            (rect.left - box.left) * scale,
            element.height - (rect.bottom - from) * scale,
            (rect.right - box.left) * scale,
            element.height - (rect.top - from) * scale,
          ],
          index * 4,
        );
      });
    };

    const draw = () => {
      if (!palette) return;
      gl.uniform2f(uniform.res, element.width, element.height);
      gl.uniform1f(uniform.time, time);
      gl.uniform2f(uniform.pointer, pointer.x, pointer.y);
      gl.uniform1f(uniform.presence, pointer.presence);
      gl.uniform2f(uniform.flow, flow.x, flow.y);
      for (const [name, colour] of palette.colours)
        gl.uniform3fv(colourAt.get(name) ?? null, colour);
      gl.uniform1f(uniform.dark, palette.dark);
      gl.uniform1f(uniform.fold, fold);
      gl.uniform4fv(uniform.calm, calmBoxes);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      element.setAttribute("data-ready", "");
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      time += dt;
      pointer.x = approach(pointer.x, pointer.tx, dt, FOLLOW);
      pointer.y = approach(pointer.y, pointer.ty, dt, FOLLOW);
      pointer.presence = approach(pointer.presence, pointer.target, dt, PRESENCE);
      if (dt > 0) {
        // the pointer's velocity, in stage heights per second, eased so a stir lingers
        const vx = (pointer.x - flow.lx) / dt;
        const vy = (pointer.y - flow.ly) / dt;
        flow.x = approach(flow.x, vx, dt, FLOW);
        flow.y = approach(flow.y, vy, dt, FLOW);
      }
      flow.lx = pointer.x;
      flow.ly = pointer.y;
      draw();
      schedule();
    };
    function schedule() {
      if (still || frame || !onScreen || document.hidden) return;
      frame = requestAnimationFrame(tick);
    }
    const pause = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const box = element.getBoundingClientRect();
      pointer.tx = (event.clientX - box.left) / box.width;
      pointer.ty = 1 - (event.clientY - box.top) / box.height;
      pointer.target = 1;
    };
    const onLeave = () => {
      pointer.target = 0;
    };
    if (!still) {
      stage.addEventListener("pointermove", onMove);
      stage.addEventListener("pointerleave", onLeave);
    }
    const resize = new ResizeObserver(() => {
      size();
      measure();
      draw();
    });
    resize.observe(element);
    const remeasure = () => {
      measure();
      draw();
    };
    const calmed = new ResizeObserver(remeasure);
    for (const selector of calm) {
      const target = document.querySelector(selector);
      if (target) calmed.observe(target);
    }
    window.addEventListener("resize", remeasure);
    const view = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen) schedule();
      else pause();
    });
    view.observe(element);
    const onVisibility = () => (document.hidden ? pause() : schedule());
    document.addEventListener("visibilitychange", onVisibility);
    const theme = new MutationObserver(() => {
      palette = readPalette(element);
      draw();
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const onLost = (event: Event) => {
      event.preventDefault();
      pause();
      element.removeAttribute("data-ready");
    };
    element.addEventListener("webglcontextlost", onLost);

    size();
    measure();
    draw();
    schedule();

    return () => {
      pause();
      calmed.disconnect();
      window.removeEventListener("resize", remeasure);
      stage.removeEventListener("pointermove", onMove);
      stage.removeEventListener("pointerleave", onLeave);
      resize.disconnect();
      view.disconnect();
      theme.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      element.removeEventListener("webglcontextlost", onLost);
      element.removeAttribute("data-ready");
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(shader);
    };
  }, [fragment, calm]);

  return (
    <div className="site-hero-shade" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
