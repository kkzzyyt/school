import { redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { getAuthContext } from "@/server/auth/context";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthContext();
  if (!context) redirect("/login");

  return <WorkspaceShell auth={context}>{children}</WorkspaceShell>;
}
