import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { ClipboardCheck, LineChart, Users } from "lucide-react";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Grading & Analytics",
  description: "AI-Powered Automated Grading & Analytics System for International Math & Physics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} font-sans antialiased min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-200 selection:text-indigo-900`}
      >
        <div className="flex min-h-screen w-full flex-col relative">
          {/* Subtle global background gradient */}
          <div className="absolute top-0 inset-x-0 h-[600px] bg-gradient-to-b from-indigo-100/40 via-blue-50/20 to-transparent pointer-events-none -z-10"></div>
          
          <header className="sticky top-0 flex h-20 items-center justify-between border-b border-white/40 bg-white/70 backdrop-blur-xl px-6 md:px-10 shadow-[0_2px_20px_-10px_rgba(0,0,0,0.1)] z-50 transition-all duration-300">
            <Link href="/" className="flex items-center gap-3 text-lg font-bold group">
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-600 to-blue-500 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-indigo-600/30 group-hover:scale-105 group-hover:rotate-3 transition-all duration-300">
                AI
              </div>
              <span className="text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 font-extrabold">AutoMark</span>
            </Link>
            
            <nav className="flex items-center">
              <Link href="/results" className="flex items-center gap-2 px-5 py-2.5 mr-6 text-sm font-bold text-slate-600 bg-white/60 hover:bg-white hover:text-indigo-700 rounded-full border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                <Users className="w-4 h-4" />
                Class Results
              </Link>
              
              <div className="w-px h-6 bg-slate-300 mx-1 hidden md:block"></div>
              
              <Link href="/review" className="flex items-center gap-2 px-5 py-2.5 mx-6 text-sm font-bold text-slate-600 bg-white/60 hover:bg-white hover:text-indigo-700 rounded-full border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                <ClipboardCheck className="w-4 h-4" />
                Review Console
              </Link>
              
              {/* Added explicit physical spacing and visual separator just in case flex gap fails on your browser */}
              <div className="w-px h-6 bg-slate-300 mx-2 hidden md:block"></div>
              
              <Link href="/analytics" className="flex items-center gap-2 px-5 py-2.5 ml-10 text-sm font-bold text-slate-600 bg-white/60 hover:bg-white hover:text-indigo-700 rounded-full border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                <LineChart className="w-4 h-4" />
                Analytics Dashboard
              </Link>
            </nav>
          </header>
          <main className="flex flex-1 flex-col p-4 md:p-8 max-w-[1600px] mx-auto w-full relative z-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
