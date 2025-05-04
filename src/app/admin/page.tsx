'use client';

import { useEffect } from 'react';
import { useFirebase } from '@/context/FirebaseContext';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Mock Data Structures - Replace with actual data fetching and types later
interface MockUser { id: string; email: string; createdAt: Date; }
interface MockParty { id: string; name: string; createdBy: string; date: Date; }
interface MockComment { id: string; partyId: string; userId: string; text: string; timestamp: Date; }
interface MockMedia { id: string; partyId: string; url: string; type: 'image' | 'video' | 'audio'; uploadedAt: Date; }


// Mock Admin Data (replace with Firestore queries)
const mockUsers: MockUser[] = [
  { id: 'user1', email: 'test1@example.com', createdAt: new Date() },
  { id: 'user2', email: 'another@test.net', createdAt: new Date(Date.now() - 86400000) }, // 1 day ago
];
const mockParties: MockParty[] = [
  { id: 'partyA', name: 'Admin\'s Test Party', createdBy: 'adminUser', date: new Date() },
  { id: 'partyB', name: 'Beach Bash', createdBy: 'user1', date: new Date(Date.now() - 172800000) }, // 2 days ago
];
const mockComments: MockComment[] = [
    { id: 'cmt1', partyId: 'partyB', userId: 'user2', text: 'Great party!', timestamp: new Date() },
];
const mockMedia: MockMedia[] = [
    { id: 'mediaX', partyId: 'partyA', url: 'https://picsum.photos/200', type: 'image', uploadedAt: new Date() },
];


export default function AdminPage() {
  const { user, isAdmin, loading } = useFirebase();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAdmin) {
      router.push('/'); // Redirect non-admins to home
    }
  }, [user, isAdmin, loading, router]);

  const handleDelete = (type: string, id: string) => {
      // Placeholder for delete functionality
      console.log(`Attempting to delete ${type} with ID: ${id}`);
      alert(`[Admin Action] Delete ${type} ID: ${id} (Implementation Pending)`);
       // TODO: Implement actual Firestore delete operation with confirmation dialog
  }

  if (loading) {
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">Checking permissions...</div>;
  }

  if (!isAdmin) {
    // Render minimal content or nothing while redirecting
    return <div className="flex justify-center items-center min-h-[calc(100vh-10rem)]">Access Denied. Redirecting...</div>;
  }

  // Admin content
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-primary">Admin Dashboard</h1>
        <Badge variant="destructive"><ShieldAlert className="w-4 h-4 mr-1" /> Admin Access</Badge>
      </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

         {/* Users Management */}
        <Card className="bg-card border-border">
            <CardHeader>
            <CardTitle>Users ({mockUsers.length})</CardTitle>
            <CardDescription>Manage application users.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
             {mockUsers.map((u) => (
                <div key={u.id} className="flex justify-between items-center p-2 bg-secondary rounded-md">
                    <div>
                        <p className="text-sm font-medium">{u.email}</p>
                        <p className="text-xs text-muted-foreground">Joined: {u.createdAt.toLocaleDateString()}</p>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => handleDelete('User', u.id)}>Delete</Button>
                </div>
             ))}
            </CardContent>
        </Card>

         {/* Parties Management */}
        <Card className="bg-card border-border">
            <CardHeader>
            <CardTitle>Parties ({mockParties.length})</CardTitle>
            <CardDescription>Manage party entries.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
             {mockParties.map((p) => (
                <div key={p.id} className="flex justify-between items-center p-2 bg-secondary rounded-md">
                    <div>
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-xs text-muted-foreground">Date: {p.date.toLocaleDateString()} | By: {p.createdBy}</p>
                    </div>
                     <Button variant="destructive" size="sm" onClick={() => handleDelete('Party', p.id)}>Delete</Button>
                </div>
             ))}
            </CardContent>
        </Card>

         {/* Comments Management */}
        <Card className="bg-card border-border">
            <CardHeader>
            <CardTitle>Comments ({mockComments.length})</CardTitle>
            <CardDescription>Moderate comments.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
             {mockComments.map((c) => (
                 <div key={c.id} className="flex justify-between items-start p-2 bg-secondary rounded-md">
                     <div className="flex-1 mr-4">
                        <p className="text-sm italic">"{c.text}"</p>
                        <p className="text-xs text-muted-foreground">
                            On Party: {c.partyId} | By: {c.userId} | At: {c.timestamp.toLocaleString()}
                        </p>
                    </div>
                     <Button variant="destructive" size="sm" onClick={() => handleDelete('Comment', c.id)}>Delete</Button>
                 </div>
             ))}
            </CardContent>
        </Card>

        {/* Media Management */}
        <Card className="bg-card border-border">
            <CardHeader>
            <CardTitle>Media ({mockMedia.length})</CardTitle>
            <CardDescription>Manage uploaded media.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-96 overflow-y-auto">
             {mockMedia.map((m) => (
                 <div key={m.id} className="flex justify-between items-center p-2 bg-secondary rounded-md">
                     <div className="flex items-center gap-2">
                         {m.type === 'image' && <ImageIcon className="w-4 h-4 text-muted-foreground"/>}
                         {m.type === 'video' && <Video className="w-4 h-4 text-muted-foreground"/>}
                         {m.type === 'audio' && <Music className="w-4 h-4 text-muted-foreground"/>}
                         <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-sm truncate hover:underline">{m.url.substring(m.url.lastIndexOf('/')+1)}</a>
                         <p className="text-xs text-muted-foreground">(Party: {m.partyId})</p>
                     </div>
                     <Button variant="destructive" size="sm" onClick={() => handleDelete('Media', m.id)}>Delete</Button>
                 </div>
             ))}
            </CardContent>
        </Card>

      </div>
    </div>
  );
}
