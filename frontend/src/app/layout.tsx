import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb" });

export const metadata: Metadata = {
  title: "InsightAI",
  description: "RAG-powered product feedback intelligence: evidence-backed insights from customer reviews.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">
        <div className="md:flex">
          <Sidebar />
          <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
