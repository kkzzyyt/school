import { redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/layout/WorkspaceShell";
import { getAuthIdentity } from "@/server/auth/context";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const identity = await getAuthIdentity();
  if (!identity) redirect("/login");
  if (identity.userRole !== "ADMIN") redirect("/dashboard");

  return <WorkspaceShell auth={identity} mode="admin">{children}</WorkspaceShell>;
}
