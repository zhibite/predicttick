export interface StrategyExample {
  id: string;
  name: string;
  description: string;
  source: string;
}

const favorite = `const meta = { mode: "point", decisionBeforeEnd: 60 };
const params = { maxAsk: 0.92, stake: 10 };

function onWindow(ctx) {
  const s = ctx.latest;
  if (!s || s.up.mid == null || s.down.mid == null) return null;
  const side = s.up.mid >= s.down.mid ? "UP" : "DOWN";
  const book = side === "UP" ? s.up : s.down;
  if (book.ask == null || book.ask > ctx.params.maxAsk) return null;
  return { action: "enter", side, stake: ctx.params.stake };
}`;

const underdog = `const meta = { mode: "point", decisionBeforeEnd: 60 };
const params = { maxAsk: 0.60, stake: 10 };

function onWindow(ctx) {
  const s = ctx.latest;
  if (!s || s.up.mid == null || s.down.mid == null) return null;
  const side = s.up.mid <= s.down.mid ? "UP" : "DOWN";
  const book = side === "UP" ? s.up : s.down;
  if (book.ask == null || book.ask > ctx.params.maxAsk) return null;
  return { action: "enter", side, stake: ctx.params.stake };
}`;

const momentum = `const meta = { mode: "point", decisionBeforeEnd: 60 };
const params = { lookbackSeconds: 60, minMove: 0.02, stake: 10 };

function onWindow(ctx) {
  const samples = ctx.samples;
  if (!ctx.latest || samples.length < 2) return null;
  const latest = samples[samples.length - 1];
  const target = ctx.market.end - ctx.params.lookbackSeconds;
  let previous = null;
  for (const sample of samples) {
    if (sample.t <= target) previous = sample;
  }
  if (!previous || previous.up.mid == null || latest.up.mid == null) return null;
  const move = latest.up.mid - previous.up.mid;
  if (Math.abs(move) < ctx.params.minMove) return null;
  const side = move > 0 ? "UP" : "DOWN";
  const book = side === "UP" ? latest.up : latest.down;
  if (book.ask == null) return null;
  return { action: "enter", side, stake: ctx.params.stake };
}`;

const streamStop = `const meta = { mode: "stream" };
const params = { entryAsk: 0.55, stopAsk: 0.90, stake: 10 };

function onSample(ctx, sample) {
  if (!ctx.position) {
    if (sample.up.ask != null && sample.up.ask <= ctx.params.entryAsk) {
      return { action: "enter", side: "UP", stake: ctx.params.stake };
    }
    return null;
  }
  if (sample.up.bid != null && sample.up.bid >= ctx.params.stopAsk) {
    return { action: "exit" };
  }
  return null;
}`;

export const STRATEGY_EXAMPLES: StrategyExample[] = [
  {
    id: "favorite",
    name: "Favorite at T-60s",
    description: "Buy the side with the higher mid price 60 seconds before close, hold to settlement.",
    source: favorite,
  },
  {
    id: "underdog",
    name: "Underdog at T-60s",
    description: "Buy the cheaper side 60 seconds before close, only when its ask is below 0.60.",
    source: underdog,
  },
  {
    id: "momentum",
    name: "Momentum",
    description: "Enter in the direction of the last 60-second UP move if it exceeds 0.02.",
    source: momentum,
  },
  {
    id: "stream-stop",
    name: "Stream stop-loss",
    description: "Stream mode example: buy UP below 0.55, exit if UP bid reaches 0.90.",
    source: streamStop,
  },
];

export function getExample(id: string): StrategyExample | null {
  return STRATEGY_EXAMPLES.find((example) => example.id === id) ?? null;
}
