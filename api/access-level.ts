export const config = {
  runtime: "nodejs",
};

type VercelResponse = {
  status: (statusCode: number) => VercelResponse;
  setHeader: (name: string, value: string) => void;
  json: (body: unknown) => void;
};

/**
 * Controle global do modo da aplicação. Configure ACCESS_LEVEL=1 somente no
 * ambiente da Vercel destinado à administração; qualquer outro valor é user.
 */
export function getAccessLevel(): 0 | 1 {
  return process.env.ACCESS_LEVEL === "1" ? 1 : 0;
}

export function GET(_request: unknown, response: VercelResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.status(200).json({ accessLevel: getAccessLevel() });
}

export default GET;
