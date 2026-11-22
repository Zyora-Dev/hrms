"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { EmployeeForm } from "./employee-form";
import { ApiError, getEmployee, type Employee } from "./shared";

export function EmployeeEdit() {
  const id = Number(useParams<{ id: string }>().id);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getEmployee(id)
      .then((e) => active && setEmployee(e))
      .catch((err) => {
        if (!active) return;
        setError(err instanceof ApiError ? err.message : "Could not load employee");
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-6 text-sm font-medium text-destructive">
        {error}
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return <EmployeeForm employee={employee} />;
}
