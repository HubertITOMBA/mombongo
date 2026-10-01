"use client";

import { useEffect } from "react";
import { persistActiveOrganizationAction } from "@/lib/auth/organization-actions";

export function ActiveOrganizationSync({ organizationId }: { organizationId: string }) {
  useEffect(() => {
    void persistActiveOrganizationAction(organizationId);
  }, [organizationId]);
  return null;
}
