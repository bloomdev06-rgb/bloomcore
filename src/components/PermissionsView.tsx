import React from 'react';
import { Branch, PermissionMatrix, Member, AuditLog } from '../types';
import { Shield } from 'lucide-react';
import GovernanceView from './GovernanceView';

interface PermissionsViewProps {
  activeBranch: Branch;
  simulatedRole: string;
  permissionMatrix: PermissionMatrix;
  onTogglePermission: (capability: string, role: string) => void;
  members?: Member[];
  operator?: Member;
  onAddAuditLog?: (log: AuditLog) => void;
}

export default function PermissionsView(props: PermissionsViewProps) {
  // Re-export the existing governance view under the new name
  return <GovernanceView {...props} />;
}
