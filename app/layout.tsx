import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "AgentX — Intelligent X engagement", description: "A quality-first workspace for reviewing and publishing thoughtful X replies." };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }