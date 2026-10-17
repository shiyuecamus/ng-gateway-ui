import type { TrendPoint } from '@vben/types';

function tsLabel(ts: number): string {
  const d = new Date(ts);
  const mm = `${d.getMinutes()}`.padStart(2, '0');
  const ss = `${d.getSeconds()}`.padStart(2, '0');
  return `${mm}:${ss}`;
}

function shouldShowTick(ts: number, stepSeconds: number): boolean {
  const d = new Date(ts);
  const s = d.getSeconds();
  return s % stepSeconds === 0;
}

export function buildLineChartOption(args: {
  isDark?: boolean;
  series: Array<{
    area?: boolean;
    color: string;
    data: TrendPoint[];
    name: string;
  }>;
  title?: string;
  unit?: string;
  xTickStepSeconds?: number;
  yMax?: number;
  yMin?: number;
}): any {
  const xTickStepSeconds = args.xTickStepSeconds ?? 10;
  const isDark = args.isDark ?? true;
  const textColor = isDark ? 'rgba(255,255,255,0.75)' : 'rgba(15,23,42,0.78)';
  const axisLabelColor = isDark
    ? 'rgba(255,255,255,0.55)'
    : 'rgba(15,23,42,0.60)';
  const axisLineColor = isDark
    ? 'rgba(255,255,255,0.15)'
    : 'rgba(15,23,42,0.12)';
  const splitLineColor = isDark
    ? 'rgba(255,255,255,0.10)'
    : 'rgba(15,23,42,0.08)';
  const tooltipBg = isDark ? 'rgba(2,6,23,0.88)' : 'rgba(255,255,255,0.96)';
  const tooltipText = isDark ? 'rgba(255,255,255,0.92)' : 'rgba(15,23,42,0.92)';

  const series = args.series.map((s) => ({
    name: s.name,
    type: 'line',
    smooth: true,
    showSymbol: false,
    emphasis: { focus: 'series' },
    lineStyle: { width: 2, color: s.color },
    itemStyle: { color: s.color },
    areaStyle: s.area
      ? {
          opacity: 0.22,
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: s.color },
              { offset: 1, color: 'rgba(0,0,0,0)' },
            ],
          },
        }
      : undefined,
    // Use time axis so we can correctly render last 1 minute even if samples
    // arrive faster/slower than 1Hz.
    data: s.data.map((p) => [p.ts, p.v]),
  }));

  return {
    backgroundColor: 'transparent',
    grid: { left: 12, right: 12, top: 28, bottom: 26, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line' },
      backgroundColor: tooltipBg,
      borderWidth: 0,
      textStyle: { color: tooltipText },
      extraCssText: isDark
        ? 'box-shadow: 0 12px 32px rgba(0,0,0,0.45); border-radius: 10px;'
        : 'box-shadow: 0 12px 32px rgba(2,6,23,0.12); border-radius: 10px;',
      valueFormatter: (v: any) => {
        const num = typeof v === 'number' ? v : Number(v);
        if (!Number.isFinite(num)) return `${v}`;
        const unit = args.unit ? ` ${args.unit}` : '';
        let decimals = 2;
        if (num >= 100) decimals = 0;
        else if (num >= 10) decimals = 1;
        return `${num.toFixed(decimals)}${unit}`;
      },
    },
    legend: {
      top: 0,
      left: 0,
      textStyle: { color: textColor },
      icon: 'roundRect',
      itemWidth: 10,
      itemHeight: 10,
    },
    xAxis: {
      type: 'time',
      boundaryGap: false,
      splitNumber: 6,
      axisLabel: {
        color: axisLabelColor,
        hideOverlap: true,
        formatter: (v: any) => {
          const n = typeof v === 'number' ? v : Number(v);
          if (!Number.isFinite(n)) return `${v}`;
          // Reduce label density: show 00:00 / 00:10 / 00:20 ... style ticks.
          return shouldShowTick(n, xTickStepSeconds) ? tsLabel(n) : '';
        },
      },
      axisLine: { lineStyle: { color: axisLineColor } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: args.yMin,
      max: args.yMax,
      axisLabel: { color: axisLabelColor },
      splitLine: { lineStyle: { color: splitLineColor } },
    },
    series,
    animation: true,
    animationDuration: 300,
    animationEasing: 'quadraticOut',
  };
}
