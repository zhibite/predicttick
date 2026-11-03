import { apiHeaders, apiPreflight } from "@/server/api/v1";

export const dynamic = "force-dynamic";

const spec = {
  openapi: "3.1.0",
  info: {
    title: "PolyKlines API",
    version: "1.0.0",
    description:
      "Historical Polymarket Up/Down market data. Authenticate with an API key from /account/api-keys.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Use an API key: Authorization: Bearer pk_live_...",
      },
      apiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
      },
    },
    schemas: {
      Error: {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string" },
              message: { type: "string" },
              requestId: { type: "string" },
            },
            required: ["code", "message"],
          },
        },
      },
      Pagination: {
        type: "object",
        properties: {
          limit: { type: "integer" },
          hasMore: { type: "boolean" },
          nextCursor: { type: ["string", "null"] },
        },
      },
      Market: {
        type: "object",
        properties: {
          slug: { type: "string" },
          asset: { type: "string" },
          period: { type: "string", enum: ["5m", "15m", "1h", "4h"] },
          startEpoch: { type: "integer" },
          endEpoch: { type: "integer" },
          startUtc: { type: "string", format: "date-time" },
          endUtc: { type: "string", format: "date-time" },
          title: { type: "string" },
          resolved: { type: "string", enum: ["UP", "DOWN", "UNKNOWN"] },
          sampleCount: { type: "integer" },
          coverage: {
            type: "object",
            properties: {
              firstTs: { type: ["integer", "null"] },
              lastTs: { type: ["integer", "null"] },
            },
          },
        },
      },
      Sample: {
        type: "object",
        properties: {
          ts: { type: "integer" },
          tsUtc: { type: "string", format: "date-time" },
          up: { $ref: "#/components/schemas/Book" },
          down: { $ref: "#/components/schemas/Book" },
        },
      },
      Book: {
        type: "object",
        properties: {
          bid: { type: ["number", "null"] },
          ask: { type: ["number", "null"] },
          mid: { type: ["number", "null"] },
          last: { type: ["number", "null"] },
        },
      },
      Candle: {
        type: "object",
        properties: {
          t: { type: "integer" },
          tUtc: { type: "string", format: "date-time" },
          up: { $ref: "#/components/schemas/Ohlc" },
          down: { $ref: "#/components/schemas/Ohlc" },
          windows: { type: "integer" },
        },
      },
      Ohlc: {
        type: "object",
        properties: {
          open: { type: ["number", "null"] },
          high: { type: ["number", "null"] },
          low: { type: ["number", "null"] },
          close: { type: ["number", "null"] },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        security: [],
        responses: { "200": { description: "Service is healthy" } },
      },
    },
    "/meta": {
      get: {
        summary: "Public dataset metadata",
        security: [],
        responses: { "200": { description: "Asset and coverage summary" } },
      },
    },
    "/me": {
      get: {
        summary: "Current key, plan, limits and usage",
        responses: { "200": { description: "Account and usage" } },
      },
    },
    "/markets": {
      get: {
        summary: "List market windows",
        parameters: [
          { name: "asset", in: "query", required: true, schema: { type: "string" } },
          {
            name: "period",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["5m", "15m", "1h", "4h"] },
          },
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          {
            name: "resolved",
            in: "query",
            schema: { type: "string", enum: ["UP", "DOWN", "UNKNOWN", "ALL"] },
          },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 500 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Paginated markets" } },
      },
    },
    "/markets/{slug}": {
      get: {
        summary: "Get one market",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Market detail" } },
      },
    },
    "/markets/{slug}/samples": {
      get: {
        summary: "Samples for one market",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "from", in: "query", schema: { type: "string" } },
          { name: "to", in: "query", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 1000 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Paginated samples" } },
      },
    },
    "/candles": {
      get: {
        summary: "Cross-window OHLC candles",
        parameters: [
          { name: "asset", in: "query", required: true, schema: { type: "string" } },
          {
            name: "period",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["5m", "15m", "1h", "4h"] },
          },
          {
            name: "interval",
            in: "query",
            schema: { type: "string", enum: ["1m", "5m", "15m", "1h"] },
          },
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
          { name: "limit", in: "query", schema: { type: "integer", maximum: 5000 } },
          { name: "cursor", in: "query", schema: { type: "string" } },
        ],
        responses: { "200": { description: "Paginated candles" } },
      },
    },
    "/coverage": {
      get: {
        summary: "Daily coverage for a series",
        parameters: [
          { name: "asset", in: "query", required: true, schema: { type: "string" } },
          {
            name: "period",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["5m", "15m", "1h", "4h"] },
          },
          { name: "from", in: "query", schema: { type: "string", format: "date" } },
          { name: "to", in: "query", schema: { type: "string", format: "date" } },
        ],
        responses: { "200": { description: "Coverage summary and days" } },
      },
    },
    "/export": {
      get: {
        summary: "Stream CSV export",
        parameters: [
          { name: "asset", in: "query", required: true, schema: { type: "string" } },
          {
            name: "period",
            in: "query",
            required: true,
            schema: { type: "string", enum: ["5m", "15m", "1h", "4h"] },
          },
          { name: "from", in: "query", required: true, schema: { type: "string", format: "date" } },
          { name: "to", in: "query", required: true, schema: { type: "string", format: "date" } },
          {
            name: "dataset",
            in: "query",
            schema: { type: "string", enum: ["samples", "markets"] },
          },
          {
            name: "interval",
            in: "query",
            schema: { type: "string", enum: ["raw", "5s", "1m", "5m"] },
          },
          { name: "resolved", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "CSV stream" },
          "413": { description: "Too large; use /exports" },
        },
      },
    },
    "/exports": {
      get: {
        summary: "List background export jobs",
        responses: { "200": { description: "Export jobs" } },
      },
      post: {
        summary: "Create a background export",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["asset", "period", "from", "to"],
                properties: {
                  asset: { type: "string" },
                  period: { type: "string", enum: ["5m", "15m", "1h", "4h"] },
                  from: { type: "string", format: "date" },
                  to: { type: "string", format: "date" },
                  dataset: { type: "string", enum: ["samples", "markets"] },
                  resolvedOnly: { type: "boolean" },
                  interval: { type: "string", enum: ["raw", "5s", "1m", "5m"] },
                  format: { type: "string", enum: ["csv", "csv.gz"] },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Export job created" } },
      },
    },
    "/exports/{id}": {
      get: {
        summary: "Get export job status",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Export job" } },
      },
    },
    "/exports/{id}/file": {
      get: {
        summary: "Download a completed export",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "CSV or gzip file" },
          "206": { description: "Partial content" },
        },
      },
    },
  },
};

export function GET(request: Request) {
  return new Response(JSON.stringify(spec, null, 2), {
    headers: {
      ...Object.fromEntries(apiHeaders(request)),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}

export function OPTIONS(request: Request) {
  return apiPreflight(request);
}
