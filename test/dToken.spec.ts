import chai, { expect } from "chai";
import { ethers } from "hardhat";
import { solidity } from "ethereum-waffle";

import { DToken__factory } from "../typechain-types/factories/DToken__factory";
import { DToken } from "../typechain-types/DToken";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";

import "./types";
import { NonReceivable, ReentrancyAttacker } from "../typechain-types";
import {BalanceTracker} from "./BalanceTracker";
chai.use(solidity);

// to utils -----------------
const bigNumberCloseTo = (a: BigNumber, n: BigNumber, delta = ether(0.1)) => 
         a.gt(n)? a.sub(n).lte(delta) : n.sub(a).lte(delta);
chai.Assertion.addMethod('approx', function (bn: BigNumber, delta = 0.02) {
  var obj = this._obj as BigNumber;
  let deltabn = bn.mul(ether(delta)).div(ether(1));
  this.assert(
        bigNumberCloseTo(obj, bn, deltabn)
    , `expected ${obj.toString()} to be in between ${bn.sub(deltabn).toString()} ${bn.add(deltabn).toString()} but got ${obj.toString()}`
    , `expected ${obj.toString()} not in between ${bn.sub(deltabn).toString()} ${bn.add(deltabn).toString()}`
    , bn        // expected
    , obj   // actual
  );
});

const ether = (amount: number | string): BigNumber => {
  const weiString = ethers.utils.parseEther(amount.toString());
  return BigNumber.from(weiString);
};

// ---------------

interface Mocks {
    nonReceivable: NonReceivable;
    reentrancyAttacker: ReentrancyAttacker;
}

