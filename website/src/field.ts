// The logo's O as a sound field: concentric rings from up to three emitters,
// XOR-ed so they moiré where they cross. One fragment shader, one full-screen
// triangle; frames come from gsap.ticker so a review can step time by hand.

import { gsap } from 'gsap';

export interface Emitter {
  /** CSS px, relative to the canvas. */
  x: number;
  y: number;
  /** 0 switches the emitter off. */
  scale: number;
  /** Clear radius (CSS px) around the centre where no rings are drawn. */
  gap: number;
}

export interface Pocket {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FieldOptions {
  emitters: () => Emitter[];
  /** A calm rect (CSS px, relative to the canvas) that text sits on. */
  pocket?: () => Pocket | null;
  pocketSoft?: number;
  /** A softer rect: the rings dim to `haloFloor` under it instead of vanishing. */
  halo?: () => Pocket | null;
  haloSoft?: number;
  haloFloor?: number;
  spacing?: number;
  /** Radius of the solid centre dot, CSS px; 0 for none. */
  dot?: number;
  /** How far the rings reach, as a share of the canvas's longer side. */
  falloff?: number;
  /** Fade (CSS px) at the canvas's top and bottom so it never ends on a hard edge. */
  edge?: number;
  strength: { light: number; dark: number };
  /** 'page' draws --fg on --bg; 'stage' draws paper on the ink stage. */
  palette: 'page' | 'stage';
  still?: boolean;
}

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_bg;
uniform vec3 u_fg;
uniform vec3 u_accent;
uniform float u_strength;
uniform float u_spacing;
uniform float u_dot;
uniform float u_falloff;
uniform float u_amp;
uniform vec4 u_em[3];
uniform vec4 u_pocket;
uniform float u_soft;
uniform vec4 u_halo;
uniform float u_haloSoft;
uniform float u_haloFloor;
uniform float u_edge;
uniform vec4 u_pulse[4];

float boxDist(vec2 p, vec4 r) {
  vec2 c = (r.xy + r.zw) * 0.5;
  vec2 h = abs(r.zw - r.xy) * 0.5;
  vec2 q = abs(p - c) - h;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float band(float d, float phase) {
  float s = sin(d * 6.2831853 / u_spacing - phase);
  float w = max(fwidth(s), 0.0001) * 1.1;
  return smoothstep(-w, w, s);
}

void main() {
  vec2 p = gl_FragCoord.xy;
  float m = 0.0;
  float fade = 0.0;
  float dots = 0.0;
  float reach = max(u_res.x, u_res.y) * u_falloff;
  for (int i = 0; i < 3; i++) {
    vec4 e = u_em[i];
    if (e.z <= 0.0) continue;
    vec2 v = p - e.xy;
    float d = length(v);
    float wob = sin(atan(v.y, v.x) * 6.0 + u_time * 2.3 + float(i)) * u_amp * 9.0 * e.z;
    float b = band(d + wob, u_time * (1.1 + u_amp * 4.0) + float(i) * 2.1);
    b *= smoothstep(e.w, e.w + 2.0, d);
    m = m + b - 2.0 * m * b;
    fade = max(fade, 1.0 - smoothstep(reach * 0.3 * e.z, reach * e.z, d));
    if (u_dot > 0.0) dots = max(dots, 1.0 - smoothstep(u_dot * e.z - 1.0, u_dot * e.z + 1.0, d));
  }
  float calm = 1.0;
  if (u_soft > 0.0) calm = smoothstep(0.0, u_soft, boxDist(p, u_pocket));
  if (u_haloSoft > 0.0) {
    calm *= mix(u_haloFloor, 1.0, smoothstep(0.0, u_haloSoft, boxDist(p, u_halo)));
  }
  if (u_edge > 0.0) calm *= smoothstep(0.0, u_edge, min(p.y, u_res.y - p.y));
  vec3 col = mix(u_bg, u_fg, m * fade * calm * u_strength);
  col = mix(col, u_fg, dots * calm);
  for (int j = 0; j < 4; j++) {
    vec4 pu = u_pulse[j];
    if (pu.w <= 0.0) continue;
    float age = u_time - pu.z;
    if (age < 0.0 || age > 2.4) continue;
    float r = u_dot + age * u_spacing * 11.0;
    float ring = 1.0 - smoothstep(u_spacing * 0.1, u_spacing * 0.3, abs(length(p - pu.xy) - r));
    col = mix(col, u_accent, ring * (1.0 - age / 2.4) * pu.w * calm);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

function hexToRgb(value: string): [number, number, number] {
  const hex = value.trim().replace('#', '');
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class RingField {
  private readonly gl: WebGLRenderingContext;
  private readonly loc: Record<string, WebGLUniformLocation | null> = {};
  private readonly pulses = new Float32Array(16);
  private pulseSlot = 0;
  private dpr = 1;
  private visible = true;
  private running = false;
  private amp = 0;
  private clock = 0;
  private readonly tick = (time: number) => this.frame(time);

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    program: WebGLProgram,
    private readonly opts: FieldOptions,
  ) {
    this.gl = gl;
    for (const name of [
      'u_res',
      'u_time',
      'u_bg',
      'u_fg',
      'u_accent',
      'u_strength',
      'u_spacing',
      'u_dot',
      'u_falloff',
      'u_amp',
      'u_em',
      'u_pocket',
      'u_soft',
      'u_halo',
      'u_haloSoft',
      'u_haloFloor',
      'u_edge',
      'u_pulse',
    ]) {
      this.loc[name] = gl.getUniformLocation(program, name);
    }
  }

  /** Null when WebGL is unavailable; the page then simply stays plain paper. */
  static create(canvas: HTMLCanvasElement, opts: FieldOptions): RingField | null {
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
    if (!gl || !gl.getExtension('OES_standard_derivatives')) return null;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

    const field = new RingField(canvas, gl, program, opts);
    field.watch();
    return field;
  }

  /** Redraw now, for when emitters or the pocket moved without a resize. */
  refresh(): void {
    this.draw();
  }

  setAmp(level: number): void {
    this.amp = level;
  }

  /** A single accent ring from (x, y) in CSS px. */
  pulse(x: number, y: number, strength = 1): void {
    const h = this.canvas.clientHeight;
    const i = this.pulseSlot * 4;
    this.pulses.set([x * this.dpr, (h - y) * this.dpr, this.clock, strength], i);
    this.pulseSlot = (this.pulseSlot + 1) % 4;
  }

  private watch(): void {
    new ResizeObserver(() => this.resize()).observe(this.canvas);
    new IntersectionObserver(([entry]) => {
      this.visible = entry.isIntersecting;
      this.sync();
    }).observe(this.canvas);
    new MutationObserver(() => this.draw()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    this.resize();
    this.sync();
  }

  private sync(): void {
    const run = this.visible && !this.opts.still;
    if (run && !this.running) gsap.ticker.add(this.tick);
    if (!run && this.running) gsap.ticker.remove(this.tick);
    this.running = run;
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
    this.draw();
  }

  private frame(time: number): void {
    this.clock = time;
    this.draw();
  }

  private colors(): { bg: number[]; fg: number[]; dark: boolean } {
    const css = getComputedStyle(document.documentElement);
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (this.opts.palette === 'stage') {
      return { bg: hexToRgb(css.getPropertyValue('--stage')), fg: hexToRgb('#f3f1ea'), dark: true };
    }
    return {
      bg: hexToRgb(css.getPropertyValue('--bg')),
      fg: hexToRgb(css.getPropertyValue('--fg')),
      dark,
    };
  }

  private draw(): void {
    const { gl, loc, dpr } = this;
    const h = this.canvas.clientHeight;
    const { bg, fg, dark } = this.colors();
    const s = this.opts.strength;

    gl.uniform2f(loc.u_res, this.canvas.width, this.canvas.height);
    gl.uniform1f(loc.u_time, this.clock);
    gl.uniform3fv(loc.u_bg, bg);
    gl.uniform3fv(loc.u_fg, fg);
    gl.uniform3fv(loc.u_accent, hexToRgb('#ff5d5d'));
    gl.uniform1f(loc.u_strength, dark ? s.dark : s.light);
    gl.uniform1f(loc.u_spacing, (this.opts.spacing ?? 22) * dpr);
    gl.uniform1f(loc.u_dot, (this.opts.dot ?? 0) * dpr);
    gl.uniform1f(loc.u_falloff, this.opts.falloff ?? 0.7);
    gl.uniform1f(loc.u_amp, this.amp);
    gl.uniform1f(loc.u_edge, (this.opts.edge ?? 0) * dpr);

    const em = new Float32Array(12);
    this.opts
      .emitters()
      .slice(0, 3)
      .forEach((e, i) => {
        em.set([e.x * dpr, (h - e.y) * dpr, e.scale, e.gap * dpr], i * 4);
      });
    gl.uniform4fv(loc.u_em, em);

    const pocket = this.opts.pocket?.();
    if (pocket) {
      gl.uniform4f(
        loc.u_pocket,
        pocket.x0 * dpr,
        (h - pocket.y1) * dpr,
        pocket.x1 * dpr,
        (h - pocket.y0) * dpr,
      );
      gl.uniform1f(loc.u_soft, (this.opts.pocketSoft ?? 120) * dpr);
    } else {
      gl.uniform1f(loc.u_soft, 0);
    }
    const halo = this.opts.halo?.();
    if (halo) {
      gl.uniform4f(
        loc.u_halo,
        halo.x0 * dpr,
        (h - halo.y1) * dpr,
        halo.x1 * dpr,
        (h - halo.y0) * dpr,
      );
      gl.uniform1f(loc.u_haloSoft, (this.opts.haloSoft ?? 80) * dpr);
      gl.uniform1f(loc.u_haloFloor, this.opts.haloFloor ?? 0.3);
    } else {
      gl.uniform1f(loc.u_haloSoft, 0);
    }
    gl.uniform4fv(loc.u_pulse, this.pulses);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
