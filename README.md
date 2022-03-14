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
- ✓ Ensure token deployed properly (47ms)
### ERC20 mint related tests
- ✓ Owner minting quantity of dividend token for alice.
- ✓ Bob trying to mint dividend token, should revert as he is not allowed to.
- ✓ Owner trying to mint more than maximum supply allowed, should revert.
- ✓ Owner trying to mint more than maximum supply allowed over multiple calls should revert. 
### Withdrawal related tests
- ✓ Trying to call `withdraw()` while locked, should revert.
- ✓ Ensure shares are distributed properly   (81ms).
- ✓ Ensure proper distribution of funds with more general scenario  (137ms).
- ✓ Caller calling `withdraw()` has no token balance,  should revert.
### Withdrawal subtleties and possible attack
- ✓ Resistant to reentrancy attack.
- ✓ If fund withdrawal fails, transaction should revert.
### Other tests
- ✓ Do not allow sending funds to token if no tokens are minted yet.
- ✓ All funds of contract are withdrawn to owner on calling `emergencyWithdraw()` (58ms).
- ✓ Verify locking and unlocking is properly functioning.
- ✓ Ensure only owner can call.
- ✓ Verify only owner can call
