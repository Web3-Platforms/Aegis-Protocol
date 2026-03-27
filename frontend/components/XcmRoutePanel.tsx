"use client";

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { useVaultActivityData } from "@/lib/useVaultActivityData";
import { encodeAssetDataForXCM, AssetType } from "@/lib/xcm-encoder";
import { CONTRACT_ADDRESSES } from "@/lib/contracts";

interface RouteFormData {
  destParachainId: string;
  amount: string;
  assetType: AssetType;
  assetId?: string;
  slippageTolerance: number;
  deadlineMinutes: number;
}

interface RebalanceStatus {
  isNeeded: boolean;
  currentWeight: number;
  targetWeight: number;
  deviation: number;
}

interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  txHash?: string;
}

const PARACHAIN_OPTIONS = [
  { id: 1000, name: "Paseo Asset Hub", icon: "🏛️" },
  { id: 2000, name: "Acala", icon: "🌾" },
  { id: 2001, name: "Astar", icon: "⭐" },
  { id: 2004, name: "Moonbeam", icon: "🌙" },
  { id: 2006, name: "Moonriver", icon: "🌊" },
];

const ASSET_TYPE_OPTIONS = [
  { value: AssetType.NATIVE, label: "Native (DOT/PAS)", description: "Relay chain native token" },
  { value: AssetType.WRAPPER_MAPPED, label: "Wrapped/Mapped", description: "Statemine/Statemint assets" },
];

