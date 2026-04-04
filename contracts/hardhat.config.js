require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("dotenv").config({ path: __dirname + "/.env.local" });

/** @type import('hardhat/config').HardhatUserConfig */
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";

const config = {
  solidity: {
    version: "0.8.20",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    // In-process Hardhat network used by tests
    hardhat: {
      chainId: 31337,
      forking: process.env.FORK_URL ? {
        url: process.env.FORK_URL,
        blockNumber: process.env.FORK_BLOCK_NUMBER ? parseInt(process.env.FORK_BLOCK_NUMBER) : undefined
      } : undefined
    },
    // Local node (e.g. hardhat node)
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      accounts: [PRIVATE_KEY]
    },
    // Paseo testnet (Polkadot Hub EVM endpoint)
    paseo: {
      url: process.env.NEXT_PUBLIC_PASEO_RPC_URL || "https://eth-rpc-testnet.polkadot.io",
      chainId: 420420417,
      accounts: [PRIVATE_KEY]
    }
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    noColors: true,
    currency: "USD",
    gasPrice: 1
  }
};

module.exports = config;
