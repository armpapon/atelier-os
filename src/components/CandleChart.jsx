export function CandleChart({ candles }) {
  const w = 600, h = 280, pad = 20;
  const allPrices = candles.flatMap(c => [c.h, c.l]);
  const min = Math.min(...allPrices), max = Math.max(...allPrices);
  const range = max - min || 1;
  const cw = (w - pad * 2) / candles.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {candles.map((c, i) => {
        const x = pad + i * cw + cw / 2;
        const y = (v) => h - pad - ((v - min) / range) * (h - pad * 2);
        const up = c.c >= c.o;
        const color = up ? '#6cbf83' : '#e07a6e';
        const bodyTop = y(Math.max(c.o, c.c));
        const bodyBot = y(Math.min(c.o, c.c));
        const bw = Math.max(2, cw * 0.65);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} stroke={color} strokeWidth="1" />
            <rect x={x - bw / 2} y={bodyTop} width={bw} height={Math.max(1, bodyBot - bodyTop)} fill={color} />
          </g>
        );
      })}
    </svg>
  );
}
