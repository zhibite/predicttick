import {
  getQuickJS,
  type QuickJSContext,
  type QuickJSRuntime,
  type QuickJSHandle,
  type QuickJSWASMModule,
} from "quickjs-emscripten";

import type { SampleRow } from "@/server/query/types";

export type StrategyMode = "point" | "stream";

export interface StrategyOrder {
  index?: number;
  action: "enter" | "exit";
  side?: "UP" | "DOWN";
  stake?: number;
  limitPrice?: number;
  entryTs?: number;
  entryPrice?: number;
}

export interface SandboxStrategy {
  mode: StrategyMode;
  decisionBeforeEnd: number;
  run(payload: SandboxPayload): StrategyOrder[] | StrategyOrder | null;
  close(): void;
}

export interface SandboxPayload {
  market: {
    slug: string;
    asset: string;
    period: string;
    start: number;
    end: number;
  };
  params?: Record<string, unknown>;
  samples: Array<{
    t: number;
    up: { bid: number | null; ask: number | null; mid: number | null; last: number | null };
    down: { bid: number | null; ask: number | null; mid: number | null; last: number | null };
  }>;
  latest?: unknown;
}

const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_PARAMS_BYTES = 16 * 1024;
const MEMORY_LIMIT = 32 * 1024 * 1024;
const STACK_LIMIT = 1024 * 1024;
const WINDOW_CPU_MS = 50;

let quickJSPromise: Promise<QuickJSWASMModule> | null = null;

function quickJS(): Promise<QuickJSWASMModule> {
  if (!quickJSPromise) quickJSPromise = getQuickJS();
  return quickJSPromise;
}

function sampleToPayload(sample: SampleRow) {
  return {
    t: sample.ts,
    up: {
      bid: sample.up_bid,
      ask: sample.up_ask,
      mid: sample.up_mid,
      last: sample.up_last,
    },
    down: {
      bid: sample.down_bid,
      ask: sample.down_ask,
      mid: sample.down_mid,
      last: sample.down_last,
    },
  };
}

export function samplesToPayload(samples: SampleRow[]) {
  return samples.map(sampleToPayload);
}

function dumpError(context: QuickJSContext, handle: QuickJSHandle): string {
  try {
    const dumped = context.dump(handle);
    if (dumped instanceof Error) return dumped.message;
    if (typeof dumped === "string") return dumped;
    if (dumped && typeof dumped === "object") {
      const value = dumped as { message?: unknown; stack?: unknown };
      if (typeof value.message === "string") return value.message;
      return JSON.stringify(dumped);
    }
    return String(dumped);
  } catch {
    return "Strategy execution failed.";
  }
}

function wrapper(source: string): string {
  return `
(function () {
  "use strict";
  ${source}
  const __meta = (typeof meta !== "undefined" && meta && typeof meta === "object") ? meta : {};
  const __defaults = (typeof params !== "undefined" && params && typeof params === "object") ? params : {};
  const __mode = __meta.mode === "stream" ? "stream" : "point";
  const __decision = Number(__meta.decisionBeforeEnd);
  function __run(payloadJson) {
    const payload = JSON.parse(payloadJson);
    const __params = Object.assign({}, __defaults, payload.params || {});
    const market = payload.market;
    if (__mode === "stream") {
      let position = null;
      let entered = false;
      const orders = [];
      for (let i = 0; i < payload.samples.length; i++) {
        const sample = payload.samples[i];
        const ctx = { market, params: __params, position };
        const result = typeof onSample === "function" ? onSample(ctx, sample) : null;
        if (result && result.action === "enter" && !entered) {
          const stake = Number(result.stake) || 0;
          const sideOk = result.side === "UP" || result.side === "DOWN";
          const entryBook = result.side === "UP" ? sample.up : sample.down;
          const ask = entryBook ? entryBook.ask : null;
          const limitPrice = result.limitPrice == null ? null : Number(result.limitPrice);
          const priceOk = ask != null && ask > 0 && ask < 1 && (limitPrice == null || ask <= limitPrice);
          if (sideOk && stake > 0 && priceOk) {
            orders.push({
              index: i,
              action: "enter",
              side: result.side,
              stake,
              limitPrice
            });
            entered = true;
            position = {
              side: result.side,
              entryTs: sample.t,
              entryPrice: ask,
              stake
            };
          }
        } else if (result && result.action === "exit" && position) {
          orders.push({ index: i, action: "exit" });
          position = null;
        }
      }
      return JSON.stringify(orders);
    }
    const ctx = {
      market,
      params: __params,
      samples: payload.samples,
      latest: payload.latest
    };
    const result = typeof onWindow === "function" ? onWindow(ctx) : null;
    if (!result) return "null";
    return JSON.stringify(result);
  }
  return {
    mode: __mode,
    decisionBeforeEnd: Number.isFinite(__decision) ? __decision : 60,
    run: __run
  };
})()
`;
}

export async function createSandbox(
  source: string,
  params: Record<string, unknown>,
  options?: { totalMs?: number },
): Promise<SandboxStrategy> {
  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) {
    throw new Error("Strategy source is larger than 64 KB.");
  }
  const paramsJson = JSON.stringify(params ?? {});
  if (Buffer.byteLength(paramsJson, "utf8") > MAX_PARAMS_BYTES) {
    throw new Error("Strategy params are larger than 16 KB.");
  }

  const QJS = await quickJS();
  const runtime: QuickJSRuntime = QJS.newRuntime();
  runtime.setMemoryLimit(MEMORY_LIMIT);
  runtime.setMaxStackSize(STACK_LIMIT);

  const totalDeadline = Date.now() + (options?.totalMs ?? 120_000);
  let deadline = totalDeadline;
  runtime.setInterruptHandler(() => Date.now() > deadline);

  const context = runtime.newContext();
  const prelude = context.evalCode("Date = undefined; Math.random = () => 0.5;");
  if (prelude.error) {
    prelude.error.dispose();
  } else {
    prelude.value.dispose();
  }

  deadline = Math.min(totalDeadline, Date.now() + WINDOW_CPU_MS);
  const evaluated = context.evalCode(wrapper(source), "strategy.js");
  if (evaluated.error) {
    const message = dumpError(context, evaluated.error);
    evaluated.error.dispose();
    context.dispose();
    runtime.dispose();
    throw new Error(message);
  }

  const object = evaluated.value;
  const modeHandle = context.getProp(object, "mode");
  const decisionHandle = context.getProp(object, "decisionBeforeEnd");
  const runHandle = context.getProp(object, "run");
  const mode = context.dump(modeHandle) === "stream" ? "stream" : "point";
  const decisionBeforeEnd = Number(context.dump(decisionHandle)) || 60;
  modeHandle.dispose();
  decisionHandle.dispose();
  object.dispose();

  const run = (payload: SandboxPayload): StrategyOrder[] | StrategyOrder | null => {
    deadline = Math.min(totalDeadline, Date.now() + WINDOW_CPU_MS);
    const argument = context.newString(JSON.stringify(payload));
    const result = context.callFunction(runHandle, context.undefined, argument);
    argument.dispose();
    if (result.error) {
      const message = dumpError(context, result.error);
      result.error.dispose();
      throw new Error(message);
    }
    const dumped = context.dump(result.value);
    result.value.dispose();
    if (dumped == null) return null;
    try {
      return JSON.parse(dumped) as StrategyOrder[] | StrategyOrder;
    } catch {
      throw new Error("Strategy returned invalid JSON.");
    }
  };

  return {
    mode,
    decisionBeforeEnd,
    run,
    close() {
      runHandle.dispose();
      context.dispose();
      runtime.dispose();
    },
  };
}
