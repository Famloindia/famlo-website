function hashString(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function paletteForSeed(seed: string): [string, string] {
  const palettes: Array<[string, string]> = [
    ["#dbeafe", "#bfdbfe"],
    ["#e0f2fe", "#bae6fd"],
    ["#dcfce7", "#bbf7d0"],
    ["#fef3c7", "#fde68a"],
    ["#fce7f3", "#fbcfe8"],
    ["#ede9fe", "#ddd6fe"],
    ["#e2e8f0", "#cbd5e1"],
  ];

  return palettes[hashString(seed) % palettes.length] ?? palettes[0]!;
}

export function getBlurDataUrl(seed: string): string {
  const [start, end] = paletteForSeed(seed);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 20" preserveAspectRatio="none">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="${start}" offset="0%"/>
          <stop stop-color="${end}" offset="100%"/>
        </linearGradient>
      </defs>
      <rect width="32" height="20" fill="url(#g)"/>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
