//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.4;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract DToken is Ownable, ReentrancyGuard, ERC20 {

    uint256 constant public MAX_SUPPLY = 100 ether;
    uint32 constant private MULTIPLIER = 1e9;   // in gwei

    /// @notice Eth share of each token in gwei
    uint256 dividendPerToken;
    mapping(address => uint256) xDividendPerToken;
    /// @notice Amount that should have been withdrawn
    mapping (address => uint256) credit;

    /// @notice State variable representing amount withdrawn by account in ETH
    mapping (address => uint256) debt;

    /// @notice If locked is true, users are not allowed to withdraw funds
    bool public locked;

    event FundsReceived(uint256 amount, uint256 dividendPerToken);

    modifier mintable(uint256 amount) {
        require(amount + totalSupply() <= MAX_SUPPLY, "amount surpasses max supply");
        _;
    }
    modifier isUnlocked() {
        require(!locked, "contract is currently locked");
        _;
    }

    receive() external payable {
        require(totalSupply() != 0, "No tokens minted");
        dividendPerToken += msg.value * MULTIPLIER / totalSupply();    
        // gwei Multiplier decreases impact of remainder though
        emit FundsReceived(msg.value, dividendPerToken);
    }

    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        locked = true;
    }

    function mint(address to_, uint256 amount_) public onlyOwner mintable(amount_) {
        _withdrawToCredit(to_);
        _mint(to_, amount_);
    }

    function toggleLock() external onlyOwner {
        locked = !locked;
    }

    /// @notice Withdraw Eth from contract onto the caller w.r.t balance of token held by caller
    /// @dev Reentrancy Guard modifier in order to protect the transaction from reentrancy attack
    function withdraw() external nonReentrant isUnlocked {
        uint256 holderBalance = balanceOf(_msgSender());
        require(holderBalance != 0, "DToken: caller possess no shares");

        uint256 amount = ( (dividendPerToken - xDividendPerToken[_msgSender()]) * holderBalance / MULTIPLIER);
        amount += credit[_msgSender()];
        credit[_msgSender()] = 0;
        xDividendPerToken[_msgSender()] = dividendPerToken;

        (bool success, ) = payable(_msgSender()).call{value: amount}("");
        require(success, "DToken: Could not withdraw eth");
    }

    /// @notice In extreme cases (i.e. lost tokens) leading to unaccessed funds, owner can resort to this function 
    /// @dev Putting this function there requires trust from the community, hence, this needs to be discussed 
    function emergencyWithdraw() external onlyOwner {
        (bool success, ) = payable(owner()).call{value: address(this).balance}("");
        require(success, "DToken: Could not withdraw eth");

    }


    //=================================== INTERNAL ============================================== 
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal override {
        if(from == address (0) || to == address(0)) return;
        // receiver first withdraw funds to credit
        _withdrawToCredit(to);
        _withdrawToCredit(from);
    }

    //=================================== PRIVATE ============================================== 

    function _withdrawToCredit(
        address to_
    ) private
    {
        uint256 recipientBalance = balanceOf(to_);
        if(recipientBalance != 0) {
            uint256 amount = ( (dividendPerToken - xDividendPerToken[to_]) * recipientBalance / MULTIPLIER);
            credit[to_] += amount;
        }
        xDividendPerToken[to_] = dividendPerToken;
    }

}
