//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.4;

interface IDToken {
    function withdraw() external;
}

contract NonReceivable {
    constructor () {}

    function invokeWithdraw( IDToken target) external  {
        target.withdraw();
    }
}

