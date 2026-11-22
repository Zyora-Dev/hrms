import type { Metadata } from "next";

import { EmployeeLoginForm } from "@/components/employee/employee-login-form";

export const metadata: Metadata = {
  title: "Employee sign in · HRMS",
  description: "Sign in to view your attendance, leave and payslips.",
};

export default function EmployeeLoginPage() {
  return <EmployeeLoginForm />;
}
