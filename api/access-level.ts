export const config = {
  runtime: "nodejs",
};

type VercelResponse = {
  status: (statusCode: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

/**
 * Controle global do modo da aplicação.
 * Em desenvolvimento / localhost (dev), é sempre 1 (ADM).
 * Em produção na Vercel, respeita a variável de ambiente ACCESS_LEVEL (1 = ADM, outro/ausente = 0/User).
 */
export function getAccessLevel(): 0 | 1 {
  if (
    process.env.NODE_ENV !== "production" ||
    process.env.VERCEL_ENV === "development" ||
    !process.env.VERCEL
  ) {
    return 1;
  }
  return process.env.ACCESS_LEVEL === "1" ? 1 : 0;
}

export function GET(_request: unknown, response: VercelResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({ accessLevel: getAccessLevel() });
}

export default GET;
