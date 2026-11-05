/* PixelForge —— 图层系统（纯函数式时间采样）
 *
 * 核心设计：每个粒子都是 (种子, 层号, 槽号) 的确定函数，状态 = f(t)。
 *   - 零逐帧分配（内存恒定，达成并强于对象池目标）
 *   - 任意时刻 seek = 直接解析求值（无需重放或检查点）
 *   - 循环效果周期内逐位无缝（帧 N 与帧 0 完全一致，由测试保证）
 *   - 预览/拖动/逐帧/导出共享同一求值路径 → 天然一致
 * 运动学：解析积分（阻力指数解 + 重力解析项），轨迹时间连续。
 * 60FPS 为时间轴采样基准 t = k/60；层内所有量均为 t 的连续函数。
 */
(function (root) {
  'use strict';
  const PF = root.PF || require('./pf.js');
  const rngMod = (root.PF && root.PF.rng) ? root.PF.rng : require('./rng.js');
  const { clamp, lerp, easeOutCubic, easeOutQuad, env } = PF;
  const { stream, hashCombine, range2 } = rngMod;
  const TAU = Math.PI * 2;

  /* 解析积分：out[0]=位移(初速项) out[1]=重力位移 out[2]=e^{-kτ} */
  const ITMP = new Float64Array(3);
  function integrate(x0, v0, k, g, tau, out) {
    if (k < 1e-5) {
      out[0] = x0 + v0 * tau;
      out[1] = 0.5 * g * tau * tau;
      out[2] = 1;
      return out;
    }
    const e = Math.exp(-k * tau), ie = 1 - e;
    out[0] = x0 + (v0 / k) * ie;
    out[1] = (g / (k * k)) * (k * tau - ie);
    out[2] = e;
    return out;
  }

  /* 通用粒子形状绘制（拉伸碎片 / 旋转长条 / 圆斑） */
  function drawParticle(R, x, y, size, col, al, glow, mode, kind, dirAng, rot, spLine) {
    if (spLine > 0.001) { /* 速度线：软斑锥形拖尾，60FPS 视觉连续 */
      const ln = spLine;
      for (let q = 0; q < 3; q++) {
        const u2 = q / 2.5;
        R.stamp(x - Math.cos(dirAng) * ln * u2, y - Math.sin(dirAng) * ln * u2, Math.max(size * (1 - u2 * 0.45), 0.002), col, al * (1 - u2 * 0.55), glow, mode);
      }
      return;
    }
    if (kind === 1) { /* 速度方向拉伸 */
      const st = 1 + kind * 0;
      R.beam(x, y, x - Math.cos(dirAng) * size * 5.0, y - Math.sin(dirAng) * size * 5.0, Math.max(size * 0.55, 0.004), col, al, glow, mode);
    } else if (kind === 2) { /* 自旋长条 */
      R.beam(x - Math.cos(rot) * size * 2.4, y - Math.sin(rot) * size * 2.4,
             x + Math.cos(rot) * size * 2.4, y + Math.sin(rot) * size * 2.4,
             Math.max(size * 0.5, 0.004), col, al, glow, mode);
    } else {
      R.stamp(x, y, size, col, al, glow, mode);
    }
  }

  const Layers = {};

  /* ============ burst：一次性碎片/火花爆发 ============ */
  Layers.burst = function (spec, seed, li, modD) {
    const count = Math.max(0, spec.count | 0);
    const pos = spec.pos || [0, 0];
    const ramp = spec.ramp;
    const lifeA = spec.life || [0.3, 0.9];
    const s0r = spec.size0 || [0.02, 0.05];
    const s1r = spec.size1 || [0.0, 0.001];
    const drag = spec.drag === undefined ? 2.2 : spec.drag;
    const grav = spec.grav === undefined ? 0 : spec.grav;
    const kind = spec.kind || 0;          // 0圆斑 1速度拉伸 2自旋长条
    const spin = spec.spin || 0;
    const jitter = spec.jitter || 0;
    const glow = spec.glow === undefined ? 0.9 : spec.glow;
    const mode = spec.mode === undefined ? 1 : spec.mode;
    const flicker = spec.flicker || 0;
    const fadePow = spec.fadePow || 1;
    const spdPow = spec.spdPow === undefined ? 1 : spec.spdPow;
    const t0 = spec.t0 || 0;
    const jitterT = spec.jitterT || 0;
    const driftA = spec.driftA || 0, driftF = spec.driftF || 3;
    const sizePow = spec.sizePow || 1;
    const alphaMul = spec.alpha === undefined ? 1 : spec.alpha;
    const maxLife = lifeA[1] + jitterT;
    const P = new Float64Array(12);

    function slot(j, p) {
      const r = stream(seed, hashCombine(li * 64 + 1, j));
      p[0] = (spec.angle || 0) + (r() - 0.5) * (spec.spread || TAU);
      p[1] = lerp(spec.spd[0], spec.spd[1], Math.pow(r(), spdPow));
      p[2] = range2(r, lifeA[0], lifeA[1]);
      p[3] = range2(r, s0r[0], s0r[1]);
      p[4] = range2(r, s1r[0], s1r[1]);
      p[5] = r();
      p[6] = r();
      p[7] = (r() - 0.5) * 2 * jitter;
      p[8] = (r() - 0.5) * 2 * jitter;
      p[9] = (spec.angle || 0) + (r() - 0.5) * 0.8;
      p[10] = (r() - 0.5) * 2 * spin;
      p[11] = r() * jitterT;
    }

    /* 槽位表：构造期一次性展开全部粒子参数（每槽 12 个 double）。
     * 与逐帧重新求值 slot(j,P) 逐位一致（同一 (seed,层,槽) 恒定），
     * 渲染帧内零 RNG 调用、零闭包分配 —— 符合"零逐帧分配"设计。 */
    const TAB = new Float64Array(count * 12);
    for (let j = 0; j < count; j++) {
      slot(j, P);
      TAB.set(P, j * 12);
    }

    return {
      type: 'burst', t0, maxLife, count, maxActive: count,
      render(t, R) {
        const lt = (modD > 0 ? t % modD : t) - t0;
        if (lt < -jitterT || count <= 0) return;
        for (let j = 0; j < count; j++) {
          const o = j * 12;
          const tau = lt - TAB[o + 11];
          if (tau < 0) continue;
          const L = TAB[o + 2];
          if (tau > L) continue;
          const lf = tau / L;
          const aIn = clamp(tau / Math.min(0.05, L * 0.2), 0, 1);
          const a = aIn * Math.pow(1 - lf, fadePow) * alphaMul;
          if (a < 0.012) continue;
          const spd = TAB[o + 1];
          integrate(TAB[o + 7], Math.cos(TAB[o]) * spd, drag, 0, tau, ITMP);
          const x = pos[0] + ITMP[0] + driftA * Math.sin(driftF * tau + TAB[o + 6] * TAU) * lf;
          integrate(TAB[o + 8], Math.sin(TAB[o]) * spd, drag, grav, tau, ITMP);
          const y = pos[1] + ITMP[0] + ITMP[1];
          const size = Math.max(lerp(TAB[o + 3], TAB[o + 4], Math.pow(lf, sizePow)), 0.002);
          const col = ramp.sample(TAB[o + 5] > 0.002 ? TAB[o + 5] : lf);
          let al = a;
          if (flicker > 0) al *= 1 - flicker * (0.5 + 0.5 * Math.sin(TAU * (6 + TAB[o + 6] * 8) * tau + TAB[o + 6] * TAU));
          drawParticle(R, x, y, size, col, al, glow, mode, kind, TAB[o], TAB[o + 9] + TAB[o + 10] * tau);
        }
      }
    };
  };

  /* ============ vstream：持续发射场（逐槽确定性；循环逐位无缝） ============ */
  Layers.vstream = function (spec, seed, li, modD) {
    const t0 = spec.t0 || 0, t1 = spec.t1 === undefined ? 1 : spec.t1;
    /* 循环效果：发射周期必须与效果周期对齐（或为其整数分之一），
     * 否则接缝处粒子相位错位。非循环时默认 2 秒自转周期。 */
    const cycle = modD > 0 ? modD : Math.max(spec.cycle || 2, 1 / 60);
    const life = spec.life || [0.5, 1.0];
    const maxLife = life[1];
    const pos = spec.pos || [0, 0];
    const ramp = spec.ramp;
    const s0r = spec.size0 || [0.02, 0.05];
    const s1r = spec.size1 || [0.03, 0.08];
    const drag = spec.drag === undefined ? 1.2 : spec.drag;
    const grav = spec.grav === undefined ? 0 : spec.grav;
    const glow = spec.glow === undefined ? 0.6 : spec.glow;
    const mode = spec.mode === undefined ? 1 : spec.mode;
    const flicker = spec.flicker || 0;
    const fadePow = spec.fadePow || 1;
    const jitter = spec.jitter || 0;
    const driftA = spec.driftA || 0, driftF = spec.driftF || 2;
    const kind = spec.kind || 0;
    const speedLine = !!spec.speedLine;
    const alphaMul = spec.alpha === undefined ? 1 : spec.alpha;
    const rate = spec.rate || 0;
    const m = Math.max(1, Math.round(rate * cycle));
    const cycleSteps = Math.max(1, Math.round(cycle * 60));
    const angle = spec.angle || 0, spread = spec.spread || 0;
    const spd = spec.spd || [0, 0];
    const warm = spec.warm !== false;    // 循环层暖启动（开场即满密度）
    const P = new Float64Array(12);

    function slot(i, p) {
      const r = stream(seed, hashCombine(li * 64 + 2, i));
      p[0] = angle + (r() - 0.5) * spread;
      p[1] = range2(r, spd[0], spd[1]);
      p[2] = range2(r, life[0], life[1]);
      p[3] = range2(r, s0r[0], s0r[1]);
      p[4] = range2(r, s1r[0], s1r[1]);
      p[5] = r();
      p[6] = r();
      p[7] = (r() - 0.5) * 2 * jitter;
      p[8] = (r() - 0.5) * 2 * jitter;
      p[9] = ((i + r() * 0.9) / m) * cycleSteps;  // 周期内出生步
      p[10] = r() * TAU;
      p[11] = r() * TAU;
    }

    /* 槽位表：构造期展开（同 burst），帧内零 RNG / 零分配，逐位一致 */
    const TAB = new Float64Array(m * 12);
    for (let i = 0; i < m; i++) {
      slot(i, P);
      TAB.set(P, i * 12);
    }

    return {
      type: 'vstream', t0, maxLife,
      maxActive: Math.ceil(m * maxLife / cycle) + 1,
      render(t, R) {
        if (t < t0 - 0.0001) return;
        const gStep = Math.round(t * 60);
        const cyc = Math.floor(gStep / cycleSteps);
        const inCyc = gStep - cyc * cycleSteps;
        for (let i = 0; i < m; i++) {
          const o = i * 12;
          let d = inCyc - TAB[o + 9];
          if (d < 0) d += cycleSteps;
          const tau = d / 60;
          const L = TAB[o + 2];
          if (tau < 0 || tau > L) continue;
          const spawnT = t - tau;
          if (spawnT > t1 + 1e-9) continue;         // 发射窗口
          if (!warm && spawnT < t0) continue;        // 非循环层不预热
          const lf = tau / L;
          const aIn = clamp(tau / Math.min(0.07, L * 0.25), 0, 1);
          const a = aIn * Math.pow(1 - lf, fadePow) * alphaMul;
          if (a < 0.012) continue;
          const vx = Math.cos(TAB[o]) * TAB[o + 1], vy = Math.sin(TAB[o]) * TAB[o + 1];
          integrate(TAB[o + 7], vx, drag, 0, tau, ITMP);
          let x = pos[0] + TAB[o + 7] + ITMP[0] + driftA * Math.sin(driftF * tau + TAB[o + 10]) * lf;
          integrate(TAB[o + 8], vy, drag, grav, tau, ITMP);
          let y = pos[1] + TAB[o + 8] + ITMP[0] + ITMP[1] + driftA * 0.6 * Math.sin(driftF * 0.8 * tau + TAB[o + 11]) * lf;
          const size = Math.max(lerp(TAB[o + 3], TAB[o + 4], lf), 0.002);
          const col = ramp.sample(TAB[o + 5] > 0.002 ? TAB[o + 5] : lf);
          let al = a;
          if (flicker > 0) al *= 1 - flicker * (0.5 + 0.5 * Math.sin(TAU * (5 + TAB[o + 6] * 9) * tau + TAB[o + 11]));
          drawParticle(R, x, y, size, col, al, glow, mode, kind, TAB[o], 0, speedLine ? Math.max(TAB[o + 1] * (1 / 60) * 1.6, size * 2.2) : 0);
        }
      }
    };
  };

  /* ============ swirl：轨道/漩涡（全解析；循环时自动锁相） ============ */
  Layers.swirl = function (spec, seed, li, modD) {
    const t0 = spec.t0 || 0, t1 = spec.t1 === undefined ? 1 : spec.t1;
    const count = Math.max(0, spec.count | 0);
    const pos = spec.pos || [0, 0];
    const rBase = spec.r === undefined ? 0.4 : spec.r;
    let w = spec.w || 2;
    if (modD > 0) { const k = Math.round(w * modD / TAU); w = TAU * k / modD; } // 循环锁相
    const wJit = modD > 0 ? 0 : (spec.wJit === undefined ? 0.5 : spec.wJit);
    const ramp = spec.ramp;
    const life = spec.life || [t1 - t0, t1 - t0];
    const s0r = spec.size0 || [0.015, 0.03];
    const s1r = spec.size1 || s0r;
    const glow = spec.glow === undefined ? 0.8 : spec.glow;
    const mode = spec.mode === undefined ? 1 : spec.mode;
    const fadePow = spec.fadePow || 1;
    const wob = spec.wob === undefined ? 0.12 : spec.wob;   // 半径摆动
    const wobN = spec.wobN === undefined ? 2 : Math.round(spec.wobN); // 循环安全：整数周期
    const trailK = spec.trailK || 0;
    const converge = modD > 0 ? 0 : (spec.converge || 0);   // 半径收缩（仅非循环）
    const dir = spec.dir === undefined ? 1 : spec.dir;
    const maxL = life[1];
    const P = new Float64Array(8);
    function slot(j, p) {
      const r = stream(seed, hashCombine(li * 64 + 4, j));
      p[0] = r() * TAU;
      p[1] = w * dir * (1 + (r() - 0.5) * 2 * wJit);
      p[2] = rBase * (0.8 + r() * 0.4);
      p[3] = range2(r, life[0], life[1]);
      p[4] = range2(r, s0r[0], s0r[1]);
      p[5] = range2(r, s1r[0], s1r[1]);
      p[6] = r();
      p[7] = r() * TAU;
    }
    /* 槽位表：构造期展开（同 burst/vstream），帧内零 RNG / 零分配，逐位一致 */
    const TAB = new Float64Array(count * 8);
    for (let j = 0; j < count; j++) {
      slot(j, P);
      TAB.set(P, j * 8);
    }
    return {
      type: 'swirl', t0, maxLife: life[1], count, maxActive: count,
      render(t, R) {
        const lt = (modD > 0 ? t % modD : t) - t0;
        if (lt < 0 || lt > t1 - t0 + (modD > 0 ? 0 : maxL)) return;
        for (let j = 0; j < count; j++) {
          const o = j * 8;
          const L = TAB[o + 3];
          let lf, a;
          if (modD > 0) {
            lf = clamp(lt / (t1 - t0), 0, 1);
            a = Math.min(1, lt / 0.15) * Math.min(1, (t1 - t0 - lt) / 0.15);
          } else {
            if (lt > L) continue;
            lf = lt / L;
            a = clamp(lt / Math.min(0.08, L * 0.2), 0, 1) * Math.pow(1 - lf, fadePow);
          }
          if (a < 0.012) continue;
          const rad = TAB[o + 2] + wob * Math.sin(TAU * wobN * lf + TAB[o + 7]) - converge * lt;
          const ang = TAB[o] + TAB[o + 1] * lt;
          const x = pos[0] + Math.cos(ang) * rad;
          const y = pos[1] + Math.sin(ang) * rad;
          const size = lerp(TAB[o + 4], TAB[o + 5], lf);
          const col = ramp.sample(TAB[o + 6] > 0.002 ? TAB[o + 6] : lf);
          if (trailK > 0) {
            const a2 = ang - TAB[o + 1] * trailK;
            R.beam(pos[0] + Math.cos(a2) * rad, pos[1] + Math.sin(a2) * rad, x, y, Math.max(size * 0.5, 0.004), col, a, glow, mode);
          } else {
            R.stamp(x, y, size, col, a, glow, mode);
          }
        }
      }
    };
  };

  /* ============ ring：冲击环 ============ */
  Layers.ring = function (spec, seed, li, modD) {
    const t0 = spec.t0 || 0, t1 = spec.t1 || t0 + 0.5;
    const dur = t1 - t0;
    const pos = spec.pos || [0, 0];
    const r0 = spec.r0 === undefined ? 0.05 : spec.r0;
    const r1 = spec.r1 === undefined ? 0.8 : spec.r1;
    const ease = spec.ease || easeOutCubic;
    const halfW = spec.halfW || 0.035;
    const halfW1 = spec.halfW1 === undefined ? halfW * 0.6 : spec.halfW1;
    const ramp = spec.ramp;
    const alpha = spec.alpha === undefined ? 1 : spec.alpha;
    const glow = spec.glow === undefined ? 1 : spec.glow;
    const mode = spec.mode === undefined ? 1 : spec.mode;
    const atk = spec.attack || Math.min(0.05, dur * 0.15);
    const squishY = spec.squishY || 0;
    /* 颗粒化环：沿圆周分段的确定性噪声 → 破坏"圆规"感 */
    const grain = spec.grain === undefined ? 1 : spec.grain;
    const SEGS = 44;
    const NZ = new Float32Array(SEGS * 3);
    {
      const nr = stream(seed, hashCombine(li * 64 + 7, 911));
      for (let i = 0; i < SEGS; i++) {
        NZ[i * 3] = 0.86 + nr() * 0.28;      // 半径噪声
        NZ[i * 3 + 1] = 0.65 + nr() * 0.8;   // 尺寸噪声
        NZ[i * 3 + 2] = 0.55 + nr() * 0.6;   // 亮度噪声
      }
    }
    return {
      type: 'ring', t0, maxLife: dur, maxActive: 1,
      render(t, R) {
        const lt = (modD > 0 ? t % modD : t) - t0;
        if (lt < 0 || lt > dur) return;
        const u = clamp(lt / dur, 0, 1);
        const a = env(lt, atk, dur * 0.05, Math.max(dur - atk - dur * 0.05, 1e-4)) * alpha;
        if (a < 0.012) return;
        const r = lerp(r0, r1, ease(u));
        const hw = lerp(halfW, halfW1, u);
        const col = ramp.sample(u);
        if (squishY > 0) {
          const K = 30;
          for (let i = 0; i < K; i++) {
            const ang = i / K * TAU;
            /* NZ 扁平表按 [i*3..i*3+2] 存（半径/尺寸/亮度噪声）；
             * 旧实现误写 nz=NZ[i]（number）再取 nz[0] → undefined → NaN → 颗粒全被静默丢弃 */
            const n0 = NZ[i * 3], n1 = NZ[i * 3 + 1], n2 = NZ[i * 3 + 2];
            R.stamp(pos[0] + Math.cos(ang) * r * n0, pos[1] + Math.sin(ang) * r * n0 * squishY,
                    hw * n1, col, a * n2, glow, mode);
          }
          R.ring(pos[0], pos[1], r, hw * 0.6, col, a * 0.4, glow * 0.5, mode);
        } else if (grain > 0) {
          for (let i = 0; i < SEGS; i++) {
            const ang = i / SEGS * TAU;
            const n0 = NZ[i * 3], n1 = NZ[i * 3 + 1], n2 = NZ[i * 3 + 2];
            R.stamp(pos[0] + Math.cos(ang) * r * n0, pos[1] + Math.sin(ang) * r * n0,
                    hw * n1, col, a * n2, glow, mode);
          }
          R.ring(pos[0], pos[1], r, hw * 0.55, col, a * 0.38, glow * 0.55, mode);
        } else {
          R.ring(pos[0], pos[1], r, hw, col, a, glow, mode);
        }
      }
    };
  };

  /* ============ flash：复合闪光（白炽核 + 主色 + 外晕） ============ */
  Layers.flash = function (spec, seed, li, modD) {
    const t0 = spec.t0 || 0, t1 = spec.t1 || t0 + 0.18;
    const dur = t1 - t0;
    const pos = spec.pos || [0, 0];
    const r = spec.r || 0.5;
    const ramp = spec.ramp;
    const alpha = spec.alpha === undefined ? 1 : spec.alpha;
    const glow = spec.glow === undefined ? 1.6 : spec.glow;
    const mode = spec.mode === undefined ? 1 : spec.mode;
    const atk = spec.attack || Math.min(0.035, dur * 0.3);
    /* 确定性位移抖动：破除完美圆形 */
    const jr = stream(seed, hashCombine(li * 64 + 8, 13));
    const JX = (jr() - 0.5) * 0.06, JY = (jr() - 0.5) * 0.06;
    return {
      type: 'flash', t0, maxLife: dur, maxActive: 1,
      render(t, R) {
        const lt = (modD > 0 ? t % modD : t) - t0;
        if (lt < 0 || lt > dur) return;
        const u = clamp(lt / dur, 0, 1);
        const a = env(lt, atk, 0, Math.max(dur - atk, 1e-4)) * alpha;
        if (a < 0.012) return;
        const grow = 0.7 + 0.5 * easeOutQuad(u);
        const x = pos[0] + JX * u, y = pos[1] + JY * u;
        /* 外晕（淡主色，大半径，低alpha） */
        R.stamp(x, y, r * grow * 1.5, ramp.sample(Math.min(0.55, 0.25 + u)), a * 0.28, glow * 0.6, mode, PF.FALL.SOFT);
        /* 主色体 */
        R.stamp(x, y, r * grow, ramp.sample(Math.min(0.85, 0.35 + u * 0.8)), a * 0.75, glow, mode, PF.FALL.SOFT);
        /* 白炽核心 */
        R.stamp(x, y, r * grow * 0.42, ramp.sample(1), Math.min(1, a * 1.25), glow * 0.8, mode, PF.FALL.CORE);
      }
    };
  };

  /* ============ beam：光束/光柱 ============ */
  Layers.beam = function (spec, seed, li, modD) {
    const t0 = spec.t0 || 0, t1 = spec.t1 || t0 + 0.4;
    const dur = t1 - t0;
    const from = spec.from || [0, -1.3];
    const to = spec.to || [0, 0.4];
    const w0 = spec.width || 0.08, w1 = spec.width1 === undefined ? w0 * 0.4 : spec.width1;
    const ramp = spec.ramp;
    const alpha = spec.alpha === undefined ? 1 : spec.alpha;
    const glow = spec.glow === undefined ? 1.2 : spec.glow;
    const mode = spec.mode === undefined ? 1 : spec.mode;
    const grow = spec.grow === undefined ? 0.25 : spec.grow;
    const core = spec.core !== false;
    const atk = spec.attack || Math.min(0.04, dur * 0.15);
    return {
      type: 'beam', t0, maxLife: dur, maxActive: 1,
      render(t, R) {
        const lt = (modD > 0 ? t % modD : t) - t0;
        if (lt < 0 || lt > dur) return;
        const u = clamp(lt / dur, 0, 1);
        const a = env(lt, atk, dur * 0.1, Math.max(dur - atk - dur * 0.1, 1e-4)) * alpha;
        if (a < 0.012) return;
        const head = grow <= 0 ? 1 : clamp(lt / (dur * grow), 0, 1);
        const ex = lerp(from[0], to[0], head), ey = lerp(from[1], to[1], head);
        const w = lerp(w0, w1, u);
        R.beam(from[0], from[1], ex, ey, w, ramp.sample(u), a, glow, mode);
        if (core) R.beam(from[0], from[1], ex, ey, w * 0.38, ramp.sample(1), a * 0.9, glow * 0.5, mode);
      }
    };
  };

  /* ============ arc：挥砍弧光 ============ */
  Layers.arc = function (spec, seed, li, modD) {
    const t0 = spec.t0 || 0, t1 = spec.t1 || t0 + 0.25;
    const dur = t1 - t0;
    const c = spec.pos || [0, 0];
    const r = spec.r === undefined ? 0.55 : spec.r;
    const r1 = spec.r1 === undefined ? r : spec.r1;
    const a0 = spec.a0 === undefined ? -2.4 : spec.a0;
    const a1 = spec.a1 === undefined ? 0.6 : spec.a1;
    const width = spec.width || 0.05;
    const trail = spec.trail === undefined ? 1.1 : spec.trail;   // 尾迹弧长(弧度)
    const ramp = spec.ramp;
    const alpha = spec.alpha === undefined ? 1 : spec.alpha;
    const glow = spec.glow === undefined ? 1 : spec.glow;
    const mode = spec.mode === undefined ? 1 : spec.mode;
    const ease = spec.ease || easeOutQuad;
    const dir = (a1 >= a0) ? 1 : -1;
    const N = 14;
    return {
      type: 'arc', t0, maxLife: dur, maxActive: 1,
      render(t, R) {
        const lt = (modD > 0 ? t % modD : t) - t0;
        if (lt < 0 || lt > dur) return;
        const u = clamp(lt / dur, 0, 1);
        const a = Math.sin(clamp(u, 0, 1) * Math.PI) * alpha;
        if (a < 0.012) return;
        const ang = lerp(a0, a1, ease(u));
        const rad = lerp(r, r1, u);
        const spread = trail * Math.min(1, 0.35 + u * 1.6);
        for (let i = 0; i < N; i++) {
          const q = i / (N - 1);
          const tha = ang - dir * spread * q;
          const x = c[0] + Math.cos(tha) * rad, y = c[1] + Math.sin(tha) * rad;
          const ta = 1 - q;
          R.stamp(x, y, Math.max(lerp(width, width * 0.3, q) * (0.45 + ta * 0.55), 0.003),
                  ramp.sample(1 - q * 0.75), a * ta * ta, glow, mode);
        }
      }
    };
  };

  /* ============ bolt：闪电折线（按代确定性重生成） ============ */
  Layers.bolt = function (spec, seed, li, modD) {
    const t0 = spec.t0 || 0, t1 = spec.t1 || t0 + 0.3;
    const dur = t1 - t0;
    const from = spec.from || [0, -1.3];
    const to = spec.to || [0, 0.35];
    const segs = spec.segs || 9;
    const jag = spec.jag || 0.09;
    const branches = spec.branches === undefined ? 2 : spec.branches;
    const regen = spec.regen || 0.045;
    const boltLife = Math.min(spec.life || 0.14, regen * 1.02);
    const ramp = spec.ramp;
    const alpha = spec.alpha === undefined ? 1 : spec.alpha;
    const glow = spec.glow === undefined ? 1.4 : spec.glow;
    const coreW = spec.coreW || 0.018;
    const glowW = spec.glowW || 0.05;
    const impact = spec.impact !== false;
    const maxPts = (segs + 1) + branches * 4;
    const PTS = new Float32Array(maxPts * 2);
    const segList = new Int32Array(maxPts * 2);  // [fromIdx, toIdx] 对
    function genPoly(gi) {
      let n = 0;
      PTS[0] = from[0]; PTS[1] = from[1]; n = 1;
      const r = stream(seed, hashCombine(li * 64 + 6, gi));
      const dx = to[0] - from[0], dy = to[1] - from[1];
      const len = Math.max(0.001, Math.hypot(dx, dy));
      const nx = -dy / len, ny = dx / len;
      for (let i = 1; i < segs; i++) {
        const q = i / segs;
        const off = (r() - 0.5) * 2 * jag;
        PTS[n * 2] = from[0] + dx * q + nx * off;
        PTS[n * 2 + 1] = from[1] + dy * q + ny * off;
        n++;
      }
      PTS[n * 2] = to[0]; PTS[n * 2 + 1] = to[1]; n++;
      let segN = 0;
      for (let i = 0; i < n - 1; i++) { segList[segN * 2] = i; segList[segN * 2 + 1] = i + 1; segN++; }
      /* 分支：从主干某点出发的短折线 */
      for (let b = 0; b < branches; b++) {
        const bi = 1 + ((r() * (segs - 1)) | 0);
        const bx = PTS[bi * 2], by = PTS[bi * 2 + 1];
        const blen = 0.12 + r() * 0.3;
        const bang = Math.atan2(dy, dx) + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.9);
        let px = bx, py = by;
        const bsegs = 3;
        for (let i2 = 1; i2 <= bsegs; i2++) {
          const q = i2 / bsegs;
          const qx = bx + Math.cos(bang) * blen * q + (r() - 0.5) * jag * 0.8;
          const qy = by + Math.sin(bang) * blen * q + (r() - 0.5) * jag * 0.8;
          PTS[n * 2] = qx; PTS[n * 2 + 1] = qy;
          segList[segN * 2] = (i2 === 1 ? bi : n - 1);
          segList[segN * 2 + 1] = n;
          n++; segN++;
          px = qx; py = qy;
        }
      }
      return segN;
    }
    return {
      type: 'bolt', t0, maxLife: dur, maxActive: 1,
      render(t, R) {
        const lt = (modD > 0 ? t % modD : t) - t0;
        if (lt < 0 || lt > dur) return;
        const gi = Math.floor(lt / regen);
        const age = lt - gi * regen;
        const a = alpha * (1 - age / boltLife);
        if (a <= 0.012) return;
        const segN = genPoly(gi);
        for (let s = 0; s < segN; s++) {
          const i1 = segList[s * 2], i2 = segList[s * 2 + 1];
          const x1 = PTS[i1 * 2], y1 = PTS[i1 * 2 + 1], x2 = PTS[i2 * 2], y2 = PTS[i2 * 2 + 1];
          const isBranch = i1 >= segs + 1;
          if (isBranch) {
            R.beam(x1, y1, x2, y2, coreW * 0.55, ramp.sample(0.92), a * 0.7, glow * 0.6, 0);
          } else {
            R.beam(x1, y1, x2, y2, glowW, ramp.sample(0.55), a * 0.5, glow, 2);
            R.beam(x1, y1, x2, y2, coreW, ramp.sample(1), a, glow * 0.4, 0);
          }
        }
        if (impact && age < regen * 0.8) R.stamp(to[0], to[1], 0.14, ramp.sample(1), a, 1.6, 1);
      }
    };
  };

  /* ============ glowspot：呼吸辉光底光 ============ */
  Layers.glowspot = function (spec, seed, li, modD) {
    const t0 = spec.t0 || 0, t1 = spec.t1 === undefined ? 1 : spec.t1;
    const span = t1 - t0;
    const pos = spec.pos || [0, 0];
    const r = spec.r || 0.3;
    const ramp = spec.ramp;
    const alpha = spec.alpha === undefined ? 0.5 : spec.alpha;
    const glow = spec.glow === undefined ? 1 : spec.glow;
    const mode = spec.mode === undefined ? 1 : spec.mode;
    let pulse = spec.pulse || 0;
    if (modD > 0 && pulse > 0) { const k = Math.round(pulse * modD); pulse = k / modD; } // 循环锁相
    return {
      type: 'glowspot', t0, maxLife: span, maxActive: 1,
      render(t, R) {
        const lt = (modD > 0 ? t % modD : t) - t0;
        if (lt < 0 || lt > span) return;
        const u = lt / span;
        let a = alpha * Math.min(1, lt / 0.12) * Math.min(1, (span - lt) / 0.2);
        if (pulse > 0) a *= 0.75 + 0.25 * Math.sin(TAU * pulse * t);
        if (a < 0.012) return;
        R.stamp(pos[0], pos[1], r, ramp.sample(u * 0.4 + 0.3), a, glow, mode);
      }
    };
  };

  Layers.make = function (spec, seed, li, modD) {
    const fn = Layers[spec.type];
    if (!fn) throw new Error('未知图层类型: ' + spec.type);
    return fn(spec, seed, li, modD || 0);
  };
  Layers.maxActive = function (layers) {
    let s = 0;
    for (let i = 0; i < layers.length; i++) s += layers[i].maxActive || 0;
    return s;
  };

  PF.Layers = Layers;
  if (typeof module !== 'undefined' && module.exports) module.exports = Layers;
})(typeof globalThis !== 'undefined' ? globalThis : this);
