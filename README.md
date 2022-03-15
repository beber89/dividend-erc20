## Run
- Install dependencies
```
yarn install
```
- Run tests
```
npx hardhat test
```
## Test cases
  DToken
    ✓ Ensure token deployed properly (50ms)
    ERC20 mint related tests
      ✓ mint() -- owner minting quantity for alice (49ms)
      ✓ mint() -- Bob trying to mint, should revert (39ms)
      ✓ mint() -- Owner trying to mint more than allowed quantity, should revert
      ✓ mint() -- Owner trying to mint more than allowed quantity over multiple calls should revert (101ms)
    Withdrawal related tests
      ✓ withdraw() -- Trying to call while locked, should revert
      ✓ withdraw() -- Ensure shares are distributed properly  (107ms)
      ✓ withdraw() -- Verify transferring of debt properly with dividends  (214ms)
      ✓ withdraw() -- ensure proper distribution with more general scenario  (170ms)
      ✓ withdraw() -- Caller has no token balance,  should revert
    Next Level Withdrawal related tests
      ✓ withdraw() -- Minting on different instants of fund receptions (196ms)
      ✓ withdraw() -- Minting on different instants of fund receptions (245ms)
    Withdrawal subtleties and possible attack
      ✓ withdraw() -- Resistant to reentrancy attack
      ✓ withdraw() -- Fund withdrawal failure, should revert
    Other tests
      ✓ Do not allow sending funds if no tokens are minted
      ✓ emergencyWithdraw() -- all funds of contract are withdrawn to owner (56ms)
      ✓ toggleLock() -- 
      ✓ emergencyWithdraw() -- ensure only owner can call
      ✓ toggleLock() -- ensure only owner can call
