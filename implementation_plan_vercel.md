# Vercel Deployment — Aegis Protocol Frontend

Prepare the Next.js 16 frontend for a clean Vercel production deployment. The project is already linked (project `prj_RMF80UIMxSUatBC15HjLAbXiF6iL`). The build passes locally.

## Proposed Changes

### Next.js Configuration

#### [MODIFY] [next.config.ts](file:///Users/ekf/Downloads/Projects/Polka%20Agent/aegis%20protocol/frontend/next.config.ts)

- Remove `outputFileTracingRoot` and the `turbopack.root` override — these use `import.meta.url` / `path.dirname` which break in Vercel's serverless build. The defaults work correctly when the root directory is set to `frontend/` in Vercel.
- Add `output: "standalone"` for optimal cold-start performance on Vercel (smaller lambda bundles).
- Add `images.unoptimized: true` since there are no `<Image />` tags to optimize.

---

### Vercel Project Configuration

#### [MODIFY] [vercel.json](file:///Users/ekf/Downloads/Projects/Polka%20Agent/aegis%20protocol/frontend/vercel.json)

- Add security headers (`X-Frame-Options`, `Strict-Transport-Security`, `X-Content-Type-Options`, etc.) via `headers` config.
- Remove `installCommand` / `buildCommand` (they already match the defaults — `npm install` and `npm run build`).

---

### Environment Variables

#### [NEW] Set env vars via Vercel CLI

All 5 `NEXT_PUBLIC_*` variables from [.env.local](file:///Users/ekf/Downloads/Projects/Polka%20Agent/aegis%20protocol/frontend/.env.local) will be pushed to all Vercel environments (production, preview, development) using `vercel env add`:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_PASEO_RPC_URL` | `https://eth-rpc-testnet.polkadot.io` |
| `NEXT_PUBLIC_AEGIS_VAULT_ADDRESS` | `0x2BEf17e09b6F9a589d284f62F74281f0580969B3` |
| `NEXT_PUBLIC_DOT_TOKEN_ADDRESS` | `0x0000000000000000000000000000000000000000` |
| `NEXT_PUBLIC_USDT_TOKEN_ADDRESS` | `0x0000000000000000000000000000000000000000` |
| `NEXT_PUBLIC_USDC_TOKEN_ADDRESS` | `0x0000000000000000000000000000000000000002` |

> [!NOTE]
> `NEXT_PUBLIC_E2E_MOCK_WALLET` will **not** be set in Vercel — it defaults to `false` at runtime (intended for local playwright tests only).

---

### Git Ignore / Vercel Ignore

No changes needed. [.vercelignore](file:///Users/ekf/Downloads/Projects/Polka%20Agent/aegis%20protocol/frontend/.vercelignore) and [.gitignore](file:///Users/ekf/Downloads/Projects/Polka%20Agent/aegis%20protocol/frontend/.gitignore) are already correct.

## Verification Plan

### Automated Tests
1. **Local build**: `cd frontend && npm run build` — must exit 0 with all routes listed
2. **Vercel deployment**: `vercel --prod` — must return a live URL

### Manual Verification
After deployment, you should:
1. Open the production URL in a browser
2. Verify the landing page loads (hero, features, CTA)
3. Click "Launch App" → verify `/vault` page renders with deposit/withdraw forms
4. Confirm MetaMask injected connector prompt appears on wallet connect
