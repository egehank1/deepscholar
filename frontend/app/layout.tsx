import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

/* This is the root layout — a special Next.js file that wraps every single page 
in your app. It's like the outer shell that never changes while the content inside swaps out as you navigate.
*/

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: {
    default: "DeepScholar — AI research copilot",
    template: "%s — DeepScholar",
  },
  description:
    "Upload papers, ask questions, and explore research with an AI copilot.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