export function XcmRoutePanel() {
  const { address, isConnected } = useAccount();
  const { stats, isLoading: isStatsLoading, routedAssetAddress } = useVaultActivityData();
  
  const [formData, setFormData] = useState<RouteFormData>({
    destParachainId: "1000",
    amount: "",
    assetType: AssetType.WRAPPER_MAPPED,
    assetId: "",
    slippageTolerance: 0.5, // Default 0.5%
    deadlineMinutes: 20, // Default 20 minutes
  });
  
  const [rebalanceStatus, setRebalanceStatus] = useState<RebalanceStatus | null>(null);
  const [isCheckingRebalance, setIsCheckingRebalance] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showAssetDetails, setShowAssetDetails] = useState(false);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Check rebalance status
  const checkRebalanceStatus = async () => {
    if (!isConnected || !address) return;
    
    setIsCheckingRebalance(true);
    try {
      const response = await fetch(`/api/rebalance-status?parachainId=${formData.destParachainId}`);
      if (response.ok) {
        const data = await response.json();
        setRebalanceStatus(data);
        
        if (data.isNeeded) {
          addToast({ type: "info", message: `Rebalance needed: ${data.deviation.toFixed(2)}% deviation from target` });
        }
      }
    } catch (error) {
      console.error("Failed to check rebalance status:", error);
    } finally {
      setIsCheckingRebalance(false);
    }
  };

  // Slippage validation
  const validateSlippage = (value: number): boolean => {
    if (value < 0.1) {
      addToast({ type: "error", message: "Slippage tolerance must be at least 0.1%" });
      return false;
    }
    if (value > 10) {
      addToast({ type: "error", message: "Slippage tolerance cannot exceed 10%" });
      return false;
    }
    return true;
  };

  const handleInputChange = (field: keyof RouteFormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = (): string | null => {
    if (!formData.destParachainId || parseInt(formData.destParachainId) <= 0) {
      return "Please enter a valid destination parachain ID";
    }
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      return "Please enter a valid amount";
    }
    if (formData.assetType === AssetType.WRAPPER_MAPPED && !formData.assetId) {
      return "Please enter an asset ID for wrapped/mapped assets";
    }
    if (formData.slippageTolerance < 0.1 || formData.slippageTolerance > 10) {
      return "Slippage tolerance must be between 0.1% and 10%";
    }
    if (formData.deadlineMinutes < 1 || formData.deadlineMinutes > 60) {
      return "Deadline must be between 1 and 60 minutes";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !address) {
      addToast({ type: "error", message: "Please connect your wallet first" });
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      addToast({ type: "error", message: validationError });
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Encode asset data for XCM
      const amountWei = BigInt(Math.floor(parseFloat(formData.amount) * 1e6));
      const destParachainId = parseInt(formData.destParachainId);
      const assetId = formData.assetId ? parseInt(formData.assetId) : undefined;
      
      const assetData = encodeAssetDataForXCM(
        routedAssetAddress || CONTRACT_ADDRESSES.USDC,
        amountWei,
        destParachainId,
        formData.assetType,
        assetId
      );

      // Calculate deadline timestamp
      const deadlineTimestamp = Math.floor(Date.now() / 1000) + (formData.deadlineMinutes * 60);
      
      // Calculate minAmountOut based on slippage tolerance
      const amountWei = BigInt(Math.floor(parseFloat(formData.amount) * 1e6));
      const minAmountOut = (amountWei * BigInt(Math.floor((100 - formData.slippageTolerance) * 100))) / BigInt(10000);

      // Call the API
      const response = await fetch("/api/execute-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: address,
          intent: `Route ${formData.amount} to parachain ${destParachainId}`,
          assetData,
          assetType: formData.assetType,
          assetId,
          feeAssetItem: 0,
          weightLimit: 1000000,
          slippageTolerance: formData.slippageTolerance,
          deadline: deadlineTimestamp,
          minAmountOut: minAmountOut.toString(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.detail || "Failed to execute route");
      }

      addToast({
        type: "success",
        message: `Successfully initiated XCM route to parachain ${destParachainId}`,
        txHash: result.txHash,
      });

      // Reset form
      setFormData({
        destParachainId: "1000",
        amount: "",
        assetType: AssetType.WRAPPER_MAPPED,
        assetId: "",
        slippageTolerance: 0.5,
        deadlineMinutes: 20,
      });
      setRebalanceStatus(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      addToast({ type: "error", message: `Route failed: ${message}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toFixed(2);
  };

  return (
    <div className="aegis-panel p-6 md:p-8 space-y-6">
      {/* Header with Stats */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-border/50">
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight">Cross-Chain Routing</h2>
          <p className="text-sm text-muted-foreground">
            Route assets via XCM to parachains
          </p>
        </div>
        <div className="flex items-center gap-4 bg-secondary/50 rounded-xl p-3">
          <div className="text-right">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Routed
            </p>
            <p className="text-lg font-bold tabular-nums">
              {isStatsLoading ? (
                <span className="inline-block w-16 h-5 bg-muted animate-pulse rounded" />
              ) : (
                `$${formatNumber(stats.totalYieldRouted)}`
              )}
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </div>
        </div>
      </div>

      {/* Route Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Destination Parachain */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">
            Destination Parachain
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {PARACHAIN_OPTIONS.map((para) => (
              <button
                key={para.id}
                type="button"
                onClick={() => handleInputChange("destParachainId", para.id.toString())}
                className={`p-3 rounded-xl border-2 transition-all duration-200 text-left ${
                  formData.destParachainId === para.id.toString()
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-secondary/50"
                }`}
              >
                <span className="text-lg">{para.icon}</span>
                <p className="text-xs font-semibold mt-1">{para.name}</p>
                <p className="text-[10px] text-muted-foreground">ID: {para.id}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Amount Input */}
        <div className="space-y-2">
          <label htmlFor="amount" className="text-sm font-semibold text-foreground">
            Amount (USDC)
          </label>
          <div className="relative">
            <input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => handleInputChange("amount", e.target.value)}
              className="w-full h-12 px-4 pr-16 rounded-xl border border-input bg-background text-foreground font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
              USDC
            </span>
          </div>
        </div>

        {/* Asset Type Selector */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-foreground">Asset Type</label>
          <div className="grid grid-cols-2 gap-3">
            {ASSET_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleInputChange("assetType", option.value)}
                className={`p-4 rounded-xl border-2 transition-all duration-200 text-left ${
                  formData.assetType === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-secondary/50"
                }`}
              >
                <p className="font-semibold text-sm">{option.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Asset ID (for Wrapped/Mapped) */}
        {formData.assetType === AssetType.WRAPPER_MAPPED && (
          <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <label htmlFor="assetId" className="text-sm font-semibold text-foreground">
              Asset ID (Statemine/Statemint)
            </label>
            <input
              id="assetId"
              type="number"
              min="1"
              placeholder="e.g., 1984 (USDC on Statemine)"
              value={formData.assetId}
              onChange={(e) => handleInputChange("assetId", e.target.value)}
              className="w-full h-12 px-4 rounded-xl border border-input bg-background text-foreground font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            <p className="text-xs text-muted-foreground">
              Enter the asset ID from Statemine/Statemint registry
            </p>
          </div>
        )}

        {/* Slippage Tolerance Slider */}
        <div className="space-y-3 p-4 bg-secondary/20 rounded-xl">
          <div className="flex justify-between items-center">
            <label className="text-sm font-semibold text-foreground">
              Slippage Tolerance
            </label>
            <span className={`text-sm font-bold ${
              formData.slippageTolerance <= 0.5 ? 'text-green-600' : 
              formData.slippageTolerance <= 2 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {formData.slippageTolerance}%
            </span>
          </div>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={formData.slippageTolerance}
            onChange={(e) => {
              const value = parseFloat(e.target.value);
              if (validateSlippage(value)) {
                handleInputChange("slippageTolerance", value);
              }
            }}
            className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary hover:accent-primary/80 transition-all"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0.1%</span>
            <span>Safe: ≤0.5%</span>
            <span>10%</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Maximum price movement allowed before transaction reverts
          </p>
        </div>

        {/* Deadline Input */}
        <div className="space-y-2">
          <label htmlFor="deadline" className="text-sm font-semibold text-foreground">
            Transaction Deadline
          </label>
          <div className="relative">
            <input
              id="deadline"
              type="number"
              min="1"
              max="60"
              value={formData.deadlineMinutes}
              onChange={(e) => handleInputChange("deadlineMinutes", parseInt(e.target.value) || 20)}
              className="w-full h-12 px-4 pr-20 rounded-xl border border-input bg-background text-foreground font-medium placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
              minutes
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Transaction will revert if not mined within this time window
          </p>
        </div>

        {/* Rebalance Status Indicator */}
        {rebalanceStatus && (
          <div className={`p-4 rounded-xl border-2 ${
            rebalanceStatus.isNeeded 
              ? 'border-yellow-500/50 bg-yellow-500/10' 
              : 'border-green-500/50 bg-green-500/10'
          } animate-in fade-in duration-300`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                rebalanceStatus.isNeeded ? 'bg-yellow-500/20' : 'bg-green-500/20'
              }`}>
                {rebalanceStatus.isNeeded ? (
                  <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <p className={`font-semibold ${rebalanceStatus.isNeeded ? 'text-yellow-700' : 'text-green-700'}`}>
                  {rebalanceStatus.isNeeded ? 'Rebalance Recommended' : 'Portfolio Balanced'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Current: {rebalanceStatus.currentWeight.toFixed(2)}% | 
                  Target: {rebalanceStatus.targetWeight.toFixed(2)}% | 
                  Deviation: {rebalanceStatus.deviation.toFixed(2)}%
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Check Rebalance Button */}
        <button
          type="button"
          onClick={checkRebalanceStatus}
          disabled={isCheckingRebalance || !isConnected}
          className="w-full h-10 bg-secondary text-secondary-foreground rounded-lg font-medium hover:bg-secondary/80 transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isCheckingRebalance ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Checking...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Check Rebalance Status
            </>
          )}
        </button>

        {/* Advanced Options Toggle */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowAssetDetails(!showAssetDetails)}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform duration-200 ${showAssetDetails ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Advanced Options
          </button>
          
          {showAssetDetails && (
            <div className="mt-4 p-4 bg-secondary/30 rounded-xl space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fee Asset Item</span>
                <span className="font-medium">0</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Weight Limit</span>
                <span className="font-medium">1,000,000</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Risk Score</span>
                <span className="font-medium text-green-600">42 (Safe)</span>
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || !isConnected}
          className="w-full h-14 bg-primary text-primary-foreground rounded-xl font-bold text-lg shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-3"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Routing...</span>
            </>
          ) : !isConnected ? (
            <span>Connect Wallet to Route</span>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span>Execute XCM Route</span>
            </>
          )}
        </button>

        {!isConnected && (
          <p className="text-center text-sm text-muted-foreground">
            Connect your wallet to initiate cross-chain routes
          </p>
        )}
      </form>

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl shadow-xl animate-in slide-in-from-right duration-300 ${
              toast.type === "success"
                ? "bg-green-500 text-white"
                : toast.type === "error"
                ? "bg-red-500 text-white"
                : "bg-blue-500 text-white"
            }`}
          >
            <div className="flex-1">
              <p className="font-medium text-sm">{toast.message}</p>
              {toast.txHash && (
                <a
                  href={`https://moonbase.moonscan.io/tx/${toast.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs opacity-90 hover:opacity-100 underline mt-1 inline-flex items-center gap-1"
                >
                  View Transaction
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="opacity-70 hover:opacity-100 transition-opacity"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
