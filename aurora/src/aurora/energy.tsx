import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

export const ENERGY_STATES = [
  'idle',
  'anticipating',
  'receiving',
  'processing',
  'responding',
] as const;

export type EnergyState = (typeof ENERGY_STATES)[number];

const mountedStages = new Set<symbol>();

export function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

// Authoral alpha-composited WebGL2 luminous perimeter shader.
// Uses continuous CPU-integrated phase and smoothed spread so state transitions
// never teleport or flicker across 60Hz and 120Hz displays.
const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform float u_phase;      // continuously integrated phase (zero jumps on state change)
uniform float u_spread;     // smoothly blended center floor (0.10..0.32)
uniform float u_intensity;  // 0..1 blended intensity
uniform float u_dynamic;    // 0..0.6 voice/audio reactivity
uniform vec2 u_res;
uniform vec3 u_primary;
uniform vec3 u_secondary;
uniform vec3 u_tertiary;
uniform float u_dark;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  if (u_intensity <= 0.004) {
    outColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  vec2 uv = v_uv;
  float ratio = max(1.0, u_res.x / max(1.0, u_res.y));
  float edgeX = min(uv.x, 1.0 - uv.x);
  float edgeY = min(uv.y, 1.0 - uv.y);
  float minEdge = min(edgeX * ratio, edgeY);

  float t = u_phase;

  vec2 c1 = vec2(0.20 + 0.28 * sin(t * 0.65), 0.12 + 0.14 * cos(t * 0.52));
  vec2 c2 = vec2(0.80 + 0.22 * cos(t * 0.58 + 1.3), 0.88 + 0.14 * sin(t * 0.48));
  vec2 c3 = vec2(0.50 + 0.34 * sin(t * 0.44 + 2.5), 0.06 + 0.12 * sin(t * 0.7));

  float d1 = length((uv - c1) * vec2(ratio * 0.55, 1.2));
  float d2 = length((uv - c2) * vec2(ratio * 0.55, 1.2));
  float d3 = length((uv - c3) * vec2(ratio * 0.48, 1.3));

  float n = noise(uv * vec2(3.0, 2.2) + vec2(t * 0.22, -t * 0.16));
  float wave = 0.5 + 0.5 * sin(uv.x * 4.2 + t * 1.2 + n * 2.0);

  float g1 = exp(-d1 * d1 * (2.5 - u_dynamic * 1.1));
  float g2 = exp(-d2 * d2 * (2.6 - u_dynamic * 1.0));
  float g3 = exp(-d3 * d3 * 2.9);

  float perimeterMask = smoothstep(0.55, 0.0, minEdge);
  float field = (g1 * 0.62 + g2 * 0.52 + g3 * 0.42) * mix(u_spread, 1.0, perimeterMask);
  float rim = smoothstep(0.09, 0.0, minEdge) * (0.48 + 0.52 * wave);

  float mask = clamp((field + rim * 0.58) * u_intensity * (1.0 + u_dynamic * 1.1), 0.0, 1.0);
  vec3 tint = mix(u_primary, u_secondary, clamp(g2 + wave * 0.32, 0.0, 1.0));
  tint = mix(tint, u_tertiary, clamp(g3 * 0.42 * (0.5 + 0.5 * sin(t)), 0.0, 0.4));

  float alpha = mask * mix(0.28, 0.34, u_dark);
  outColor = vec4(tint * alpha, alpha);
}
`;

function parseCssColor(raw: string, fallback: [number, number, number]): [number, number, number] {
  const s = raw.trim();
  if (!s) return fallback;
  const hex = s.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const rgb = s.match(/rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/i);
  if (rgb) {
    return [
      Math.min(1, parseFloat(rgb[1]) / 255),
      Math.min(1, parseFloat(rgb[2]) / 255),
      Math.min(1, parseFloat(rgb[3]) / 255),
    ];
  }
  return fallback;
}

function readTokenRgb(varName: string, fallback: [number, number, number]): [number, number, number] {
  if (typeof document === 'undefined') return fallback;
  const probe = document.createElement('span');
  probe.style.color = `var(${varName})`;
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return parseCssColor(resolved, fallback);
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function stateTargetIntensity(state: EnergyState): number {
  switch (state) {
    case 'idle':
      return 0;
    case 'anticipating':
      return 0.46;
    case 'receiving':
      return 0.88;
    case 'processing':
      return 0.94;
    case 'responding':
      return 0.8;
  }
}

function stateTargetSpeed(state: EnergyState): number {
  switch (state) {
    case 'idle':
      return 0.36;
    case 'anticipating':
      return 0.38;
    case 'receiving':
      return 0.96;
    case 'processing':
      return 1.18;
    case 'responding':
      return 0.78;
  }
}

function stateTargetSpread(state: EnergyState): number {
  return state === 'processing' ? 0.32 : 0.1;
}

export interface AuroraEnergyProps {
  state: EnergyState;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * Authoral WebGL2 luminous stage container.
 * Uses alpha compositing over CSS surfaces with delta-time exponential smoothing,
 * enforces at most one mounted luminous stage per screen, and respects reduced motion.
 */
export function AuroraEnergy({ state, className = '', style, children }: AuroraEnergyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = usePrefersReducedMotion();
  const effectiveState: EnergyState = reduced ? 'idle' : state;
  const stateRef = useRef<EnergyState>(effectiveState);
  const reducedRef = useRef<boolean>(reduced);
  const kickRef = useRef<(() => void) | null>(null);
  stateRef.current = effectiveState;
  reducedRef.current = reduced;

  useEffect(() => {
    const id = Symbol('luminous-stage');
    mountedStages.add(id);
    const peak = Math.max(
      mountedStages.size,
      Number(document.documentElement.dataset.energyPeak ?? 0)
    );
    document.documentElement.dataset.energyPeak = String(peak);
    if (mountedStages.size > 1) {
      console.error(
        `[jamshelf] ${mountedStages.size} luminous stages mounted simultaneously. Only one is allowed.`
      );
    }
    return () => {
      mountedStages.delete(id);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });

    if (!gl) return;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }

    const posBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, 'a_pos');
    const uPhase = gl.getUniformLocation(program, 'u_phase');
    const uSpread = gl.getUniformLocation(program, 'u_spread');
    const uIntensity = gl.getUniformLocation(program, 'u_intensity');
    const uDynamic = gl.getUniformLocation(program, 'u_dynamic');
    const uRes = gl.getUniformLocation(program, 'u_res');
    const uPrimary = gl.getUniformLocation(program, 'u_primary');
    const uSecondary = gl.getUniformLocation(program, 'u_secondary');
    const uTertiary = gl.getUniformLocation(program, 'u_tertiary');
    const uDark = gl.getUniformLocation(program, 'u_dark');

    let colors = {
      primary: readTokenRgb('--ui-glow-primary', [0.17, 0.49, 1.0]),
      secondary: readTokenRgb('--ui-glow-secondary', [0.56, 0.54, 1.0]),
      tertiary: readTokenRgb('--ui-glow-tertiary', [0.22, 0.74, 0.97]),
      dark: 0,
    };

    const refreshColors = () => {
      const surface = readTokenRgb('--ui-surface-card', [1, 1, 1]);
      const lum = surface[0] * 0.299 + surface[1] * 0.587 + surface[2] * 0.114;
      colors = {
        primary: readTokenRgb('--ui-glow-primary', [0.17, 0.49, 1.0]),
        secondary: readTokenRgb('--ui-glow-secondary', [0.56, 0.54, 1.0]),
        tertiary: readTokenRgb('--ui-glow-tertiary', [0.22, 0.74, 0.97]),
        dark: lum < 0.45 ? 1 : 0,
      };
    };

    refreshColors();

    let raf = 0;
    let lastMs = performance.now();
    let phaseSec = 0;
    let currentIntensity = 0;
    let currentDynamic = 0;
    let currentSpeed = stateTargetSpeed(stateRef.current);
    let currentSpread = stateTargetSpread(stateRef.current);
    let voiceStart: number | null = null;

    const drawFrame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastMs) / 1000));
      lastMs = now;

      if (reducedRef.current) {
        currentIntensity = 0;
        currentDynamic = 0;
        voiceStart = null;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        return;
      }

      const st = stateRef.current;
      const target = stateTargetIntensity(st);
      const tau = target > currentIntensity ? 0.24 : 0.42;
      const blend = 1 - Math.exp(-dt / tau);
      currentIntensity += (target - currentIntensity) * blend;

      const slew = 1 - Math.exp(-dt / 0.35);
      currentSpeed += (stateTargetSpeed(st) - currentSpeed) * slew;
      currentSpread += (stateTargetSpread(st) - currentSpread) * slew;
      phaseSec += dt * currentSpeed;

      let targetDynamic = 0;
      if (st === 'receiving' || st === 'responding') {
        voiceStart ??= now;
        const phraseMs = 2500;
        const cycleMs = phraseMs + 1000;
        const elapsed = (now - voiceStart) % cycleMs;
        if (elapsed < phraseMs) {
          const s = elapsed / 1000;
          const wave = Math.sin(s * 4) * 0.15 + Math.sin(s * 1.5) * 0.15 + 0.3;
          const env = Math.sin((elapsed / phraseMs) * Math.PI);
          targetDynamic = Math.max(0, Math.min(0.6, wave * env));
        }
      } else {
        voiceStart = null;
      }
      currentDynamic += (targetDynamic - currentDynamic) * (1 - Math.exp(-dt / 0.22));

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform1f(uPhase, phaseSec);
      gl.uniform1f(uSpread, currentSpread);
      gl.uniform1f(uIntensity, currentIntensity);
      gl.uniform1f(uDynamic, currentDynamic);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform3fv(uPrimary, colors.primary);
      gl.uniform3fv(uSecondary, colors.secondary);
      gl.uniform3fv(uTertiary, colors.tertiary);
      gl.uniform1f(uDark, colors.dark);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const render = (now: number) => {
      if (document.hidden) {
        raf = 0;
        return;
      }
      drawFrame(now);
      if (
        reducedRef.current ||
        (stateRef.current === 'idle' && currentIntensity < 0.004 && currentDynamic < 0.004)
      ) {
        currentIntensity = 0;
        currentDynamic = 0;
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(render);
    };

    const kick = () => {
      if (reducedRef.current) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        drawFrame(performance.now());
        return;
      }
      if (!raf && !document.hidden) {
        lastMs = performance.now();
        raf = requestAnimationFrame(render);
      }
    };
    kickRef.current = kick;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      drawFrame(performance.now());
    };

    const themeObs = new MutationObserver(() => {
      refreshColors();
      drawFrame(performance.now());
    });
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'data-theme', 'data-palette'],
    });
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => {
      refreshColors();
      drawFrame(performance.now());
    };
    mql.addEventListener('change', onScheme);

    const onVisibility = () => {
      if (!document.hidden && (stateRef.current !== 'idle' || currentIntensity >= 0.004)) {
        kick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    kick();

    return () => {
      kickRef.current = null;
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      themeObs.disconnect();
      mql.removeEventListener('change', onScheme);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteBuffer(posBuf);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, []);

  useEffect(() => {
    kickRef.current?.();
  }, [effectiveState, reduced]);

  return (
    <div
      className={`luminous-stage ${className}`.trim()}
      data-aurora-energy={effectiveState}
      style={style}
    >
      <canvas ref={canvasRef} className="luminous-stage-canvas" aria-hidden="true" />
      <div className="luminous-stage-content">{children}</div>
    </div>
  );
}

export function useEnergyTask() {
  const [state, setState] = useState<EnergyState>('idle');
  const alive = useRef(true);
  const bloomTimerRef = useRef<number | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (bloomTimerRef.current !== null) {
        window.clearTimeout(bloomTimerRef.current);
        bloomTimerRef.current = null;
      }
    };
  }, []);

  const clearBloomTimer = useCallback(() => {
    if (bloomTimerRef.current !== null) {
      window.clearTimeout(bloomTimerRef.current);
      bloomTimerRef.current = null;
    }
  }, []);

  const set = useCallback(
    (next: EnergyState) => {
      clearBloomTimer();
      if (alive.current) setState(next);
    },
    [clearBloomTimer]
  );

  const bloom = useCallback(
    (next: EnergyState, durationMs = 3000) => {
      clearBloomTimer();
      if (!alive.current) return;
      setState(next);
      bloomTimerRef.current = window.setTimeout(() => {
        bloomTimerRef.current = null;
        if (alive.current) setState('idle');
      }, durationMs);
    },
    [clearBloomTimer]
  );

  const run = useCallback(
    async (task: (setEnergy: (s: EnergyState) => void) => Promise<void>) => {
      clearBloomTimer();
      try {
        await task(set);
      } finally {
        set('idle');
      }
    },
    [set, clearBloomTimer]
  );

  const rest = useCallback(() => set('idle'), [set]);

  return { state, set, bloom, run, rest };
}
