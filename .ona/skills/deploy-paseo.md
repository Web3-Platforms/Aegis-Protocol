# Deploy to Paseo Testnet

## Prerequisites

- `PRIVATE_KEY` set in `contracts/.env.local` (testnet-only wallet)
- Wallet funded via https://faucet.polkadot.io/
- All contract tests passing: `cd contracts && npx hardhat test --grep-invert "gas profile"`

## Steps

1. Compile to catch any errors before spending gas:
   ```bash
   cd contracts && npm run compile
   ```

2. Deploy:
   ```bash
   npm run deploy
   ```
   Expected output:
   ```
   Deploying AegisVault to paseo...
   AegisVault deployed to: 0x...
   Deployment metadata written to: deployments/paseo.json
   ```

3. Copy the `aegisVault` address from `contracts/deployments/paseo.json`.

4. Update `frontend/.env.local`:
   ```
   NEXT_PUBLIC_AEGIS_VAULT_ADDRESS=0x<deployed-address>
   ```

5. Verify the frontend builds with the new address:
   ```bash
   cd frontend && npm run build
   ```

6. Commit `contracts/deployments/paseo.json`. Do **not** commit `.env.local`
   or any file containing `PRIVATE_KEY`.

## Notes

- The deploy script writes `deployments/<network>.json` automatically.
- `aiOracle` defaults to the deployer address when only one signer is available.
  Set a dedicated oracle address in production by calling
  `AegisVault.setAIOracleAddress(newAddress)` from the owner wallet after deploy.
- Block explorer: https://paseo.subscan.io
