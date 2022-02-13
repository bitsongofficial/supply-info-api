const axios = require("axios");
const express = require("express");
const { Decimal } = require("@cosmjs/math");
const { QueryClient, setupAuthExtension } = require("@cosmjs/stargate");
const { Tendermint34Client } = require("@cosmjs/tendermint-rpc");
const { PeriodicVestingAccount } = require("cosmjs-types/cosmos/vesting/v1beta1/vesting");

require("dotenv").config();

const denom = process.env.DENOM || "ubtsg";

const vestingAccounts = process.env.VESTING_ACCOUNTS
  ? process.env.VESTING_ACCOUNTS.split(",")
  : [];

const app = express();
const port = process.env.PORT || 3000;

async function makeClientWithAuth(rpcUrl) {
  const tmClient = await Tendermint34Client.connect(rpcUrl);
  return [QueryClient.withExtensions(tmClient, setupAuthExtension), tmClient];
}

// Declare variables
let ethTotalSupply, ethExcludeAddr1, ethExcludeAddr2, ethSupply, chainSupply, multiSigBalance, totalSupply, communityPool, communityPoolMainDenomTotal, circulatingSupply;

// Gets supply info from chain
async function updateData() {
  console.log("Updating supply info", new Date());

  // Get ETH supply
  ethTotalSupply = await axios({
    method: "get",
    url: `${process.env.ETHERSCAN_ENDPOINT}?module=stats&action=tokensupply&contractaddress=${process.env.ERC20_CONTRACT}&apikey=${process.env.ETHERSCAN_KEY}`,
  });

  console.log("Erc-20 Total Supply: ", ethTotalSupply.data.result)

  ethExcludeAddr1 = await axios({
    method: "get",
    url: `${process.env.ETHERSCAN_ENDPOINT}?module=account&action=tokenbalance&contractaddress=${process.env.ERC20_CONTRACT}&address=0x87d3fe35a04b53fcc087ca58218273289c2be6c2&apikey=${process.env.ETHERSCAN_KEY}`,
  });

  console.log("Erc-20 Exclude Addr 1 Supply: ", ethExcludeAddr1.data.result)

  ethExcludeAddr2 = await axios({
    method: "get",
    url: `${process.env.ETHERSCAN_ENDPOINT}?module=account&action=tokenbalance&contractaddress=${process.env.ERC20_CONTRACT}&address=0x36eabd1ce47ba68e7fa773808f039dae4fac2820&apikey=${process.env.ETHERSCAN_KEY}`,
  });

  console.log("Erc-20 Exclude Addr 2 Supply: ", ethExcludeAddr2.data.result)

  ethSupply = (ethTotalSupply.data.result - ethExcludeAddr1.data.result - ethExcludeAddr2.data.result) / 1e12

  console.log("Eth supply: ", ethSupply)

  // Get total supply
  chainSupply = await axios({
    method: "get",
    url: `${process.env.REST_API_ENDPOINT}/cosmos/bank/v1beta1/supply/${denom}`,
  });
  console.log("Chain supply: ", chainSupply.data.amount.amount);

  // Get multisig balance
  multiSigBalance = await axios({
    method: "get",
    url: `${process.env.REST_API_ENDPOINT}/cosmos/bank/v1beta1/balances/bitsong12r2d9hhnd2ez4kgk63ar8m40vhaje8yaa94h8w/by_denom?denom=${denom}`,
  });
  console.log("Multisig: ", multiSigBalance.data.balance.amount);

  // Get community pool
  communityPool = await axios({
    method: "get",
    url: `${process.env.REST_API_ENDPOINT}/cosmos/distribution/v1beta1/community_pool`,
  });

  // Loop through pool balances to find denom
  for (let i in communityPool.data.pool) {
    if (communityPool.data.pool[i].denom === denom) {
      console.log("Community pool: ", communityPool.data.pool[i].amount);

      communityPoolMainDenomTotal = communityPool.data.pool[i].amount;

      // Subtract community pool from total supply
      circulatingSupply =
      chainSupply.data.amount.amount - communityPool.data.pool[i].amount;
    }
  }

  // Create Tendermint RPC Client
  const [client, tmClient] = await makeClientWithAuth(process.env.RPC_ENDPOINT);

  // Iterate through vesting accounts and subtract vesting balance from total
  for (let i = 0; i < vestingAccounts.length; i++) {
    const account = await client.auth.account(vestingAccounts[i]);
    let accountInfo = PeriodicVestingAccount.decode(account.value);
    let originalVesting =
      accountInfo.baseVestingAccount.originalVesting[0].amount;
    let delegatedFree =
      accountInfo.baseVestingAccount.delegatedFree.length > 0
        ? accountInfo.baseVestingAccount.delegatedFree[0].amount
        : 0;

    circulatingSupply -= originalVesting - delegatedFree;
  }

  circulatingSupply += ethSupply
  circulatingSupply -= multiSigBalance.data.balance.amount
  console.log("Circulating supply: ", circulatingSupply);

  totalSupply = Number(chainSupply.data.amount.amount) + Number(ethSupply) - Number(multiSigBalance.data.balance.amount)
  console.log("Total supply: ", totalSupply);
}

// Get initial data
updateData();

// Update data on an interval (2 hours)
setInterval(updateData, 7200000);

app.get("/", async (req, res) => {
  res.json({
    circulatingSupply: Decimal.fromAtomics(circulatingSupply, 6).toString(),
    communityPool: Decimal.fromAtomics(
      communityPoolMainDenomTotal.split(".")[0],
      6
    ).toString(),
    denom: denom.substring(1).toUpperCase(),
    chainSupply: Decimal.fromAtomics(
      chainSupply.data.amount.amount,
      6
    ).toString(),
    ethSupply:  Decimal.fromAtomics(
      ethSupply,
      6
    ).toString(),
    totalSupply: Decimal.fromAtomics(
      totalSupply,
      6
    ).toString(),
  });
});

app.get("/circulating-supply", async (req, res) => {
  res.send(Decimal.fromAtomics(circulatingSupply, 6).toString());
});

app.get("/eth-supply", async (req, res) => {
  res.send(Decimal.fromAtomics(ethSupply, 6).toString());
});

app.get("/chain-supply", async (req, res) => {
  res.send(Decimal.fromAtomics(chainSupply.data.amount.amount, 6).toString());
});

app.get("/total-supply", async (req, res) => {
  res.send(Decimal.fromAtomics(totalSupply, 6).toString());
});

app.get("/community-pool", async (req, res) => {
  res.send(
    Decimal.fromAtomics(communityPoolMainDenomTotal.split(".")[0], 6).toString()
  );
});

app.get("/denom", async (req, res) => {
  res.send(denom.substring(1).toUpperCase());
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
