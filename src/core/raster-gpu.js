/* PixelForge —— 实验性 GPU 渲染后端（WebGL2，实现与 CpuRaster 相同的 Renderer 接口）
 *
 * 设计（双批次双 FBO，不依赖 MRT 扩展，任何 WebGL2 可跑）：
 *   - 颜色缓冲与加法光缓冲各一个 FBO；算子按目标拆成两条实例批次
 *     （mode 2 仅入光批次、mode 3 仅入颜色批次），颜色批次按画家顺序分段
 *   - stamp/ring/beam/pixel 全部解析化进片元着色器，drawArraysInstanced 批量绘制
 *   - 衰减曲线复刻 CPU 的 64 级量化查表（含 stamp 的 t=(d/r)² 语义）
 *
 * 状态：实验性。默认渲染路径仍是 CpuRaster（CPU）；
 * 本文件只被 bench/gpu-bench.html 加载做对比基准，未接入主 UI。
 */
(function (root) {
  'use strict';
  const PF = root.PF || require('./pf.js');

  const VSH = `#version 300 es
  layout(location=0) in vec2 a_corner;
  layout(location=1) in vec2 a_c;
  layout(location=2) in float a_rad;
  layout(location=3) in vec3 a_col;
  layout(location=4) in float a_alpha;
  layout(location=5) in float a_half;
  layout(location=6) in vec2 a_p2;
  layout(location=7) in vec2 a_bbmin;
  layout(location=8) in vec2 a_bbmax;
  layout(location=9) in vec2 a_flags;   /* x: kind + fall/16 */
  layout(location=10) in float a_glow;
  uniform vec2 u_res;
  out vec2 v_c; out float v_rad; out vec3 v_col; out float v_alpha; out float v_glow;
  out float v_half; out vec2 v_p2; out float v_flags;
  void main() {
    v_c = a_c; v_rad = a_rad; v_col = a_col; v_alpha = a_alpha; v_glow = a_glow;
    v_half = a_half; v_p2 = a_p2; v_flags = a_flags.x;
    vec2 p = mix(a_bbmin, a_bbmax, a_corner * 0.5 + 0.5);
    vec2 clip = (p / u_res) * 2.0 - 1.0;
    gl_Position = vec4(clip, 0.0, 1.0);
  }`;

  const FSH = `#version 300 es
  precision highp float;
  in vec2 v_c; in float v_rad; in vec3 v_col; in float v_alpha; in float v_glow;
  in float v_half; in vec2 v_p2; in float v_flags;
  uniform int u_pass;   /* 0=颜色通道 1=光通道 */
  out vec4 o_col;
  float soft(float t) { return pow(1.0 - t, 1.7); }
  float core(float t) { return t < 0.55 ? 1.0 : pow(1.0 - (t - 0.55) / 0.45, 1.5); }
  float beamf(float t) { return pow(1.0 - t, 2.2); }
  float lut(float t, int fall) {
    /* 复刻 CPU 的 64 级量化查表 F[(t*63)|0] */
    int i = int(min(t * 63.0, 62.99));
    float tt = float(i) / 63.0;
    return fall == 2 ? beamf(tt) : (fall == 1 ? core(tt) : soft(tt));
  }
  void main() {
    int kind = int(floor(v_flags + 0.0001));
    int fall = int(round((v_flags - float(kind)) * 16.0));
    vec2 p = gl_FragCoord.xy - 0.5;   /* 与 CPU 一致：整数像素角采样 */
    float f = 0.0;
    if (kind == 3) {                  /* pixel：硬单像素 */
      vec2 idx = floor(p);
      f = (idx.x == floor(v_c.x - 0.5) && idx.y == floor(v_c.y - 0.5)) ? 1.0 : 0.0;
    } else if (kind == 0) {           /* stamp：t = (d/r)^2 */
      vec2 d = p - v_c;
      float t = dot(d, d) / (v_rad * v_rad);
      if (t >= 1.0) discard;
      f = lut(t, fall);
    } else if (kind == 1) {           /* ring：线性 t */
      float t = abs(length(p - v_c) - v_rad) / v_half;
      if (t >= 1.0) discard;
      f = lut(t, fall);
    } else {                          /* beam：到线段距离 */
      vec2 ab = v_p2 - v_c;
      float len2 = max(dot(ab, ab), 1e-6);
      float h = clamp(dot(p - v_c, ab) / len2, 0.0, 1.0);
      vec2 q = v_c + ab * h - p;
      float t = length(q) / v_half;
      if (t >= 1.0) discard;
      f = lut(t, 2);
    }
    if (f <= 0.0) discard;
    float sa = f * v_alpha;
    /* u_pass: 0=颜色预乘(over链) 1=光通道(col*sa*glow, 含加法颜色的 col*sa*1.0 部分) 2=仅累计alpha */
    float rgbK = u_pass == 1 ? v_glow : (u_pass == 2 ? 0.0 : 1.0);
    o_col = vec4(v_col * sa * rgbK, sa);
  }`;

  const BSH = `#version 300 es
  layout(location=0) in vec2 a_p;
  out vec2 v_uv;
  void main() { v_uv = a_p * 0.5 + 0.5; gl_Position = vec4(a_p, 0.0, 1.0); }`;
  const BFS = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_color;
  uniform sampler2D u_light;
  uniform float u_cap;   /* 光缓冲上限 0..1（防剧烈闪烁 <1） */
  out vec4 o;
  void main() {
    vec4 c = texture(u_color, v_uv);
    /* 颜色 FBO 存预乘 RGB（与 CPU over 公式 /oa 一致）→ 此处直通化 */
    vec3 base = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
    vec3 l = min(texture(u_light, v_uv).rgb, vec3(u_cap));
    float la = max(max(l.r, l.g), l.b) * 0.85;
    o = vec4(min(vec3(1.0), base + l), max(c.a, la));
  }`;

  /* 每实例 17 float：c2 rad1 col3 alpha1 glow1 half1 p2 bbmin2 bbmax2 flags2 */
  const STRIDE = 17;
  const MAX_INST = 8192;

  class GpuRaster {
    constructor(canvas, size) {
      this.canvas = canvas;
      const gl = this.gl = canvas.getContext('webgl2', { antialias: false, alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
      if (!gl) throw new Error('WebGL2 不可用');
      this.size = 0;
      this.ts = 1; this.tx = 0; this.ty = 0; this.tstack = [];
      this.flashCap = 1; this.lightOn = true;
      this._init(gl);
      this.resize(size || 256);
    }
    _init(gl) {
      const mk = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
        return s;
      };
      const prog = (vs, fs) => {
        const p = gl.createProgram();
        gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
        return p;
      };
      this.opsProg = prog(VSH, FSH);
      this.compProg = prog(BSH, BFS);
      this.uRes = gl.getUniformLocation(this.opsProg, 'u_res');
      this.uPass = gl.getUniformLocation(this.opsProg, 'u_pass');
      this.cuColor = gl.getUniformLocation(this.compProg, 'u_color');
      this.cuLight = gl.getUniformLocation(this.compProg, 'u_light');
      this.cuCap = gl.getUniformLocation(this.compProg, 'u_cap');
      /* 算子 VAO */
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      this.cornerBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cornerBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(0, 0);
      this.instBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      gl.bufferData(gl.ARRAY_BUFFER, STRIDE * 4 * MAX_INST, gl.DYNAMIC_DRAW);
      const defs = [[1, 2], [2, 1], [3, 3], [4, 1], [5, 1], [6, 2], [7, 2], [8, 2], [9, 2], [10, 1]];
      let off = 0;
      for (const [loc, n] of defs) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, n, gl.FLOAT, false, STRIDE * 4, off * 4);
        gl.vertexAttribDivisor(loc, 1);
        off += n;
      }
      gl.bindVertexArray(null);
      /* 全屏三角形 VAO */
      this.blitVao = gl.createVertexArray();
      gl.bindVertexArray(this.blitVao);
      this.blitBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.blitBuf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      /* 两个目标批次 */
      this.cBuf = new Float32Array(STRIDE * MAX_INST);
      this.lBuf = new Float32Array(STRIDE * MAX_INST);
      this.cn = 0; this.ln = 0;
      this.cBlend = -1;   /* 当前颜色段混合态：0 over / 1 add */
      this.readBuf = null;
    }
    resize(size) {
      const gl = this.gl;
      size = size | 0;
      if (this.size === size) return;
      this.size = size;
      this.canvas.width = size; this.canvas.height = size;
      const mkTex = () => {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return t;
      };
      this.colorTex = mkTex(); this.lightTex = mkTex(); this.outTex = mkTex();
      const mkFbo = (tex) => {
        const f = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, f);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        return f;
      };
      this.colorFbo = mkFbo(this.colorTex);
      this.lightFbo = mkFbo(this.lightTex);
      this.outFbo = mkFbo(this.outTex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.readBuf = new Uint8Array(size * size * 4);
    }
    _p(wx, wy, out) {
      const s = this.ts || 1;
      out[0] = (wx * s + (this.tx || 0)) * 0.5 + 0.5;
      out[1] = (wy * s + (this.ty || 0)) * 0.5 + 0.5;
      return out;
    }
    clear() {
      this.cn = 0; this.ln = 0; this.cBlend = -1;
      const gl = this.gl;
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.colorFbo);
      gl.viewport(0, 0, this.size, this.size);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightFbo);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    fillBg() { /* 背景由显示层处理，导出路径永远 clear */ }

    _put(buf, idx, kind, fall, cx, cy, rp, colorInt, alpha, glow, hw, p2) {
      const o = idx * STRIDE;
      buf[o] = cx; buf[o + 1] = cy; buf[o + 2] = rp;
      buf[o + 3] = ((colorInt >> 16) & 255) / 255;
      buf[o + 4] = ((colorInt >> 8) & 255) / 255;
      buf[o + 5] = (colorInt & 255) / 255;
      buf[o + 6] = alpha;
      buf[o + 7] = hw;
      if (p2) { buf[o + 8] = p2[0]; buf[o + 9] = p2[1]; } else { buf[o + 8] = cx; buf[o + 9] = cy; }
      if (kind === 2 && p2) {
        const e = hw + 1.5;
        buf[o + 10] = Math.min(cx, p2[0]) - e; buf[o + 11] = Math.min(cy, p2[1]) - e;
        buf[o + 12] = Math.max(cx, p2[0]) + e; buf[o + 13] = Math.max(cy, p2[1]) + e;
      } else if (kind === 3) {
        buf[o + 10] = Math.floor(cx - 0.5); buf[o + 11] = Math.floor(cy - 0.5);
        buf[o + 12] = buf[o + 10] + 1; buf[o + 13] = buf[o + 11] + 1;
      } else {
        const e = rp + hw + 1.5;
        buf[o + 10] = cx - e; buf[o + 11] = cy - e; buf[o + 12] = cx + e; buf[o + 13] = cy + e;
      }
      const kf = kind === 2 ? 2 : (fall === 2 ? 2 : (fall === 1 ? 1 : 0));
      buf[o + 14] = kind + kf * 0.0625;
      buf[o + 15] = 0;
      buf[o + 16] = glow;
    }
    _emit(kind, mode, fall, cx, cy, rp, colorInt, alpha, glow, hw, p2) {
      /*
       * 复刻 CPU 混合语义：
       *  mode 0: 颜色FBO预乘over + 光FBO(col*sa*glow)
       *  mode 1: CPU = S+=col*sa 且 L+=col*sa*glow → GPU = 颜色FBO仅累计alpha +
       *          光FBO(col*sa*(1+glow)) —— 合成总和逐位一致
       *  mode 2: 仅光；mode 3: 仅over无光
       */
      if (mode !== 2) {
        const sig = mode === 1 ? 1 : 0;
        if (this.cBlend !== -1 && this.cBlend !== sig) this.flushColor();
        this.cBlend = sig;
        if (this.cn >= MAX_INST) this.flushColor();
        this._put(this.cBuf, this.cn++, kind, fall, cx, cy, rp, colorInt, alpha, mode === 1 ? 0 : glow, hw, p2);
      }
      if (this.lightOn && mode !== 3) {
        if (this.ln >= MAX_INST) this.flushLight();
        this._put(this.lBuf, this.ln++, kind, fall, cx, cy, rp, colorInt, alpha, mode === 1 ? 1 + glow : glow, hw, p2);
      }
    }
    stamp(wx, wy, wr, colorInt, alpha, glow, mode, fall) {
      if (alpha <= 0.002 || wr <= 0) return;
      const S = this.size, PT = [0, 0];
      this._p(wx, wy, PT);
      const rp = wr * (S / 2) * (this.ts || 1);
      if (rp < 0.4) return this.pixel(wx, wy, colorInt, alpha, glow, mode);
      const f = fall === undefined ? 0 : (fall === PF.FALL.CORE ? 1 : (fall === PF.FALL.BEAM ? 2 : 0));
      this._emit(0, mode === undefined ? 0 : mode, f, PT[0] * S, PT[1] * S, rp, colorInt, alpha, glow, 0, null);
    }
    ring(wx, wy, rWorld, halfW, colorInt, alpha, glow, mode) {
      if (alpha <= 0.002 || halfW <= 0 || rWorld < 0) return;
      const S = this.size, PT = [0, 0];
      this._p(wx, wy, PT);
      const rp = rWorld * (S / 2) * (this.ts || 1);
      const hw = Math.max(halfW * (S / 2) * (this.ts || 1), 0.8);
      this._emit(1, mode === undefined ? 0 : mode, 0, PT[0] * S, PT[1] * S, rp, colorInt, alpha, glow, hw, null);
    }
    beam(x1, y1, x2, y2, halfW, colorInt, alpha, glow, mode) {
      if (alpha <= 0.002 || halfW <= 0) return;
      const S = this.size, PT = [0, 0], P2 = [0, 0];
      this._p(x1, y1, PT); this._p(x2, y2, P2);
      const hw = Math.max(halfW * (S / 2) * (this.ts || 1), 0.6);
      this._emit(2, mode === undefined ? 0 : mode, 2, PT[0] * S, PT[1] * S, 0, colorInt, alpha, glow, hw, [P2[0] * S, P2[1] * S]);
    }
    pixel(wx, wy, colorInt, alpha, glow, mode) {
      const S = this.size, PT = [0, 0];
      this._p(wx, wy, PT);
      const px = Math.floor(PT[0] * S), py = Math.floor(PT[1] * S);
      if (px < 0 || py < 0 || px >= S || py >= S || alpha <= 0.002) return;
      this._emit(3, mode === undefined ? 0 : mode, 0, px + 0.5, py + 0.5, 0, colorInt, alpha, glow, 0, null);
    }
    pushTransform(ox, oy, s) {
      (this.tstack || (this.tstack = [])).push(this.tx !== undefined ? [this.tx, this.ty, this.ts] : null);
      this.tx = (this.tx || 0) + (ox || 0) * (this.ts || 1);
      this.ty = (this.ty || 0) + (oy || 0) * (this.ts || 1);
      this.ts = (this.ts || 1) * (s || 1);
    }
    popTransform() {
      const st = this.tstack ? this.tstack.pop() : null;
      if (st) { this.tx = st[0]; this.ty = st[1]; this.ts = st[2]; }
      else { this.tx = 0; this.ty = 0; this.ts = 1; }
    }
    _drawBatch(fbo, buf, count, blend, pass) {
      if (count <= 0) return;
      const gl = this.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, this.size, this.size);
      gl.useProgram(this.opsProg);
      gl.uniform2f(this.uRes, this.size, this.size);
      gl.uniform1i(this.uPass, pass);
      gl.bindVertexArray(this.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
      gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, count * STRIDE), gl.STREAM_DRAW);
      gl.enable(gl.BLEND);
      /* pass 1: 光通道裸加=(ONE,ONE)；pass 2: 仅alpha=(ZERO,ZERO,ONE,ONE)；pass 0: 预乘over */
      if (pass === 1) gl.blendFunc(gl.ONE, gl.ONE);
      else if (pass === 2) gl.blendFuncSeparate(gl.ZERO, gl.ZERO, gl.ONE, gl.ONE);
      else gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }
    flushColor() {
      if (this.cn > 0) this._drawBatch(this.colorFbo, this.cBuf, this.cn, this.cBlend === 1 ? 2 : 0, this.cBlend === 1 ? 2 : 0);
      this.cn = 0;
    }
    flushLight() {
      if (this.ln > 0) this._drawBatch(this.lightFbo, this.lBuf, this.ln, 1, 1);
      this.ln = 0;
    }
    flush() { this.flushColor(); this.flushLight(); }
    /* 双缓冲合成（与 CPU composite 同语义）；skipRead 用于纯渲染计时 */
    composite(out, reduceFlash, skipRead) {
      this.flush();
      const gl = this.gl, S = this.size;
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.outFbo);
      gl.viewport(0, 0, S, S);
      gl.useProgram(this.compProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.colorTex);
      gl.uniform1i(this.cuColor, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
      gl.uniform1i(this.cuLight, 1);
      gl.uniform1f(this.cuCap, (reduceFlash ? 160 : 255) / 255);
      gl.bindVertexArray(this.blitVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!skipRead) gl.readPixels(0, 0, S, S, gl.RGBA, gl.UNSIGNED_BYTE, this.readBuf);
      /* 呈现到画布（预览用） */
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, S, S);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.outTex);
      gl.uniform1i(this.cuColor, 0);
      gl.uniform1f(this.cuCap, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      if (skipRead) return null;
      if (!out || out.length !== S * S * 4) out = new Uint8ClampedArray(S * S * 4);
      out.set(this.readBuf);
      return out;
    }
  }

  PF.GpuRaster = GpuRaster;
  if (typeof module !== 'undefined' && module.exports) module.exports = GpuRaster;
})(typeof globalThis !== 'undefined' ? globalThis : this);
