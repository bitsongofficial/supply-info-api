# supply-info-api

An API for basic info about the BTSG token supply.

The base route `/` returns all info in JSON:

```json
{
  "circulatingSupply": "63161153.948045",
  "communityPool": "15148190.952451",
  "denom": "BTSG",
  "chainSupply": "112203256.808764",
  "ethSupply": "9656879.127255",
  "totalSupply": "121860135.936019"
}
```

## Other routes

- `/circulating-supply`: returns circulating supply in plain text
- `/eth-supply`: returns circulating eth supply in plain text
- `/chain-supply`: returns bitsong blockchain total supply in plain text
- `/total-supply`: returns eth supply + bitsong blockchain total supply supply in plain text
- `/community-pool`: returns community pool size in plain text
- `/denom`: returns denom in plain text

### How circulating supply is calculated

1. Get ETH Conctract total supply.
2. Get Balance of BTSG Burned address `0x87d3fe35a04b53fcc087ca58218273289c2be6c2`
3. Get Balance of BTSG Black Hole address `0x36eabd1ce47ba68e7fa773808f039dae4fac2820`
4. Get bitsong chain supply.
5. Get bitsong community pool.
6. Subtract community pool from total supply.
7. Iterate through list of vesting amounts for large accounts (like early investors and team), and subtract the vesting ammount from total supply.
8. Calculate Total Supply (chainSupply + ethSupply)

This yields the circulating supply.

Vesting accounts are provided by an environment variable. See `.env.example` for an example.