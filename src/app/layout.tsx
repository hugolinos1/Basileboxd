import type { Metadata } from 'next';
import { Montserrat } from 'next/font/google'; // Corrected font import
import './globals.css';
import { FirebaseProvider } from '@/context/FirebaseContext';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Toaster } from '@/components/ui/toaster';

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'PartyHub',
  description: 'Create, rate, comment, and share your parties!',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${montserrat.variable} antialiased bg-background text-foreground font-sans`}>
        <FirebaseProvider>
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow">{children}</main>
            <Footer />
          </div>
          <Toaster />
        </FirebaseProvider>
      </body>
    </html>
  );
}
