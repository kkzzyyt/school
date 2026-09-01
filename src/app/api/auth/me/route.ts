import { handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";

export async function GET() {
  return handleApi(async () => requireAuthContext());
}
