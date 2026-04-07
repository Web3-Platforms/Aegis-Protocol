import type { Metadata } from "next";
import { ProductInstrumentationTracker } from "@/components/ProductInstrumentationTracker";
import { Web3Provider } from "@/components/Web3Provider";
import { Navbar } from "@/components/Navbar";
import { AEGIS_RUNTIME } from "@/lib/runtime/environment";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aegis Protocol",
  description:
    `Pilot-first ${AEGIS_RUNTIME.postureLabel.toLowerCase()} vault experience on ${AEGIS_RUNTIME.chainName} with experimental routing assessment for Polkadot`,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gradient-mesh">
        <div className="aegis-app min-h-screen flex flex-col">
          <Web3Provider>
            <ProductInstrumentationTracker />
            <Navbar />
            <main className="flex-1">{children}</main>
          </Web3Provider>
        </div>
      </body>
    </html>
  );
}
