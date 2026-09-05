import { redirect } from "next/navigation";
import { getAuthContext } from "@/server/auth/context";

export default async function HomePage() {
  const auth = await getAuthContext();
  if (auth) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
