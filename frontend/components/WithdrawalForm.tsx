"use client";

import { useEffect, useState } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import { AEGIS_VAULT_ABI, CONTRACT_ADDRESSES, SUPPORTED_TOKENS } from "@/lib/contracts";

type SupportedToken = (typeof SUPPORTED_TOKENS)[number];

export function WithdrawalForm() {
  const { address, isConnected } = useAccount();
  const [selectedToken, setSelectedToken] = useState<SupportedToken>(SUPPORTED_TOKENS[0]);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [userBalance, setUserBalance] = useState("0");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { data: depositBalance } = useReadContract({
    address: CONTRACT_ADDRESSES.AEGIS_VAULT as `0x${string}`,
    abi: AEGIS_VAULT_ABI,
    functionName: "getUserDeposit",
    args: address && selectedToken ? [address, selectedToken.address as `0x${string}`] : undefined,
    query: { enabled: !!address && !!selectedToken },
  });

  const { writeContract, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (depositBalance) {
      const balance = Number(depositBalance) / Math.pow(10, selectedToken.decimals);
      setUserBalance(balance.toFixed(6));
    } else {
      setUserBalance("0");
    }
  }, [depositBalance, selectedToken]);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!withdrawAmount || isNaN(Number(withdrawAmount))) {
      setError("Please enter a valid amount");
      return;
    }

    if (Number(withdrawAmount) <= 0) {
      setError("Amount must be greater than 0");
      return;
    }

    if (Number(withdrawAmount) > Number(userBalance)) {
      setError("Insufficient balance");
      return;
    }

    try {
      const amount = parseUnits(withdrawAmount, selectedToken.decimals);

      writeContract({
        address: CONTRACT_ADDRESSES.AEGIS_VAULT as `0x${string}`,
        abi: AEGIS_VAULT_ABI,
        functionName: "withdraw",
        args: [selectedToken.address as `0x${string}`, amount],
      });

      setWithdrawAmount("");
      setSuccess("Withdrawal request submitted to your wallet.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  };

  if (!isConnected) {
    return (
      <div className="aegis-panel p-8 text-center flex flex-col items-center justify-center space-y-4">
        <div className="h-12 w-12 rounded-full bg-secondary flex items-center justify-center text-xl">
          🔓
        </div>
        <div>
          <h3 className="font-bold text-lg">Wallet Not Connected</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">Please connect your wallet to manage your withdrawals and view your vault balance.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="aegis-panel overflow-hidden border-indigo-500/20">
      <div className="bg-indigo-600 p-6 text-white">
        <h2 className="text-xl font-bold tracking-tight">Withdraw Assets</h2>
        <p className="text-sm opacity-80">Retrieve your capital from the yield vault</p>
      </div>
      
      <form onSubmit={handleWithdraw} className="p-6 space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Select Asset</label>
          <div className="grid grid-cols-2 gap-2">
            {SUPPORTED_TOKENS.map((token) => (
              <button
                key={token.address}
                type="button"
                onClick={() => setSelectedToken(token)}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  selectedToken.address === token.address 
                    ? "bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500" 
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
            <span className="text-xs font-bold text-indigo-600">Available: {userBalance} {selectedToken.symbol}</span>
          </div>
          <div className="relative">
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              min="0"
              max={userBalance}
              className="aegis-input h-14 text-lg font-bold pr-16 border-indigo-200 focus-visible:ring-indigo-500"
            />
            <button 
              type="button"
              onClick={() => setWithdrawAmount(userBalance)}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded uppercase tracking-tighter"
            >
              Max
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-indigo-50/50 border border-dashed border-indigo-200 space-y-2">
          <div className="flex justify-between text-xs font-medium">
            <span className="text-muted-foreground">Withdrawal Fee</span>
            <span className="text-foreground font-bold">0.00%</span>
          </div>
          <div className="flex justify-between text-xs font-medium">
            <span className="text-muted-foreground">Unlocking Period</span>
            <span className="text-foreground font-bold">Instant (Paseo)</span>
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

        {isSuccess && (
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600 text-xs font-medium">
            Withdrawal successful! Your assets have been returned to your wallet.
          </div>
        )}

        <button
          type="submit"
          disabled={!withdrawAmount || isPending || isConfirming || Number(withdrawAmount) > Number(userBalance)}
          className="aegis-button bg-indigo-600 text-white hover:bg-indigo-700 w-full h-12 text-base shadow-lg shadow-indigo-600/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </span>
          ) : isConfirming ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Confirming...
            </span>
          ) : (
            "Withdraw Funds"
          )}
        </button>

        {hash && (
          <div className="p-3 rounded-lg bg-secondary/50 border text-[10px] font-mono break-all opacity-60">
            TX: {hash}
          </div>
        )}
      </form>
    </div>
  );
}
