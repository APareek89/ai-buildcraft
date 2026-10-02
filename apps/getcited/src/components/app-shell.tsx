"use client";
import { WorkspaceBoundary } from '@/components/account/account-provider';
export function AppShell({ ownerId, children }: { ownerId: string; children: React.ReactNode }) {
  return <WorkspaceBoundary ownerId={ownerId}>{children}</WorkspaceBoundary>;
}
