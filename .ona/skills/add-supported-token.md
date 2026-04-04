# Add a Supported Token

## Contract side

1. Locate or deploy the ERC-20 token on Paseo testnet.

2. Call `addSupportedToken` from the **owner** wallet:
   ```bash
   # Using cast (foundry) or a Hardhat script
   cast send <AEGIS_VAULT_ADDRESS> "addSupportedToken(address)" <TOKEN_ADDRESS> \
     --rpc-url https://eth-rpc-testnet.polkadot.io \
     --private-key $PRIVATE_KEY
   ```

3. Verify the token is accepted:
   ```bash
   cast call <AEGIS_VAULT_ADDRESS> "supportedTokens(address)(bool)" <TOKEN_ADDRESS> \
     --rpc-url https://eth-rpc-testnet.polkadot.io
   # Should return: true
   ```

## Frontend side

1. Add the token entry to `SUPPORTED_TOKENS` in `frontend/lib/contracts.ts`:
   ```typescript
   {
     symbol: "SYM",
     name: "Token Name",
     address: CONTRACT_ADDRESSES.SYM,
     decimals: 18,   // match the token's actual decimals
     icon: "🪙",
   },
   ```

2. Add the address constant to `CONTRACT_ADDRESSES` in the same file:
   ```typescript
   SYM: resolveAddress(
     process.env.NEXT_PUBLIC_SYM_ADDRESS,
     "0x0000000000000000000000000000000000000000"
   ),
   ```

3. Add the env var to `frontend/.env.example` and `frontend/.env.local`:
   ```
   NEXT_PUBLIC_SYM_ADDRESS=0x<token-address>
   ```

## Tests

Add a test case in `contracts/test/AegisVault.test.js` that:
- Deploys a fresh `MockERC20` for the new token
- Calls `addSupportedToken`
- Deposits and withdraws the token
- Verifies balances before and after

Run: `cd contracts && npx hardhat test`
