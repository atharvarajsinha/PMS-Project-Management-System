import { CalendarRange, LayoutGrid } from "lucide-react";
import PageHeader from "@/components/common/PageHeader";
import StatTile from "@/components/common/StatTile";
import MemberOverview from "@/features/dashboard/components/MemberOverview";
import { useAuth } from "@/context/AuthContext";

export default function StudentDashboard() {
  const { user } = useAuth();
  const st = user.student;
  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description={
          <>
            {user.college?.name} · <span className="font-mono text-[13px]">{st?.roll_number}</span>
          </>
        }
      />
      <div className="space-y-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Current semester" value={st?.semester?.semester_number} icon={CalendarRange} />
          <StatTile label="Section" value={st?.section?.name} icon={LayoutGrid} />
        </div>
        <div className="max-w-2xl">
          <MemberOverview />
        </div>
      </div>
    </>
  );
}
