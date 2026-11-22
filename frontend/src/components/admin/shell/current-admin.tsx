"use client";

import { createContext, useContext } from "react";

import { can, type Admin } from "@/lib/auth";

const AdminContext = createContext<Admin | null>(null);

export function AdminProvider({
  value,
  children,
}: {
  value: Admin | null;
  children: React.ReactNode;
}) {
  return (
    <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
  );
}

export function useCurrentAdmin() {
  return useContext(AdminContext);
}

/** Convenience for the common "may I see this module" question. */
export function useCan(module: string, needed: "read" | "write" = "read") {
  const admin = useContext(AdminContext);
  // Until the session check finishes, assume yes rather than flashing an
  // empty sidebar at an owner.
  return admin === null ? true : can(admin, module, needed);
}
