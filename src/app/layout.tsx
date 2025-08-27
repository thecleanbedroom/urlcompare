import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { NavBar } from "@/components/NavBar";
import { Suspense } from 'react';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "URL Compare - Compare URLs between domains",
  description: "A tool to compare URLs between different domains and check their status",
  keywords: ["URL", "Compare", "Domain Migration", "URL Checker", "Web Development"],
  authors: [{ name: "URL Compare Team" }],
  openGraph: {
    title: "URL Compare",
    description: "Compare URLs between domains and check their status",
    url: "",
    siteName: "URL Compare",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "URL Compare",
    description: "Compare URLs between domains and check their status",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <Suspense fallback={
          <nav className="border-b bg-background">
            <div className="max-w-4xl mx-auto px-4 py-3">
              <div className="h-8 w-32 bg-gray-200 rounded animate-pulse"></div>
            </div>
          </nav>
        }>
          <NavBar />
        </Suspense>
        <main className="min-h-[calc(100vh-64px)]">
          {children}
        </main>
        <Toaster />
      </body>
    </html>
  );
}
