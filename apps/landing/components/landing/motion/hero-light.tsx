"use client";

import { useEffect, useRef } from "react";
import { DERIVATIVES, LIGHT_FRAGMENT, LIGHT_VERTEX, approach, hexColour } from "./light-shader";

/** The drawing buffer's longer side, in pixels: the light is soft, a smaller buffer is enough. */
const BUFFER_SIDE = 960;
/** How fast the light follows the pointer and comes and goes with it (per second). */
const FOLLOW = 5;
const PRESENCE = 3;
/** The moment a reader who asked for less motion sees: one frame, still. */
const STILL_TIME = 18;

type Colour = [number, number, number];

interface Light {
  c1: Colour;
  c2: Colour;
  c3: Colour;
  strength: number;
  lines: number;
}

/** The light's colours and strength from the theme's tokens (`--site-light-*`). */
function readLight(element: HTMLElement): Light | null {
  const style = getComputedStyle(element);
  const colour = (name: string) => hexColour(style.getPropertyValue(name));
  const c1 = colour("--site-light-1");
  const c2 = colour("--site-light-2");
  const c3 = colour("--site-light-3");
  const strength = Number.parseFloat(style.getPropertyValue("--site-light-strength"));
  const lines = Number.parseFloat(style.getPropertyValue("--site-light-lines"));
  if (!c1 || !c2 || !c3 || !Number.isFinite(strength) || !Number.isFinite(lines)) return null;
  return { c1, c2, c3, strength, lines };
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  gl.deleteShader(shader);
  return null;
}

/**
 * The first stage's light: a WebGL canvas behind the stage's content, the flow of light gathering
 * under the pointer. It is decoration — hidden from assistive technology, no pointer events of its own, the stage's CSS
 * light underneath. It draws only while on screen and the tab is visible; for a reader who asked
 * for less motion it draws one still frame and does not follow the pointer. Without WebGL the canvas
 * stays empty and the CSS light is the stage's light.
 */
export function HeroLight() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    // the canvas's box is the light's layer; the stage around it is where the pointer is read
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
    const vertex = compile(gl, gl.VERTEX_SHADER, LIGHT_VERTEX);
    const fine = gl.getExtension("OES_standard_derivatives") !== null;
    const fragment = compile(gl, gl.FRAGMENT_SHADER, (fine ? DERIVATIVES : "") + LIGHT_FRAGMENT);
    const program = gl.createProgram();
    if (!vertex || !fragment || !program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    // one triangle over the whole buffer
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
      c1: at("u_c1"),
      c2: at("u_c2"),
      c3: at("u_c3"),
      strength: at("u_strength"),
      lines: at("u_lines"),
    };

    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let light = readLight(element);
    let frame = 0;
    let last = 0;
    let time = still ? STILL_TIME : 0;
    let onScreen = false;
    const pointer = { x: 0.5, y: 0.82, tx: 0.5, ty: 0.82, presence: 0, target: 0 };

    const size = () => {
      const width = element.clientWidth;
      const height = element.clientHeight;
      const scale = Math.min(1, BUFFER_SIDE / Math.max(width, height, 1));
      element.width = Math.max(1, Math.round(width * scale));
      element.height = Math.max(1, Math.round(height * scale));
      gl.viewport(0, 0, element.width, element.height);
    };

    const draw = () => {
      if (!light) return;
      gl.uniform2f(uniform.res, element.width, element.height);
      gl.uniform1f(uniform.time, time);
      gl.uniform2f(uniform.pointer, pointer.x, pointer.y);
      gl.uniform1f(uniform.presence, pointer.presence);
      gl.uniform3fv(uniform.c1, light.c1);
      gl.uniform3fv(uniform.c2, light.c2);
      gl.uniform3fv(uniform.c3, light.c3);
      gl.uniform1f(uniform.strength, light.strength);
      gl.uniform1f(uniform.lines, light.lines);
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

    // the pointer, in the canvas's own space (0..1, y up); a touch has no hover and is not followed
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
      draw();
    });
    resize.observe(element);
    const view = new IntersectionObserver((entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      if (onScreen) schedule();
      else pause();
    });
    view.observe(element);
    const onVisibility = () => (document.hidden ? pause() : schedule());
    document.addEventListener("visibilitychange", onVisibility);
    // the theme lives on <html>: new tokens, the same light
    const theme = new MutationObserver(() => {
      light = readLight(element);
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
    draw();
    schedule();

    return () => {
      pause();
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
      gl.deleteShader(fragment);
      // the context itself goes with the canvas: StrictMode mounts the same canvas twice
    };
  }, []);

  return (
    <div className="site-hero-light" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
