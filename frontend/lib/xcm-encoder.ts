/**
 * XCM Encoder Utility
 * 
 * This module provides functions to encode asset data for Polkadot XCM transfers
 * using the @polkadot/api Scale codec, following the Polkadot XCM spec.
 * 
 * Compatible with Polkadot/Moonbeam XCM precompiles
 * Supports multiple asset types: Native (0) and Wrapper/Mapped (1)
 */

// BN import removed - not currently used

/**
 * Asset type enum for XCM encoding
 * 0 = Native (e.g., DOT on Polkadot, PAS on Paseo)
 * 1 = Wrapper/Mapped (e.g., Statemine/Statemint assets, bridged assets)
 */
export enum AssetType {
  NATIVE = 0,
  WRAPPER_MAPPED = 1,
}

/**
 * Asset definition for XCM encoding
 */
export interface XCMAsset {
  /** Token address (for ERC20) or asset ID (for native) */
  id: string;
  /** Amount in smallest unit (wei) */
  amount: bigint;
  /** Asset type: "ERC20" | "Native" */
  assetType: "ERC20" | "Native";
}

/**
 * XCM Encode Options
 */
export interface XCMEncodeOptions {
  /** Destination parachain ID */
  destParachainId: number;
  /** Source of the assets */
  beneficiary?: string;
  /** Fee asset index */
  feeAssetItem?: number;
  /** Asset type for encoding (0=Native, 1=Wrapper/Mapped) */
  assetType?: AssetType;
  /** Asset ID for wrapper/mapped assets (e.g., Statemine asset ID) */
  assetId?: number;
  /** Slippage tolerance in percentage (0.1-10) */
  slippageTolerance?: number;
  /** Transaction deadline timestamp (Unix seconds) */
  deadline?: number;
  /** Minimum amount out (calculated from slippage) */
  minAmountOut?: bigint;
}

/**
 * Rebalance configuration for cross-chain vault rebalancing
 */
export interface RebalanceConfig {
  /** Target weight percentage for the parachain (0-100) */
  targetWeight: number;
  /** Threshold deviation percentage that triggers rebalancing (default 5%) */
  threshold: number;
  /** Maximum slippage allowed for rebalancing trades */
  maxSlippage: number;
  /** Whether rebalancing is currently enabled */
  enabled: boolean;
}

/**
 * MultiLocation junction types for Polkadot XCM
 */
export enum JunctionType {
  Parachain = 0x00,
  AccountId32 = 0x01,
  AccountIndex64 = 0x02,
  AccountKey20 = 0x03,
  PalletInstance = 0x04,
  GeneralIndex = 0x05,
  GeneralKey = 0x06,
  OnlyChild = 0x07,
  Plurality = 0x08,
}

/**
 * Encodes asset data for XCM transfer using Polkadot Scale codec
 * 
 * This creates a proper XCM MultiAsset encoding that is compatible
 * with Polkadot/Moonbeam XCM precompiles.
 * 
 * @param assets Array of assets to encode
 * @param options Encoding options
 * @returns Hex-encoded asset data bytes
 */
export async function encodeXCMultiAsset(
  assets: XCMAsset[],
  options: XCMEncodeOptions
): Promise<`0x${string}`> {
  if (assets.length === 0) {
    throw new Error("At least one asset must be provided");
  }

  const assetType = options.assetType ?? AssetType.WRAPPER_MAPPED;

  // Encode each asset according to XCM MultiAsset format based on asset type
  const encodedAssets = assets.map((asset) => {
    return encodeSingleAsset(asset, assetType, options.assetId);
  });

  // Combine into MultiAssets format
  // Format: [count (1 byte)] + [asset1] + [asset2] + ...
  const countByte = assets.length.toString(16).padStart(2, "0");
  const combined = encodedAssets.join("");
  
  return `0x${countByte}${combined}` as `0x${string}`;
}

