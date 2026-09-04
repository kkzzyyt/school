import { ClassRoster } from "@/components/admin/ClassRoster";

export default async function AdminClassRosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ClassRoster classId={id} />;
}
