"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { BrandMark } from "@/components/BrandMark";
import { useHydrated } from "@/lib/use-hydrated";
import { AEGIS_RUNTIME } from "@/lib/runtime/environment";

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/vault", label: "Vault" },
  { href: "/activity", label: "Activity" },
  { href: "/chat", label: "Chat" },
];

export function Navbar() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const hasMounted = useHydrated();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const handleConnect = () => {
    const connector = connectors[0];
    if (connector) {
      connect({ connector });
    }
  };

  return (
    <header 
      className={`sticky top-0 z-50 w-full transition-all duration-200 ${
        scrolled 
          ? "bg-background/80 backdrop-blur-md border-b" 
          : "bg-transparent"
      }`}
    >
      <div className="aegis-shell flex h-16 items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 group">
            <BrandMark className="h-8 w-8 transition-transform group-hover:scale-110" />
            <span className="font-bold text-xl tracking-tight text-foreground">
              AEGIS
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                    isActive 
                      ? "bg-secondary text-foreground" 
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border text-xs font-medium text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            {AEGIS_RUNTIME.chainName}
          </div>

          {hasMounted ? isConnected && address ? (
            <div className="relative">
              <button
                onClick={() => setIsDropdownOpen((open) => !open)}
                className="aegis-button aegis-button-primary"
              >
                {truncateAddress(address)}
              </button>

              {isDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setIsDropdownOpen(false)} 
                  />
                  <div className="absolute right-0 mt-2 w-56 z-50 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg animate-scale-in">
                    <div className="p-4 border-b">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Account
                      </p>
                      <p className="font-mono text-xs break-all">
                        {address}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        disconnect();
                        setIsDropdownOpen(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      Disconnect
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button onClick={handleConnect} className="aegis-button aegis-button-primary">
              Connect Wallet
            </button>
          ) : (
            <div
              aria-hidden="true"
              className="h-10 w-32 rounded-full bg-secondary/50 animate-pulse"
            />
          )}
        </div>
      </div>
    </header>
  );
}