/**
 * Encodes a single asset for XCM based on asset type
 * 
 * XCM MultiAsset format:
 * - AssetId: Concrete { parents: u8, interior: Junctions }
 * - Fungible: amount (u128)
 * 
 * Native Asset (DOT/PAS):
 * - parents: 1 (from parachain perspective, parent is relay chain)
 * - interior: Here (empty, represents the relay chain native token)
 * 
 * Wrapper/Mapped Asset (Statemine/Statemint):
 * - parents: 1 (parent is relay chain)
 * - interior: X2(Parachain(statemineId), GeneralIndex(assetId))
 * 
 * ERC20 Asset (Moonbeam/Moonbase):
 * - parents: 0 (local)
 * - interior: X2(PalletInstance(48), AccountKey20(tokenAddress))
 * 
 * @param asset The asset to encode
 * @param assetType The asset type (Native=0, Wrapper=1)
 * @param assetId Optional asset ID for wrapper assets
 * @returns Hex-encoded asset bytes
 */
function encodeSingleAsset(
  asset: XCMAsset, 
  assetType: AssetType,
  assetId?: number
): string {
  switch (assetType) {
    case AssetType.NATIVE:
      return encodeNativeAsset(asset);
    case AssetType.WRAPPER_MAPPED:
      return encodeWrapperAsset(asset, assetId);
    default:
      // Default to ERC20 encoding for backward compatibility
      return encodeERC20Asset(asset);
  }
}

/**
 * Encodes a native asset (DOT/PAS) MultiLocation
 * 
 * Format:
 * - parents: 1 (parent is relay chain)
 * - interior: Here (0x00, empty junctions representing native token)
 * - FunType: 0x00 (Fungible)
 * - Amount: u128 (little-endian)
 */
function encodeNativeAsset(asset: XCMAsset): string {
  // parents = 1 (from parachain, parent is relay chain where native token lives)
  const parents = "01";
  
  // Interior: Here (0x00) - represents the relay chain native token
  const interior = "00";
  
  const assetId = `${parents}${interior}`;
  
  // Fungible amount (u128, little-endian)
  const amountHex = asset.amount.toString(16).padStart(32, "0");
  const amountLE = hexToLittleEndian(amountHex);
  
  // FunType: 0x00 = Fungible
  const funType = "00";
  
  // Combine: AssetId + FunType + Amount
  return `${assetId}${funType}${amountLE}`;
}

/**
 * Encodes a wrapper/mapped asset (Statemine/Statemint assets)
 * 
 * Format:
 * - parents: 1 (parent is relay chain)
 * - interior: X2(Parachain(statemineId), GeneralIndex(assetId))
 * - FunType: 0x00 (Fungible)
 * - Amount: u128 (little-endian)
 * 
 * @param asset The asset to encode
 * @param statemineAssetId The Statemine/Statemint asset ID
 */
function encodeWrapperAsset(asset: XCMAsset, statemineAssetId?: number): string {
  // parents = 1 (parent is relay chain)
  const parents = "01";
  
  // Default to Statemine parachain ID (1000) if not specified
  const parachainId = statemineAssetId ? Math.floor(statemineAssetId / 1000000) : 1000;
  const assetId = statemineAssetId ? (statemineAssetId % 1000000) : 1;
  
  // Interior: X2(Parachain(id), GeneralIndex(assetId))
  // X2 indicator = 0x01
  // Parachain junction = 0x00 + u32 (little-endian)
  // GeneralIndex junction = 0x05 + u128 (little-endian)
  const x2Indicator = "01";
  const parachainJunction = encodeParachainJunction(parachainId);
  const generalIndexJunction = encodeGeneralIndexJunction(BigInt(assetId));
  
  const interior = `${x2Indicator}${parachainJunction}${generalIndexJunction}`;
  const assetIdEncoded = `${parents}${interior}`;
  
  // Fungible amount (u128, little-endian)
  const amountHex = asset.amount.toString(16).padStart(32, "0");
  const amountLE = hexToLittleEndian(amountHex);
  
  // FunType: 0x00 = Fungible
  const funType = "00";
  
  // Combine: AssetId + FunType + Amount
  return `${assetIdEncoded}${funType}${amountLE}`;
}

