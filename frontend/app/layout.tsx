import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Web3Provider } from "@/components/Web3Provider";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Aegis Protocol",
  description:
    "Intent-based, AI-guarded cross-chain yield vault for Polkadot Hub",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-gradient-mesh">
        <div className="aegis-app min-h-screen flex flex-col">
          <Web3Provider>
            <Navbar />
            <main className="flex-1">{children}</main>
          </Web3Provider>
        </div>
      </body>
    </html>
  );
}
