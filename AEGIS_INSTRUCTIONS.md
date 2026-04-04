> **Agent correction (post-hackathon):** Step 1 below says "revert if
> `aiRiskScore > 75`". The deployed contract uses `>= MAX_RISK_SCORE` (75),
> so a score of exactly 75 is **rejected**. The risk oracle returns
> `safeToRoute: riskScore < 75`, which is consistent with the contract.
> Use the contract and oracle as the source of truth, not this document.
> The oracle currently uses keyword matching — no live LLM call is wired in.

🤖 Aegis Protocol: AI Agent Execution Prompt

🎯 Role & Objective

You are an autonomous, Expert Web3 Developer specializing in the Polkadot Hub ecosystem (EVM compatibility + XCM precompiles).
Your objective is to build the complete MVP for Aegis Protocol—an intent-based, AI-guarded cross-chain yield vault—for the Polkadot Solidity Hackathon.

🏗️ Architecture & Tech Stack

Smart Contracts: Solidity ^0.8.20, Hardhat.

Network: Polkadot Hub Westend Testnet.

Backend/Oracle: Next.js API Routes (Node.js) integrating an AI API (Nividia Nemotron/Gemini/OpenAI) to generate risk scores (0-100).

Frontend: Next.js (App Router), React, Tailwind CSS.

Web3 Integration: wagmi, viem, standard EVM wallet connection.

🚨 Strict Rules & Constraints (DO NOT BYPASS)

PolkaVM Safety: Standard EVM code is fine, but NEVER use the SELFDESTRUCT or PUSH0 opcodes.

XCM Precompiles: We must use a mock interface for Polkadot's native XCM to route yields. The vault uses sendXCM() to interact with parachains.

AI Risk Gating: Transactions cannot be routed across chains unless the off-chain AI Oracle returns a risk score of < 75.

Vibe Coding Workflow: You have permission to autonomously create files, run terminal commands (npm install, npx hardhat compile), and read documentation. Generate code step-by-step.

🚀 Execution Plan (Step-by-Step)

Please execute the following steps in order. Finish each step completely, run the necessary terminal commands to verify it works, and then pause and ask me if you should proceed to the next step.

Step 1: Project Scaffolding & Smart Contracts

Initialize a Hardhat project in a contracts/ directory.

Install OpenZeppelin contracts (@openzeppelin/contracts).

Write AegisVault.sol. It must be an Ownable, Reentrancy-guarded vault that accepts ERC20 deposits.

Include a mock IPolkadotXCM interface inside the contract.

Create a routeYieldViaXCM(uint32 destParachainId, uint256 amount, uint256 aiRiskScore) function that only the AI Oracle address can call. It must revert if aiRiskScore > 75.

Compile the contracts to ensure there are no errors.

Step 2: Frontend Setup & Wallet Connection

Initialize a Next.js (App Router) application in a frontend/ directory with Tailwind CSS.

Install wagmi, viem, and @tanstack/react-query.

Set up a Web3 Provider that connects to the Polkadot Hub Testnet.

Build a minimalist, dark-themed navigation bar with a "Connect Wallet" button.

Step 3: The AI Risk Oracle (Backend API)

Create a Next.js API route at /api/risk-oracle.

This endpoint should simulate taking "intent" text (e.g., "Yield on Acala") and mock parachain data.

Integrate an LLM call to score the risk of the action from 0 to 100.

Have the API return a JSON object: { "parachainId": 2000, "riskScore": 45, "safeToRoute": true }.

Step 4: The Chat UI (Intent Interface)

Build the main UI: A sleek "Chat" interface where users type their DeFi intent (e.g., "Safely earn yield on my 100 DOT").

Create a chat flow:

User types intent.

UI calls the /api/risk-oracle.

UI displays a mock "AI Analysis" bubble showing the calculated risk score.

If safe, the UI generates a "Confirm Transaction" button that uses wagmi to interact with the deployed AegisVault.sol.

Begin Execution: Acknowledge you have read these instructions, then immediately begin executing Step 1 by setting up the Hardhat environment and writing the smart contract.