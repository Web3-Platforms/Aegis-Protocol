"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";
import {
  AEGIS_VAULT_ABI,
  ERC20_ABI,
  CONTRACT_ADDRESSES,
  HAS_CONFIGURED_SUPPORTED_TOKENS,
  HAS_CONFIGURED_VAULT,
  SUPPORTED_TOKENS,
} from "@/lib/contracts";
import { dispatchPortfolioRefresh } from "@/lib/portfolio-refresh";
import { trackProductEvent } from "@/lib/product-instrumentation";
import { AEGIS_RUNTIME } from "@/lib/runtime/environment";

type SupportedToken = (typeof SUPPORTED_TOKENS)[number];

export function DepositForm() {
  const { address, isConnected } = useAccount();
  const [selectedToken, setSelectedToken] = useState<SupportedToken | null>(
    SUPPORTED_TOKENS[0] ?? null
  );
  const [depositAmount, setDepositAmount] = useState("");
  const [step, setStep] = useState<"idle" | "approving" | "depositing">("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isRouting, setIsRouting] = useState(false);

  // ── Read wallet balance for the selected token ──────────────────────────
  const { data: rawBalance, refetch: refetchBalance } = useReadContract({
    address: (selectedToken?.address ?? CONTRACT_ADDRESSES.AEGIS_VAULT) as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled:
        isConnected &&
        !!address &&
        !!selectedToken &&
        HAS_CONFIGURED_VAULT &&
        HAS_CONFIGURED_SUPPORTED_TOKENS,
    },
  });

  const formattedBalance =
    rawBalance !== undefined
      ? formatUnits(rawBalance as bigint, selectedToken?.decimals ?? 18)
      : "0";

  // ── Read current allowance for the vault ────────────────────────────────
  const { data: rawAllowance, refetch: refetchAllowance } = useReadContract({
    address: (selectedToken?.address ?? CONTRACT_ADDRESSES.AEGIS_VAULT) as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "allowance",
    args:
      address
        ? [address, CONTRACT_ADDRESSES.AEGIS_VAULT as `0x${string}`]
        : undefined,
    query: {
      enabled:
        isConnected &&
        !!address &&
        !!selectedToken &&
        HAS_CONFIGURED_VAULT &&
        HAS_CONFIGURED_SUPPORTED_TOKENS,
    },
  });

  // ── Write hooks ─────────────────────────────────────────────────────────
  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApprovePending,
    reset: resetApprove,
  } = useWriteContract();

  const {
    writeContract: writeDeposit,
    data: depositHash,
    isPending: isDepositPending,
    reset: resetDeposit,
  } = useWriteContract();

  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const { isLoading: isDepositConfirming, isSuccess: isDepositConfirmed } =
    useWaitForTransactionReceipt({ hash: depositHash });

  // ── Trigger deposit after approval confirms ─────────────────────────────
  useEffect(() => {
    if (isApproveConfirmed && step === "approving" && depositAmount) {
      if (!selectedToken) {
        return;
      }
      setStep("depositing");
      const amount = parseUnits(depositAmount, selectedToken.decimals);
      writeDeposit({
        address: CONTRACT_ADDRESSES.AEGIS_VAULT as `0x${string}`,
        abi: AEGIS_VAULT_ABI,
        functionName: "deposit",
        args: [selectedToken.address as `0x${string}`, amount],
      });
    }
  }, [isApproveConfirmed, step, depositAmount, selectedToken, writeDeposit]);

  // ── Handle deposit confirmation ─────────────────────────────────────────
  useEffect(() => {
    if (isDepositConfirmed && step === "depositing") {
      setStep("idle");
      setDepositAmount("");

      const baseSuccess = "Deposit successful. Assets are now recorded in the beta vault.";

      refetchBalance();
      refetchAllowance();
      dispatchPortfolioRefresh();
      setSuccess(baseSuccess);

      // Launch mode is vault-only beta, so deposits do not auto-submit routing.
      setIsRouting(false);
    }
  }, [
    isDepositConfirmed,
    step,
    refetchBalance,
    refetchAllowance,
  ]);

  // ── Form handler ────────────────────────────────────────────────────────
  const handleDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    resetApprove();
    resetDeposit();

    if (!HAS_CONFIGURED_VAULT || !selectedToken) {
      void trackProductEvent({
        eventName: "deposit_blocked",
        surface: "vault",
        metadata: {
          tokenSymbol: selectedToken?.symbol,
          blockReason: "missing_configuration",
        },
      });
      setError(
        `This ${AEGIS_RUNTIME.postureLabel.toLowerCase()} environment is missing vault or token configuration.`
      );
      return;
    }

    if (!depositAmount || isNaN(Number(depositAmount))) {
      void trackProductEvent({
        eventName: "deposit_blocked",
        surface: "vault",
        metadata: {
          tokenSymbol: selectedToken.symbol,
          blockReason: "invalid_amount",
        },
      });
      setError("Please enter a valid amount");
      return;
    }
    if (Number(depositAmount) <= 0) {
      void trackProductEvent({
        eventName: "deposit_blocked",
        surface: "vault",
        metadata: {
          tokenSymbol: selectedToken.symbol,
          blockReason: "invalid_amount",
        },
      });
      setError("Amount must be greater than 0");
      return;
    }
    if (Number(depositAmount) > Number(formattedBalance)) {
      void trackProductEvent({
        eventName: "deposit_blocked",
        surface: "vault",
        metadata: {
          tokenSymbol: selectedToken.symbol,
          blockReason: "insufficient_wallet_balance",
        },
      });
      setError("Insufficient wallet balance");
      return;
    }

    void trackProductEvent({
      eventName: "deposit_attempted",
      surface: "vault",
      metadata: {
        tokenSymbol: selectedToken.symbol,
      },
    });

    const amount = parseUnits(depositAmount, selectedToken.decimals);
    const currentAllowance = (rawAllowance as bigint) ?? 0n;

    if (currentAllowance >= amount) {
      // Already approved – go straight to deposit
      setStep("depositing");
      writeDeposit({
        address: CONTRACT_ADDRESSES.AEGIS_VAULT as `0x${string}`,
        abi: AEGIS_VAULT_ABI,
        functionName: "deposit",
        args: [selectedToken.address as `0x${string}`, amount],
      });
    } else {
      // Need approval first
      setStep("approving");
      writeApprove({
        address: selectedToken.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CONTRACT_ADDRESSES.AEGIS_VAULT as `0x${string}`, amount],
      });
    }
  };

  // ── Max button handler ──────────────────────────────────────────────────
  const handleMax = () => {
    if (rawBalance !== undefined && selectedToken) {
      setDepositAmount(formatUnits(rawBalance as bigint, selectedToken.decimals));
    }
  };

  // ── Derived state ───────────────────────────────────────────────────────
  const isBusy =
    isApprovePending ||
    isApproveConfirming ||
    isDepositPending ||
    isDepositConfirming ||
    isRouting;

  const buttonLabel = (() => {
    if (isApprovePending || isApproveConfirming) return "Approving…";
    if (isDepositPending || isDepositConfirming) return "Depositing…";
    return "Deposit to Beta Vault";
  })();

  if (!isConnected) {
    return (
      <div className="aegis-panel p-8 text-center flex flex-col items-center justify-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center text-xl">
          🔒
        </div>
        <div>
          <h3 className="font-bold text-lg">Wallet Not Connected</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">Please connect your wallet to use the Aegis beta vault.</p>
        </div>
      </div>
    );
  }

  if (!HAS_CONFIGURED_VAULT || !HAS_CONFIGURED_SUPPORTED_TOKENS || !selectedToken) {
    return (
      <div className="aegis-panel p-8 space-y-4 border border-dashed">
        <div>
          <h3 className="font-bold text-lg">Environment Configuration Required</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This {AEGIS_RUNTIME.postureLabel.toLowerCase()} runtime needs a vault address and at least one supported token before deposits can be enabled.
          </p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Configure `NEXT_PUBLIC_AEGIS_VAULT_ADDRESS` for Paseo, or `NEXT_PUBLIC_MOONBASE_STAGING_VAULT_ADDRESS` plus `NEXT_PUBLIC_MOONBASE_STAGING_TOKEN_ADDRESS` for Moonbase staging.
        </p>
      </div>
    );
  }

  return (
    <div className="aegis-panel overflow-hidden">
      <div className="bg-primary p-6 text-primary-foreground">
        <h2 className="text-xl font-bold tracking-tight">Deposit Assets</h2>
        <p className="text-sm opacity-80">
          Deposit supported assets into the {AEGIS_RUNTIME.chainName} vault surface
        </p>
      </div>
      
      <form onSubmit={handleDeposit} className="p-6 space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Select Asset</label>
          <div className="grid grid-cols-2 gap-2">
            {SUPPORTED_TOKENS.map((token) => (
              <button
                key={token.address}
                type="button"
                onClick={() => {
                  setSelectedToken(token);
                  setDepositAmount("");
                }}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  selectedToken.address === token.address 
                    ? "bg-primary/5 border-primary ring-1 ring-primary" 
                    : "bg-background border-input hover:bg-secondary/50"
                }`}
              >
                <span className="text-xl">{token.icon}</span>
                <span className="font-bold text-sm">{token.symbol}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Amount</label>
            <span className="text-xs font-bold text-indigo-600">Balance: {Number(formattedBalance).toFixed(4)} {selectedToken.symbol}</span>
          </div>
          <div className="relative">
            <input
              type="number"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              className="aegis-input h-14 text-lg font-bold pr-16"
            />
            <button 
              type="button"
              onClick={handleMax}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold bg-secondary hover:bg-secondary/80 rounded uppercase tracking-tighter"
            >
              Max
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-secondary/30 border border-dashed space-y-2">
          <div className="flex justify-between text-xs font-medium">
            <span className="text-muted-foreground">Launch Mode</span>
            <span className="text-muted-foreground font-bold">
              Vault-only beta
            </span>
          </div>
          <div className="flex justify-between text-xs font-medium">
            <span className="text-muted-foreground">Routing</span>
            <span className="text-indigo-600 font-bold">Separate experimental workflow</span>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium animate-shake">
            {error}
          </div>
        )}

        {success && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-medium">
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={!depositAmount || isBusy}
          className="aegis-button aegis-button-primary w-full h-12 text-base shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          {isBusy ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              {buttonLabel}
            </span>
          ) : (
            buttonLabel
          )}
        </button>

        {(approveHash || depositHash) && (
          <div className="p-3 rounded-lg bg-secondary/50 border text-[10px] font-mono break-all opacity-60">
            TX: {depositHash ?? approveHash}
          </div>
        )}
      </form>
    </div>
  );
}
