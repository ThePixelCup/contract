require("hardhat-gas-reporter");
require("@nomicfoundation/hardhat-toolbox");
require('solidity-coverage');

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.9',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
    compilers: {
      settings: {
        outputSelection: {
          "*": {
            "*": ["storageLayout"]
          }
        }
      }
    }
  },
  gasReporter: {
    enabled: false,
    currency: "USD"
  }
};