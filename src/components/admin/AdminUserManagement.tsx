// src/components/admin/AdminUserManagement.tsx
'use client';

import type { FC } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';

interface AdminUserManagementProps {
  onUpdateCounts: (counts: { users: number }) => void;
}

export const AdminUserManagement: FC<AdminUserManagementProps> = ({ onUpdateCounts }) => {
  // Placeholder for user management logic
  // In a real application, you would fetch and display users,
  // and provide functionality to manage them (e.g., delete, change roles).

  // For now, just display a placeholder card.
  // Call onUpdateCounts with a dummy value if needed for initial setup,
  // but ideally this would come from actual data fetching.
  // React.useEffect(() => {
  //  onUpdateCounts({ users: 0 }); // Example, replace with actual count
  // }, [onUpdateCounts]);

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <span>Gestion des Utilisateurs</span>
        </CardTitle>
        <CardDescription>Gérer les comptes utilisateurs de l'application.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          La fonctionnalité de gestion des utilisateurs sera implémentée ici.
        </p>
        {/* Placeholder for user list and management actions */}
      </CardContent>
    </Card>
  );
};
