import type { Metadata } from "next";

import { ShiftList } from "@/components/admin/shifts/shift-list";

export const metadata: Metadata = { title: "Shifts · HRMS" };

export default function ShiftsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shifts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define working hours and assign them to employees. Attendance is
          calculated against the shift an employee was on that day.
        </p>
      </div>

      <ShiftList />
    </div>
  );
}