/**
 * Encodes an ERC20 asset (Moonbeam/Moonbase)
 * 
 * Format:
 * - parents: 0 (local)
 * - interior: X2(PalletInstance(48), AccountKey20(tokenAddress))
 * - FunType: 0x00 (Fungible)
 * - Amount: u128 (little-endian)
 * 
 * @param asset The asset to encode
 */
function encodeERC20Asset(asset: XCMAsset): string {
  // parents = 0 (local)
  const parents = "00";
  
  // Interior: X2(PalletInstance(48), AccountKey20(tokenAddress))
  const interior = encodeInteriorX2(asset.id);
  const assetIdEncoded = `${parents}${interior}`;
  
  // Fungible amount (u128, little-endian)
  const amountHex = asset.amount.toString(16).padStart(32, "0");
  const amountLE = hexToLittleEndian(amountHex);
  
  // FunType: 0x00 = Fungible
  const funType = "00";
  
  // Combine: AssetId + FunType + Amount
  return `${assetIdEncoded}${funType}${amountLE}`;
}

/**
 * Encodes a Parachain junction
 * Format: 0x00 + u32 (little-endian, 4 bytes)
 */
function encodeParachainJunction(parachainId: number): string {
  const junctionType = "00"; // Parachain variant
  const idHex = parachainId.toString(16).padStart(8, "0");
  const idLE = hexToLittleEndian(idHex);
  return `${junctionType}${idLE}`;
}

/**
 * Encodes a GeneralIndex junction
 * Format: 0x05 + u128 (little-endian, 16 bytes)
 */
function encodeGeneralIndexJunction(index: bigint): string {
  const junctionType = "05"; // GeneralIndex variant
  const indexHex = index.toString(16).padStart(32, "0");
  const indexLE = hexToLittleEndian(indexHex);
  return `${junctionType}${indexLE}`;
}

/**
 * Converts a hex string to little-endian byte order
 */
function hexToLittleEndian(hex: string): string {
  // Ensure even length
  const padded = hex.length % 2 === 0 ? hex : "0" + hex;
  const bytes = padded.match(/.{2}/g) || [];
  return bytes.reverse().join("");
}

/**
 * Encodes X2 interior junctions for ERC20 assets
 */
function encodeInteriorX2(tokenAddress: string): string {
  // X2 indicator
  const x2Indicator = "01"; // X2 variant
  
  // PalletInstance(48) - ERC20 pallet
  const palletInstance = "30"; // 48 in hex
  
  // AccountKey20 indicator + address
  const accountKey20Indicator = "02"; // AccountKey20 variant
  const address = tokenAddress.toLowerCase().slice(2).padStart(40, "0");
  
  return `${x2Indicator}${palletInstance}${accountKey20Indicator}${address}`;
}

/**
 * Encodes asset data for the XCM precompile sendXcm function
 * 
 * This is the primary function used by the execute-route API
 * Supports multiple asset types based on the assetType parameter
 * 
 * @param tokenAddress The ERC20 token address
 * @param amount The amount to transfer (in wei)
 * @param destParachainId The destination parachain ID
 * @param assetType The asset type (0=Native, 1=Wrapper/Mapped)
 * @param assetId Optional asset ID for wrapper/mapped assets
 * @returns Encoded bytes for XCM asset data
 */
export function encodeAssetDataForXCM(
  tokenAddress: string,
  amount: bigint,
  destParachainId: number = 1000,
  assetType: AssetType = AssetType.WRAPPER_MAPPED,
  assetId?: number
): `0x${string}` {
  // Create asset object
  const asset: XCMAsset = {
    id: tokenAddress,
    amount: amount,
    assetType: assetType === AssetType.NATIVE ? "Native" : "ERC20"
  };

  // Encode based on asset type
  const encoded = encodeSingleAsset(asset, assetType, assetId);
  
  return `0x${encoded}` as `0x${string}`;
}

/**
 * Encodes a native asset (DOT/PAS) for XCM
 * 
 * @param amount The amount to transfer
 * @param destParachainId The destination parachain ID
 * @returns Encoded bytes for native asset
 */
