import {
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarOff,
  Clock,
  CreditCard,
  CircleDollarSign,
  CircleHelp,
  FileText,
  History,
  LayoutGrid,
  Settings,
  UserCog,
  Users,
  Workflow,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  /** Hidden from anyone without read access to this module. */
  module?: string;
};

export const PRIMARY_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutGrid },
  { label: "Employees", href: "/admin/employees", module: "employees", icon: Users },
  { label: "Attendance", href: "/admin/attendance", module: "attendance", icon: CalendarCheck },
  { label: "Shifts", href: "/admin/shifts", module: "attendance", icon: Clock },
  { label: "Leave", href: "/admin/leave", module: "leave", icon: CalendarOff },
  { label: "Payroll", href: "/admin/payroll", module: "payroll", icon: CircleDollarSign },
  { label: "Expenses", href: "/admin/expenses", module: "payroll", icon: CreditCard },
  { label: "Documents", href: "/admin/documents", module: "employees", icon: FileText },
  { label: "Automations", href: "/admin/automations", module: "settings", icon: Workflow },
  { label: "Reports", href: "/admin/reports", module: "reports", icon: BarChart3 },
  // Sits last so it lands right against the divider, beside the other
  // organisation-level entries below it.
  { label: "Company", href: "/admin/company", module: "company", icon: Building2 },
];

export const SECONDARY_NAV: NavItem[] = [
  { label: "Audit trail", href: "/admin/audit", module: "audit", icon: History },
  { label: "Settings", href: "/admin/settings", module: "settings", icon: Settings },
];

/** Pinned to the card at the foot of the rail, below the scrolling nav. */
export const ACCOUNT_NAV: NavItem[] = [
  { label: "Help", href: "/admin/help", icon: CircleHelp },
  { label: "Account", href: "/admin/account", icon: UserCog },
];
