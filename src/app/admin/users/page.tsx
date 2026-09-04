import { UserManagement } from "@/components/admin/UserManagement";
import { getAuthIdentity } from "@/server/auth/context";

export default async function AdminUsersPage() {
  const identity = await getAuthIdentity();
  return <UserManagement currentUserId={identity?.userId} />;
}