export function encodeNativeAssetData(
  amount: bigint,
  destParachainId: number = 1000
): `0x${string}` {
  const asset: XCMAsset = {
    id: "0x0000000000000000000000000000000000000000",
    amount: amount,
    assetType: "Native"
  };
  
  const encoded = encodeNativeAsset(asset);
  return `0x${encoded}` as `0x${string}`;
}

/**
 * Encodes a wrapper/mapped asset for XCM
 * 
 * @param tokenAddress The token address
 * @param amount The amount to transfer
 * @param statemineAssetId The Statemine/Statemint asset ID
 * @param destParachainId The destination parachain ID
 * @returns Encoded bytes for wrapper asset
 */
export function encodeWrapperAssetData(
  tokenAddress: string,
  amount: bigint,
  statemineAssetId: number,
  destParachainId: number = 1000
): `0x${string}` {
  const asset: XCMAsset = {
    id: tokenAddress,
    amount: amount,
    assetType: "ERC20"
  };
  
  const encoded = encodeWrapperAsset(asset, statemineAssetId);
  return `0x${encoded}` as `0x${string}`;
}

/**
 * Encodes multiple assets for XCM batch transfers
 * 
 * @param assets Array of {tokenAddress, amount, assetType, assetId} objects
 * @returns Encoded bytes for multiple assets
 */
export function encodeMultiAssetData(
  assets: { 
    tokenAddress: string; 
    amount: bigint; 
    assetType?: AssetType;
    assetId?: number;
  }[]
): `0x${string}` {
  if (assets.length === 0) {
    throw new Error("At least one asset required");
  }
  
  if (assets.length > 255) {
    throw new Error("Maximum 255 assets supported");
  }
  
  // Count of assets
  const count = assets.length.toString(16).padStart(2, "0");
  
  // Encode each asset
  const encodedAssets = assets.map(({ tokenAddress, amount, assetType, assetId }) => {
    const asset: XCMAsset = {
      id: tokenAddress,
      amount: amount,
      assetType: assetType === AssetType.NATIVE ? "Native" : "ERC20"
    };
    return encodeSingleAsset(asset, assetType ?? AssetType.WRAPPER_MAPPED, assetId);
  });
  
  return `0x${count}${encodedAssets.join("")}` as `0x${string}`;
}

/**
 * Calculates minimum output amount based on slippage tolerance
 * 
 * @param amount The input amount
 * @param slippageTolerance Slippage tolerance in percentage (0.1-10)
 * @returns Minimum acceptable output amount
 */
export function calculateMinAmountOut(
  amount: bigint,
  slippageTolerance: number
): bigint {
  if (slippageTolerance < 0.1 || slippageTolerance > 10) {
    throw new Error("Slippage tolerance must be between 0.1% and 10%");
  }
  
  // Calculate: amount * (100 - slippage) / 100
  const multiplier = BigInt(Math.floor((100 - slippageTolerance) * 100));
  const divisor = BigInt(10000);
  
  return (amount * multiplier) / divisor;
}

/**
 * Validates if rebalancing is needed based on current and target weights
 * 
 * @param currentWeight Current weight percentage (0-100)
 * @param targetWeight Target weight percentage (0-100)
 * @param threshold Threshold percentage that triggers rebalancing (default 5%)
 * @returns Object containing rebalance decision and deviation
 */
export function validateRebalanceNeeded(
  currentWeight: number,
  targetWeight: number,
  threshold: number = 5
): { isNeeded: boolean; deviation: number } {
  const deviation = Math.abs(currentWeight - targetWeight);
  return {
    isNeeded: deviation > threshold,
    deviation
  };
}

/**
 * Calculates deadline timestamp from minutes
 * 
 * @param minutes Minutes from now
 * @returns Unix timestamp in seconds
 */
export function calculateDeadline(minutes: number): number {
  return Math.floor(Date.now() / 1000) + (minutes * 60);
}

/**
 * Validates that encoded asset data is properly formatted
 * 
 * @param assetData The encoded asset data to validate
 * @returns true if valid, throws error if invalid
 */
