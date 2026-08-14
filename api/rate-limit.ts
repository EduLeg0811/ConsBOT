import { createHash } from "node:crypto";

const LIMIT_WINDOW_SECONDS = 24 * 60 * 60;

const MODEL_LIMITS: Record<string, number> = {
  "gpt-5.6-luna": 60,
  "gpt-5.6-terra": 30,
  "gpt-5.6-sol": 15,
};

type RequestWithHeaders = {
  headers?: Record<string, string | string[] | undefined>;
};

export type RateLimitResult = {
  enabled: boolean;
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

function headerValue(request: RequestWithHeaders, name: string): string | undefined {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function clientIp(request: RequestWithHeaders): string {
  const forwarded = headerValue(request, "x-forwarded-for");
  const candidate = forwarded?.split(",")[0]?.trim()
    ?? headerValue(request, "x-real-ip")
    ?? headerValue(request, "cf-connecting-ip")
    ?? "unknown";

  return candidate.slice(0, 128);
}

function redisKey(request: RequestWithHeaders, model: string): string {
  // Não armazenamos o IP em texto puro no Redis.
  const ipHash = createHash("sha256").update(clientIp(request)).digest("hex");
  return `consbot:rate-limit:${model}:${ipHash}`;
}

/**
 * Limite fixo de 24h por IP e modelo. Sem as credenciais do Upstash a rota
 * permanece disponível, o que permite desenvolvimento local sem Redis.
 */
export async function enforceModelRateLimit(
  request: RequestWithHeaders,
  model: string,
): Promise<RateLimitResult> {
  const limit = MODEL_LIMITS[model] ?? 0;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token || !limit) {
    return {
      enabled: false,
      allowed: true,
      limit,
      remaining: limit,
      retryAfterSeconds: 0,
    };
  }

  const script = [
    "local current = redis.call('INCR', KEYS[1])",
    "if current == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end",
    "return {current, redis.call('TTL', KEYS[1])}",
  ].join("; ");

  const redisResponse = await fetch(url.replace(/\/$/, ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["EVAL", script, 1, redisKey(request, model), LIMIT_WINDOW_SECONDS]),
  });

  if (!redisResponse.ok) {
    throw new Error(`Upstash rate limiter returned HTTP ${redisResponse.status}`);
  }

  const payload = (await redisResponse.json()) as { result?: unknown };
  const result = Array.isArray(payload.result) ? payload.result : [];
  const current = Number(result[0]);
  const retryAfterSeconds = Math.max(0, Number(result[1]) || LIMIT_WINDOW_SECONDS);
  const remaining = Math.max(0, limit - current);

  return {
    enabled: true,
    allowed: current <= limit,
    limit,
    remaining,
    retryAfterSeconds,
  };
}
