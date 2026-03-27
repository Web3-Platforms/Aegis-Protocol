require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("solidity-coverage");
require("hardhat-gas-reporter");
require("dotenv").config({ path: __dirname + "/.env.local" });

/** @type import('hardhat/config').HardhatUserConfig */
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000000";

// XCM Precompile addresses for different networks
const XCM_PRECOMPILE_ADDRESSES = {
  // Moonbase Alpha testnet
  moonbaseAlpha: "0x0000000000000000000000000000000000000801",
  // Moonbeam mainnet
  moonbeam: "0x0000000000000000000000000000000000000801",
  // Moonriver (Kusama)
  moonriver: "0x0000000000000000000000000000000000000801",
  // Local node (default)
  localhost: "0x0000000000000000000000000000000000000801"
};

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
    // Local Hardhat network (default)
    hardhat: {
      chainId: 31337,
      forking: process.env.FORK_URL ? {
        url: process.env.FORK_URL,
        blockNumber: process.env.FORK_BLOCK_NUMBER ? parseInt(process.env.FORK_BLOCK_NUMBER) : undefined
      } : undefined
    },
    // Local Moonbeam/Polkadot node
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1281, // Moonbeam local chain ID
      accounts: [PRIVATE_KEY]
    },
    // Moonbase Alpha testnet
    moonbaseAlpha: {
      url: process.env.MOONBASE_RPC || "https://rpc.api.moonbase.moonbeam.network",
      chainId: 1287,
      accounts: [PRIVATE_KEY],
      gasPrice: 1000000000 // 1 Gwei
    },
    // Moonbeam mainnet
    moonbeam: {
      url: process.env.MOONBEAM_RPC || "https://rpc.api.moonbeam.network",
      chainId: 1284,
      accounts: [PRIVATE_KEY]
    },
    // Moonriver (Kusama parachain)
    moonriver: {
      url: process.env.MOONRIVER_RPC || "https://rpc.api.moonriver.moonbeam.network",
      chainId: 1285,
      accounts: [PRIVATE_KEY]
    },
    // Paseo testnet (Polkadot)
    paseo: {
      url: "https://eth-rpc-testnet.polkadot.io",
      chainId: 420420417,
      accounts: [PRIVATE_KEY]
    }
  },
  // Named accounts for easier reference in scripts/tests
  namedAccounts: {
    deployer: {
      default: 0
    },
    aiOracle: {
      default: 1
    }
  },
  // Etherscan verification
  etherscan: {
    apiKey: {
      moonbaseAlpha: process.env.MOONSCAN_API_KEY || "",
      moonbeam: process.env.MOONSCAN_API_KEY || "",
      moonriver: process.env.MOONSCAN_API_KEY || ""
    },
    customChains: [
      {
        network: "moonbaseAlpha",
        chainId: 1287,
        urls: {
          apiURL: "https://api-moonbase.moonscan.io/api",
          browserURL: "https://moonbase.moonscan.io"
        }
      },
      {
        network: "moonbeam",
        chainId: 1284,
        urls: {
          apiURL: "https://api-moonbeam.moonscan.io/api",
          browserURL: "https://moonscan.io"
        }
      },
      {
        network: "moonriver",
        chainId: 1285,
        urls: {
          apiURL: "https://api-moonriver.moonscan.io/api",
          browserURL: "https://moonriver.moonscan.io"
        }
      }
    ]
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    noColors: true,
    currency: "USD",
    gasPrice: 1
  }
};

// Export XCM precompile addresses for use in scripts
config.xcmPrecompiles = XCM_PRECOMPILE_ADDRESSES;

module.exports = config;