describe("DToken", function () {
    let DToken: DToken__factory;
    let dToken: DToken;

    let mocks: Mocks = <Mocks> {};

    let owner: SignerWithAddress;
    let bob: SignerWithAddress;
    let alice: SignerWithAddress;
    let oscar: SignerWithAddress;
    beforeEach("", async () => {
        let accounts = await ethers.getSigners();
        [owner, bob, alice, oscar, ...accounts]= accounts;

        DToken = await ethers.getContractFactory("DToken");
        dToken = await DToken.deploy("Dividend Token", "DTK");
    });
    it("Ensure token deployed properly", async function () {
        expect(await dToken.name()).to.eq("Dividend Token");
        expect(await dToken.symbol()).to.eq("DTK");
    });
    describe("ERC20 mint related tests", async () => {
        it("mint() -- owner minting quantity for alice", async () => {
            await dToken.mint(alice.address, ether(10));
            expect(await dToken.balanceOf(alice.address)).to.eq(ether(10));
        });
        it("mint() -- Bob trying to mint, should revert", async () => {
            await expect( dToken.connect(bob).mint(owner.address, ether(0.1))).to.be.revertedWith("Ownable: caller is not the owner");
        });
        it("mint() -- Owner trying to mint more than allowed quantity, should revert", async () => {
            await expect( dToken.mint(owner.address, ether(100.0001))).to.be.revertedWith("amount surpasses max supply");
        });
        it("mint() -- Owner trying to mint more than allowed quantity over multiple calls should revert", async () => {
            await dToken.mint(alice.address, ether(10));
            await dToken.mint(bob.address, ether(5));
            await dToken.mint(owner.address, ether(85));
            await expect( dToken.mint(owner.address, ether(0.0001))).to.be.revertedWith("amount surpasses max supply");
        });
    });
    describe("Withdrawal related tests", async () => {
        let recordBalances: () => Promise<void>;
        let stakersBalance: BalanceTracker;
        beforeEach("", async () => {
            mocks.nonReceivable = await (await ethers.getContractFactory("NonReceivable")).deploy();

            await dToken.mint(alice.address, ether(60));
            await dToken.mint(bob.address, ether(40));

            stakersBalance = new BalanceTracker();
            recordBalances = async () => await stakersBalance.pushMultiple([alice.address, bob.address]);

            let tx = () => owner.sendTransaction({value: ether(1), to: dToken.address});
            await expect(tx()).to.emit(dToken,  "FundsReceived").withArgs(ether(1), 1e9/1e2) ;
            expect(await ethers.provider.getBalance(dToken.address)).to.eq(ether(1));
        });
        it("withdraw() -- Trying to call while locked, should revert", async () => {
            await expect(dToken.connect(bob).withdraw()).to.be.revertedWith("contract is currently locked");
        });
        it("withdraw() -- Ensure shares are distributed properly ", async () => {
            await dToken.toggleLock();
            let aliceShares = await dToken.balanceOf(alice.address);
            let bobShares = await dToken.balanceOf(bob.address);

            expect(aliceShares).to.be.not.eq(ether(0));
            expect(bobShares).to.be.not.eq(ether(0));
            await recordBalances();

            await dToken.connect(bob).withdraw();
            await dToken.connect(alice).withdraw();
            await recordBalances();

            // Check Alice and Bob withdrew expected amount of eth 
            expect(stakersBalance.totalEarned(alice.address)).to.approx(ether(0.6));
            expect(stakersBalance.totalEarned(bob.address)).to.approx(ether(0.4));
        });
        
        it("withdraw() -- Verify transferring of debt properly with dividends ", async () => {
            await dToken.toggleLock();
            let aliceShares = await dToken.balanceOf(alice.address);
            let bobShares = await dToken.balanceOf(bob.address);

            expect(aliceShares).to.be.not.eq(ether(0));
            expect(bobShares).to.be.not.eq(ether(0));
            await recordBalances();
            await dToken.connect(bob).withdraw();
            await recordBalances();

            // Check  Bob withdrew expected amount of eth  / Alice receives non
            expect(stakersBalance.totalEarned(alice.address)).to.approx(ether(0));
            expect(stakersBalance.totalEarned(bob.address)).to.approx(ether(0.4));

            // Bob transfers ether(0.2) tokens to alice
            await dToken.connect(bob).transfer(alice.address, ether(20));

            // Double withdrawal by bob / should receive none 
            await dToken.connect(bob).withdraw();
            expect(stakersBalance.totalEarned(bob.address)).to.approx(ether(0.4));
            
            // Funds being sent to token
            await owner.sendTransaction({value: ether(2), to: dToken.address});
            await dToken.connect(bob).withdraw();
            await dToken.connect(alice).withdraw();
            await recordBalances();
            // Check Alice and  Bob withdrew expected amount of ETH  
            expect(stakersBalance.totalEarned(alice.address)).to.approx(ether(2.2));
            expect(stakersBalance.totalEarned(bob.address)).to.approx(ether(0.8));
        });

        it("withdraw() -- ensure proper distribution with more general scenario ", async () => {
            /**
             * Scenario 
             * Bob withdrew eth while Alice not
             * Bob trying to withdraw again but no extra funds sent
             * New amount of eth sent to token
             * Now Bob and Alice withdraw
             * total 3 ETH 
             * Bob should receive 1.2 = 0.4 + 0.8
             * Alice should receive 1.8 = 0 + 1.8
             */
            await dToken.toggleLock();
            let aliceShares = await dToken.balanceOf(alice.address);
            let bobShares = await dToken.balanceOf(bob.address);

            expect(aliceShares).to.be.not.eq(ether(0));
            expect(bobShares).to.be.not.eq(ether(0));

            await recordBalances();
            await dToken.connect(bob).withdraw();
            await recordBalances();
            
            // Check  Bob withdrew expected amount of eth  / Alice receives non
            expect(stakersBalance.totalEarned(alice.address)).to.approx(ether(0));
            expect(stakersBalance.totalEarned(bob.address)).to.approx(ether(0.4));

            // Double withdrawal by bob / should receive none 
            await dToken.connect(bob).withdraw();
            await recordBalances();
            expect(stakersBalance.totalEarned(bob.address)).to.approx(ether(0.4));
            
            // Funds being sent to token
            await owner.sendTransaction({value: ether(2), to: dToken.address});
            await dToken.connect(bob).withdraw();
            await dToken.connect(alice).withdraw();
            await recordBalances();
            // Check Alice and  Bob withdrew expected amount of ETH  
            expect(stakersBalance.totalEarned(alice.address)).to.approx(ether(1.8));
            expect(stakersBalance.totalEarned(bob.address)).to.approx(ether(1.2));
        });

        it("withdraw() -- Caller has no token balance,  should revert", async () => {
            await dToken.toggleLock();
            let oscarShares = await dToken.balanceOf(oscar.address);
            expect(oscarShares).to.be.eq(ether(0));
            await expect(dToken.connect(oscar).withdraw()).to.be.revertedWith("DToken: caller possess no shares");
        });
    });

    describe("Next Level Withdrawal related tests", async () => {
        let tx: () => Promise<any>;
        let stakersBalance: BalanceTracker;
        let recordBalances: () => Promise<void>;
        beforeEach("", async () => {
            mocks.nonReceivable = await (await ethers.getContractFactory("NonReceivable")).deploy();
            tx = () => owner.sendTransaction({value: ether(1), to: dToken.address});
            stakersBalance = new BalanceTracker();
            recordBalances = async () => {
                await stakersBalance.push(alice.address);
                await stakersBalance.push(bob.address);
                await stakersBalance.push(oscar.address);
            };
        });
       it("withdraw() -- Minting on different instants of fund receptions", async () => {
            /**
             * Scenario
             * Alice and Bob mint their shares
             * Funds received
             * Only Bob withdraw his funds
             * Bob receives 0.5 ETH
             * Oscar mints his share
             * New Funds received
             * Total 2 ETH
             * Oscar receives 0.5 ETH
             */
            await dToken.mint(alice.address, ether(5));
            await dToken.mint(bob.address, ether(5));
            await tx();  

            await dToken.toggleLock();

            await recordBalances();

            await dToken.connect(bob).withdraw();
            await recordBalances();

           // Check  Bob withdrew expected amount of eth  / Alice receives non
            expect(stakersBalance.totalEarned(alice.address)).to.approx(ether(0));
            expect(stakersBalance.totalEarned(bob.address)).to.approx(ether(0.5));
            
            await dToken.mint(oscar.address, ether(10));
            await tx();
            await dToken.connect(oscar).withdraw();
            await recordBalances();

            expect(stakersBalance.totalEarned(oscar.address)).to.approx(ether(0.5));
        });
       it("withdraw() -- Minting on different instants of fund receptions", async () => {
            /**
             * Scenario
             * Alice and Bob mint their shares 5 each
             * Funds received
             * Only Bob withdraw his funds
             * Bob receives 0.5 ETH
             * Oscar mints 10 shares
             * New Funds received
             * Total 2 ETH
             * Oscar receives 0.5 ETH
             * Bob mints 5 shares
             */
            await dToken.mint(alice.address, ether(5));
            await dToken.mint(bob.address, ether(5));
            await tx();  
            await dToken.toggleLock();
            
            await recordBalances();
            await dToken.connect(bob).withdraw();
            await dToken.mint(oscar.address, ether(10));
            await tx();
            await dToken.connect(oscar).withdraw();

            await dToken.mint(bob.address, ether(5));
            await dToken.connect(bob).withdraw();
            await recordBalances();
            expect(stakersBalance.totalEarned(bob.address)).to.approx(ether(0.75));
        });

    });
    describe("Withdrawal subtleties and possible attack", async () => {
        beforeEach("", async () => {
            mocks.nonReceivable = await (await ethers.getContractFactory("NonReceivable")).deploy();
            mocks.reentrancyAttacker = await (await ethers.getContractFactory("ReentrancyAttacker")).deploy(dToken.address);

            await dToken.mint(mocks.nonReceivable.address, ether(10));
            await owner.sendTransaction({value: ether(1), to: dToken.address});
            expect(await ethers.provider.getBalance(dToken.address)).to.eq(ether(1));

            await dToken.toggleLock();
        });
        it("withdraw() -- Resistant to reentrancy attack", async () => {
            await dToken.mint(mocks.reentrancyAttacker.address, ether(10));
            await expect (mocks.reentrancyAttacker.invokeWithdraw()).to.be.revertedWith("DToken: Could not withdraw eth");
        });
         it("withdraw() -- Fund withdrawal failure, should revert", async () => {

            expect(await ethers.provider.getBalance(mocks.nonReceivable.address)).to.eq(ether(0));
            await expect(  mocks.nonReceivable.invokeWithdraw(dToken.address)).to.be.revertedWith("DToken: Could not withdraw eth");

            expect(await ethers.provider.getBalance(mocks.nonReceivable.address)).to.eq(ether(0));
            expect(await ethers.provider.getBalance(dToken.address)).to.eq(ether(1));

        });       
    })
    describe("Other tests", async () => {
        it("Do not allow sending funds if no tokens are minted", async () => {
            let tx = () =>  owner.sendTransaction({value: ether(10), to: dToken.address});
            let initialEthBalance = await ethers.provider.getBalance(owner.address);

            await expect(tx()).to.be.revertedWith("No tokens minted");
            let finalEthBalance = await ethers.provider.getBalance(owner.address);
            expect(finalEthBalance.sub(initialEthBalance)).to.approx(ether(0));
        });
        it("emergencyWithdraw() -- all funds of contract are withdrawn to owner", async () => {
            await dToken.mint(oscar.address, ether(20));
            await owner.sendTransaction({value: ether(10), to: dToken.address});
            let initialEthBalance = await ethers.provider.getBalance(owner.address);

            await dToken.emergencyWithdraw();
            let finalEthBalance = await ethers.provider.getBalance(owner.address);
            expect(finalEthBalance.sub(initialEthBalance)).to.approx(ether(10));
        });
        it("toggleLock() -- ", async () => {
            expect(await dToken.locked()).to.be.true;

            await dToken.toggleLock();
            expect(await dToken.locked()).to.be.false;
        });
        it("emergencyWithdraw() -- ensure only owner can call", async () => {
            await expect(dToken.connect(oscar).emergencyWithdraw()).to.be.revertedWith("Ownable: caller is not the owner")
        });
        it("toggleLock() -- ensure only owner can call", async () => {
            await expect(dToken.connect(oscar).toggleLock()).to.be.revertedWith("Ownable: caller is not the owner")
            expect(await dToken.locked()).to.be.true;
        });
   });
});