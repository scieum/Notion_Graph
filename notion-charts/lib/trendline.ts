import type { TrendlineConfig } from "./types";

export type Pt = { x: number; y: number };

/**
 * Returns a function mapping x -> fitted y for the requested trendline,
 * or null if the fit is impossible (too few points, invalid domain, etc).
 * Moving average is handled by the caller since it is sequence-based.
 */
export function fitTrendline(
  pts: Pt[],
  config: TrendlineConfig,
): ((x: number) => number) | null {
  const clean = pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (clean.length < 2) return null;

  switch (config.type) {
    case "linear":
      return linearOnTransformed(clean, (x) => x, (y) => y, undefined, undefined);
    case "logarithmic": {
      // y = a + b ln(x), requires x > 0
      if (clean.some((p) => p.x <= 0)) return null;
      return linearOnTransformed(clean, (x) => Math.log(x), (y) => y, undefined, undefined);
    }
    case "exponential": {
      // y = a e^(bx), requires y > 0 -> fit ln(y) vs x
      if (clean.some((p) => p.y <= 0)) return null;
      return linearOnTransformed(
        clean,
        (x) => x,
        (y) => Math.log(y),
        (v) => Math.exp(v),
        undefined,
      );
    }
    case "power": {
      // y = a x^b, requires x > 0 and y > 0
      if (clean.some((p) => p.x <= 0 || p.y <= 0)) return null;
      return linearOnTransformed(
        clean,
        (x) => Math.log(x),
        (y) => Math.log(y),
        (v) => Math.exp(v),
        undefined,
      );
    }
    case "polynomial": {
      const degree = Math.min(6, Math.max(2, config.degree ?? 2));
      return polynomialFit(clean, degree);
    }
    default:
      return null;
  }
}

/**
 * Fits a straight line in a (possibly transformed) space:
 *   ty = A + B * tx,  where tx = fx(x), ty = fy(y)
 * then maps the prediction back via invY (defaults to identity).
 */
function linearOnTransformed(
  pts: Pt[],
  fx: (x: number) => number,
  fy: (y: number) => number,
  invY: ((v: number) => number) | undefined,
  invX: ((v: number) => number) | undefined,
): ((x: number) => number) | null {
  void invX;
  const n = pts.length;
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0;
  for (const p of pts) {
    const tx = fx(p.x);
    const ty = fy(p.y);
    sx += tx;
    sy += ty;
    sxx += tx * tx;
    sxy += tx * ty;
  }
  const denom = n * sxx - sx * sx;
  let b: number, a: number;
  if (denom === 0) {
    b = 0;
    a = sy / n;
  } else {
    b = (n * sxy - sx * sy) / denom;
    a = (sy - b * sx) / n;
  }
  const inv = invY ?? ((v: number) => v);
  return (x: number) => inv(a + b * fx(x));
}

/** Polynomial least squares via normal equations, with x centred for stability. */
function polynomialFit(
  pts: Pt[],
  degree: number,
): ((x: number) => number) | null {
  const meanX = pts.reduce((acc, p) => acc + p.x, 0) / pts.length;
  const sd =
    Math.sqrt(
      pts.reduce((acc, p) => acc + (p.x - meanX) ** 2, 0) / pts.length,
    ) || 1;
  const norm = (x: number) => (x - meanX) / sd;

  const m = degree + 1;
  const ata: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  const aty: number[] = new Array(m).fill(0);
  for (const p of pts) {
    const xn = norm(p.x);
    const powers: number[] = new Array(2 * m - 1);
    let v = 1;
    for (let k = 0; k < 2 * m - 1; k++) {
      powers[k] = v;
      v *= xn;
    }
    for (let i = 0; i < m; i++) {
      aty[i] += powers[i] * p.y;
      for (let j = 0; j < m; j++) ata[i][j] += powers[i + j];
    }
  }
  const coeffs = solveLinearSystem(ata, aty);
  if (!coeffs) return null;
  return (x: number) => {
    const xn = norm(x);
    let acc = 0;
    let pw = 1;
    for (let i = 0; i < coeffs.length; i++) {
      acc += coeffs[i] * pw;
      pw *= xn;
    }
    return acc;
  };
}

/** Gaussian elimination with partial pivoting. */
function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

export function trendlineLabel(config: TrendlineConfig): string {
  switch (config.type) {
    case "linear":
      return "선형 추세선";
    case "movingAverage":
      return `이동 평균 (${config.period ?? 3})`;
    case "polynomial":
      return `다항식 (${config.degree ?? 2}차)`;
    case "exponential":
      return "지수 추세선";
    case "logarithmic":
      return "로그 추세선";
    case "power":
      return "거듭제곱 추세선";
    default:
      return "추세선";
  }
}