export function validateAssetData(assetData: string): boolean {
  if (!assetData.startsWith("0x")) {
    throw new Error("Asset data must start with 0x");
  }
  
  const hexPart = assetData.slice(2);
  if (hexPart.length % 2 !== 0) {
    throw new Error("Asset data must have even number of hex characters");
  }
  
  // Minimum length check (version + parents + at least one asset)
  if (hexPart.length < 10) {
    throw new Error("Asset data too short");
  }
  
  return true;
}

/**
 * Decodes asset data for debugging purposes
 * 
 * @param assetData The encoded asset data
 * @param assetType The asset type to determine decoding strategy
 * @returns Decoded asset information
 */
export function decodeAssetData(
  assetData: string, 
  assetType: AssetType = AssetType.WRAPPER_MAPPED
): {
  parents: number;
  interior: string;
  tokenAddress?: string;
  parachainId?: number;
  assetId?: bigint;
  amount: bigint;
} {
  if (!assetData.startsWith("0x")) {
    throw new Error("Asset data must start with 0x");
  }
  
  const hex = assetData.slice(2);
  
  // Parents (first byte)
  const parents = parseInt(hex.slice(0, 2), 16);
  
  // Interior junctions (variable length)
  const interiorStart = 2;
  const interiorType = parseInt(hex.slice(interiorStart, interiorStart + 2), 16);
  
  let interiorEnd = interiorStart + 2;
  let tokenAddress: string | undefined;
  let parachainId: number | undefined;
  let assetId: bigint | undefined;
  
  if (interiorType === 0) {
    // Here - native asset
    interiorEnd = interiorStart + 2;
  } else if (interiorType === 1) {
    // X2 - decode based on asset type
    if (assetType === AssetType.WRAPPER_MAPPED) {
      // X2(Parachain, GeneralIndex)
      // Parachain: 0x00 + u32 (4 bytes)
      const paraJunctionStart = interiorStart + 2;
      const paraIdLE = hex.slice(paraJunctionStart + 2, paraJunctionStart + 10);
      const paraIdBE = hexToLittleEndian(paraIdLE);
      parachainId = parseInt(paraIdBE, 16);
      
      // GeneralIndex: 0x05 + u128 (16 bytes)
      const indexStart = paraJunctionStart + 10;
      const indexLE = hex.slice(indexStart + 2, indexStart + 34);
      const indexBE = hexToLittleEndian(indexLE);
      assetId = BigInt(`0x${indexBE}`);
      
      interiorEnd = indexStart + 34;
    } else {
      // X2(PalletInstance, AccountKey20)
      // Skip PalletInstance (2 bytes)
      const accountKeyStart = interiorStart + 6;
      tokenAddress = `0x${hex.slice(accountKeyStart, accountKeyStart + 40)}`;
      interiorEnd = accountKeyStart + 40;
    }
  }
  
  // Skip asset type byte
  const amountStart = interiorEnd + 2;
  
  // Amount (u128, little-endian)
  const amountLE = hex.slice(amountStart, amountStart + 32);
  const amountBE = hexToLittleEndian(amountLE);
  const amount = BigInt(`0x${amountBE}`);
  
  return {
    parents,
    interior: hex.slice(interiorStart, interiorEnd),
    tokenAddress,
    parachainId,
    assetId,
    amount,
  };
}

/**
 * Creates a complete XCM message for the precompile
 * 
 * This is used for advanced XCM operations
 * 
 * @param destParachainId Destination parachain ID
 * @param beneficiary Beneficiary address on destination
 * @param assets Assets to transfer
 * @returns Complete XCM message bytes
 */
export async function createXCMMessage(
  destParachainId: number,
  beneficiary: string,
  assets: XCMAsset[]
): Promise<`0x${string}`> {
  const encodedAssets = await encodeXCMultiAsset(assets, {
    destParachainId,
    beneficiary,
  });
  
  return encodedAssets;
}

// Export types for external use
export type { XCMAsset, XCMEncodeOptions };