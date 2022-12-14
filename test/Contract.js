const { expect } = require("chai");
const { smock } = require("@defi-wonderland/smock");
const Chance = require("chance");
const chance = new Chance();
const provider = hre.ethers.provider;

const getStickerProps = (id) => {
  const [country, type, number1, number2] = id.toString();
  return {
    id,
    country: Number(country),
    type: Number(type),
    number: Number(`${number1}${number2}`),
  };
};

describe("The Pixel Cup", () => {
  let totalPacks = 225,
    stickersPerPack = 4,
    maxWinners = 3,
    totalCountries = 6,
    totalTypes = 3,
    marketingPacks = 12,
    packPrice = ethers.utils.parseEther("0.01");

  let pixelCup,
    owner,
    userA,
    userB,
    userC,
    userD,
    userAstickers = [],
    userBstickers = [];

  describe("Setup", () => {
    it("Should deploy the contract", async () => {
      [owner, userA, userB, userC, userD] = await ethers.getSigners();
      const baseUri = "ipfs://QmUGSCB1ZKxNtqB2atogJYgoYoAq7qXM81kH45esbBkZSe";
      const contractUri =
        "ipfs://QmUGYgoYoAq7qXM81kH45esbBkZSeSCB1ZKxNtqB2atogJ";
      const Contract = await ethers.getContractFactory("ThePixelCup");
      pixelCup = await Contract.deploy(
        baseUri,
        contractUri,
        totalPacks + marketingPacks,
        marketingPacks,
        stickersPerPack,
        maxWinners,
        totalCountries,
        packPrice
      );

      // Contract conf
      expect(await pixelCup.totalPacks()).to.equal(totalPacks + marketingPacks);
      expect(await pixelCup.stickersPerPack()).to.equal(stickersPerPack);
      expect(await pixelCup.maxWinners()).to.equal(maxWinners);
      expect(await pixelCup.totalCountries()).to.equal(totalCountries);
      expect(await pixelCup.packPrice()).to.equal(packPrice);

      // Pack allocation
      expect(await pixelCup.packBalance(owner.address)).to.equal(
        marketingPacks
      );
      expect(await pixelCup.mintedPacks()).to.equal(marketingPacks);

      // Token Uri
      expect(await pixelCup.uri(1)).to.equal(baseUri);

      // Contract Uri for OpenSea
      expect(await pixelCup.contractURI()).to.equal(contractUri);
    });

    it("Should register stickers", async () => {
      const countryIds = [];
      const typeIds = [];
      const shirtNumbers = [];
      const amounts = [];
      for (let c = 1; c <= totalCountries; c++) {
        for (let t = 1; t <= totalTypes; t++) {
          for (let n = 1; n <= 10; n++) {
            countryIds.push(c);
            typeIds.push(t);
            shirtNumbers.push(n);
            amounts.push(5);
          }
        }
      }
      const totalAmount = amounts.reduce((p, a) => p + a, 0);
      const step = stickersPerPack;

      await expect(
        pixelCup
          .connect(userA)
          .registerStickers(countryIds, typeIds, shirtNumbers, amounts)
      ).to.be.revertedWith("Ownable: caller is not the owner");

      // Do it in batches as it will be in mainnet
      for (let j = step; j <= amounts.length + step; j += step) {
        await pixelCup.registerStickers(
          countryIds.slice(j - step, j),
          typeIds.slice(j - step, j),
          shirtNumbers.slice(j - step, j),
          amounts.slice(j - step, j)
        );
      }

      expect(await pixelCup.stickersAvailable()).to.equal(totalAmount);
      expect(await pixelCup.registeredStickers()).to.equal(amounts.length);
    });
  });

  describe("Token URI", () => {
    it("Should not let you set the revealed path", () =>
      expect(
        pixelCup.connect(userA).setRevealedPath("ipfs://xxx")
      ).to.be.revertedWith("Ownable: caller is not the owner"));

    it("Should set the revealed path", async () => {
      const path = "ipfs://QmeqevnZ7RSpnveBZrLLcmNRUUtuk3DkbWvU1C1SqbcAzm/";
      const tokenId = chance.integer({ min: 1100, max: 5300 });
      await pixelCup.setRevealedPath(path);
      expect(await pixelCup.uri(tokenId)).to.equal(`${path}${tokenId}`);
    });

    it("Should fail to let you udpate the reveal path", () =>
      expect(pixelCup.setRevealedPath("ipfs://xxx")).to.be.revertedWith(
        "Reveal path has been set"
      ));
  });

  describe("Packs", () => {
    it("Should fail to update pack price if not owner", () =>
      expect(
        pixelCup.connect(userA).setPackPrice(ethers.utils.parseEther("0.02"))
      ).to.be.revertedWith("Ownable: caller is not the owner"));

    it("Should fail to update pack price if is the samer", () =>
      expect(
        pixelCup.connect(owner).setPackPrice(packPrice)
      ).to.be.revertedWith("Cannot be the same value"));

    it("Should update the pack price", async () => {
      expect(ethers.utils.formatEther(packPrice)).to.equal("0.01");
      const newPrice = ethers.utils.parseEther("0.02");

      await pixelCup.connect(owner).setPackPrice(newPrice);
      packPrice = await pixelCup.packPrice();
      expect(newPrice).to.deep.equal(packPrice);
    });

    it("Should fail to buy more than the available packs", async () =>
      expect(
        pixelCup.mintPacks(userA.address, totalPacks + 1, {
          value: packPrice.mul(totalPacks + 1),
        })
      ).to.be.revertedWith("Not enough packs left"));

    it("Should fail with insuficient funds", async () =>
      expect(
        pixelCup.mintPacks(userA.address, 2, {
          value: packPrice,
        })
      ).to.be.revertedWith("Insufficient funds"));

    it("Should mint pack(s) on the wallet", async () => {
      const packsToMint = 2;
      const totalPrice = packPrice.mul(packsToMint);
      const mintedPacks = await pixelCup.mintedPacks();
      await pixelCup.mintPacks(userA.address, packsToMint, {
        value: totalPrice,
      });

      // User pack balance
      expect(await pixelCup.packBalance(userA.address)).to.equal(
        packsToMint,
        "Packs to mint"
      );

      // Minted packs counter
      expect(await pixelCup.mintedPacks()).to.equal(
        mintedPacks.add(packsToMint)
      );

      // Balances
      expect(await provider.getBalance(pixelCup.address)).to.equal(
        totalPrice,
        "Contract balance"
      );
      expect(await pixelCup.prizePoolBalance()).to.equal(
        totalPrice.div(2),
        "Pool balance"
      );
      expect(await pixelCup.ownerBalance()).to.equal(
        totalPrice.div(2),
        "Owner balance"
      );
    });
  });

  describe("Open packs", () => {
    it("Should check if opening pack is enabled", async () =>
      expect(pixelCup.connect(userB).openPacks(1)).to.be.revertedWith(
        "This function is not yet enabled!"
      ));

    it("Should only allow the owner to enable open packs", async () =>
      expect(pixelCup.connect(userB).enableOpenPacks(true)).to.be.revertedWith(
        "Ownable: caller is not the owner"
      ));

    it("Should check that only EOA can open packs", async () => {
      await pixelCup.enableOpenPacks(true);
      const Contract = await ethers.getContractFactory("ThePixelCup");
      const anotherContract = await Contract.deploy(
        "ipfs://{id}.json",
        "ipfs://contract.json",
        totalPacks,
        1,
        stickersPerPack,
        maxWinners,
        totalCountries,
        packPrice
      );

      try {
        // We need to impersonate another contract to trigger the onlyEoa
        // Credit to this answer
        // https://ethereum.stackexchange.com/questions/122959/call-a-smart-contract-function-with-another-deployed-smart-contract-address-as
        await hre.network.provider.request({
          method: "hardhat_impersonateAccount",
          params: [anotherContract.address],
        });
        const signer = await ethers.getSigner(anotherContract.address);
        await signer.sendTransaction({
          to: anotherContract.address,
          value: ethers.utils.parseEther("1"),
        });
        await pixelCup.connect(signer).openPacks(1);
      } catch (error) {
        await hre.network.provider.request({
          method: "hardhat_stopImpersonatingAccount",
          params: [anotherContract.address],
        });
        expect(error.message).to.include("Not EOA");
      }
    });

    it("Should fail if user doesnt have enough pack balance", async () =>
      expect(pixelCup.connect(userB).openPacks(10)).to.be.revertedWith(
        "ERC1155: burn amount exceeds balance"
      ));

    it("Should open the pack for stickers", async () => {
      const packsToMint = 1;
      await pixelCup.mintPacks(userB.address, packsToMint, {
        value: packPrice.mul(packsToMint),
      });
      const totalStickersMinted = packsToMint * stickersPerPack;

      // Check the function return list of stickers
      const totalStickersPrev = await pixelCup
        .connect(userB)
        .callStatic.openPacks(packsToMint);
      expect(totalStickersPrev.length).to.equal(totalStickersMinted);

      const tx = await pixelCup.connect(userB).openPacks(packsToMint);
      const { events } = await tx.wait();
      // Burn pack
      expect(events[0].args.from).to.equal(userB.address);
      expect(events[0].args.to).to.equal(ethers.constants.AddressZero);
      expect(events[0].args.id).to.equal(1);

      // Stickers minted
      const packsOpened = events.filter(({ event }) => event === "PackOpened");
      expect(packsOpened.length).to.equal(packsToMint);
      let totalMinted = 0;
      packsOpened.forEach((pack) => {
        const {
          args: { _stickers },
        } = pack;
        totalMinted += _stickers.length;
        expect(_stickers.length).to.equal(stickersPerPack);
        userBstickers.push(..._stickers);
      });
      expect(totalMinted).to.equal(totalStickersMinted);
    });
  });

  describe("Trades", () => {
    let tradeIndex;

    it("Should fail to cancel an invalid trade", async () =>
      expect(pixelCup.connect(userA).cancelTrade(1000)).to.be.revertedWith(
        "Trade does not exist"
      ));

    it("Should fail to complete an invalid trade", async () =>
      expect(pixelCup.connect(userA).completeTrade(1000, 10)).to.be.revertedWith(
        "Trade does not exist"
      ));

    it("Should fail if starting a trade with a pack", async () => {
      const stickerReq = userBstickers[0];
      const [reqCountry, reqType] = stickerReq.toString();
      await expect(
        pixelCup
          .connect(userA)
          .startTrade(1, Number(reqCountry), Number(reqType), 0)
      ).to.be.revertedWith("Cannot trade packs");
    });

    it("Should fail if starting a trade with invalid country", async () => {
      const stickerReq = userBstickers[0];
      const [reqCountry, reqType] = stickerReq.toString();
      await expect(
        pixelCup
          .connect(userA)
          .startTrade(
            stickerReq,
            Number(reqCountry) + totalCountries,
            Number(reqType),
            0
          )
      ).to.be.revertedWith("Invalid country");
    });

    it("Should fail if starting a trade with invalid type", async () => {
      const stickerReq = userBstickers[0];
      const [reqCountry] = stickerReq.toString();
      await expect(
        pixelCup.connect(userA).startTrade(stickerReq, Number(reqCountry), 4, 0)
      ).to.be.revertedWith("Invalid type");
    });

    it("Should make a trade with any shirt number", async () => {
      // Get some stickers for user A
      const tx = await pixelCup.connect(userA).openPacks(1);
      const { events } = await tx.wait();
      const {
        args: { _stickers },
      } = events.find(({ event }) => event === "PackOpened");
      userAstickers.push(..._stickers);

      // User A offers this sticker
      const stickerOffered = userAstickers[0];

      // Pick a sticker from user B to make the required trade
      const stickerReq = userBstickers[0];
      const [reqCountry, reqType] = stickerReq.toString();

      // Balance before starting trade
      const [preOfferA, contractBalance] = await pixelCup.balanceOfBatch(
        [userA.address, pixelCup.address],
        [stickerOffered, stickerOffered]
      );

      // The return-value of a non-constant (neither pure nor view) function is
      // available only when the function is called on-chain
      // https://ethereum.stackexchange.com/questions/88119/i-see-no-way-to-obtain-the-return-value-of-a-non-view-function-ethers-js
      const tradeIndex = await pixelCup
        .connect(userA)
        .callStatic.startTrade(
          stickerOffered,
          Number(reqCountry),
          Number(reqType),
          0
        );
      // Now call for real
      await pixelCup
        .connect(userA)
        .startTrade(stickerOffered, Number(reqCountry), Number(reqType), 0);

      // Total trades test
      const totalTrades = await pixelCup.totalTrades();
      expect(totalTrades).to.equal(1);

      // Balance after trade
      const [newOfferA, newContractBalance] = await pixelCup.balanceOfBatch(
        [userA.address, pixelCup.address],
        [stickerOffered, stickerOffered]
      );
      expect(preOfferA.toNumber() - 1).to.equal(newOfferA.toNumber());
      expect(newContractBalance.toNumber()).to.equal(
        contractBalance.toNumber() + 1
      );

      // Get trade details
      const tradeDetails = await pixelCup.tradeDetails(tradeIndex);
      expect(tradeDetails.offerId).to.equal(stickerOffered, "offerId");
      expect(tradeDetails.reqCountry).to.equal(reqCountry, "reqCountry");
      expect(tradeDetails.reqType).to.equal(reqType, "reqType");
      expect(tradeDetails.reqNumber.toNumber()).to.equal(0, "reqNumber");

      // Get the number of the required sticker
      const [, , number1, number2] = stickerReq.toString();
      const stickerReqNumber = Number(`${number1}${number2}`);

      // Balance before completing
      const [preReqA, preOfferB, preReqB] = await pixelCup.balanceOfBatch(
        [userA.address, userB.address, userB.address],
        [stickerReq, stickerOffered, stickerReq]
      );

      // Complete trade
      await pixelCup.connect(userB).completeTrade(tradeIndex, stickerReqNumber);

      // Balances after trade
      const [newReqA, newOfferB, newReqB] = await pixelCup.balanceOfBatch(
        [userA.address, userB.address, userB.address],
        [stickerReq, stickerOffered, stickerReq]
      );

      // Increment the user A requested sticker balance
      expect(newReqA.toNumber()).to.equal(preReqA.toNumber() + 1);
      // Increment the user B received sticker balance
      expect(newOfferB.toNumber()).to.equal(preOfferB.toNumber() + 1);
      // Reduce the balance of the user B
      expect(newReqB.toNumber()).to.equal(preReqB.toNumber() - 1);
    });

    it("Should make a trade for a specific shirt number", async () => {
      const stickerOffered = getStickerProps(userBstickers[1]);
      const stickerReq = getStickerProps(userAstickers[1]);

      const tradeIndex = await pixelCup
        .connect(userB)
        .callStatic.startTrade(
          stickerOffered.id,
          stickerReq.country,
          stickerReq.type,
          stickerReq.number
        );
      await pixelCup
        .connect(userB)
        .startTrade(
          stickerOffered.id,
          stickerReq.country,
          stickerReq.type,
          stickerReq.number
        );
      // Dummy trade to test ownerTrades
      const tradeToCancel = await pixelCup
        .connect(userB)
        .callStatic.startTrade(
          getStickerProps(userBstickers[2]).id,
          stickerReq.country,
          stickerReq.type,
          stickerReq.number
        );
      await pixelCup
        .connect(userB)
        .startTrade(
          getStickerProps(userBstickers[2]).id,
          stickerReq.country,
          stickerReq.type,
          stickerReq.number
        );
      await pixelCup
        .connect(userA)
        .startTrade(
          getStickerProps(userAstickers[2]).id,
          stickerOffered.country,
          stickerOffered.type,
          stickerOffered.number
        );

      const ownerTrades = await pixelCup.ownerTrades(userB.address);
      expect(ownerTrades).to.have.length(2);

      // Cancel a trade
      await expect(
        pixelCup.connect(userA).cancelTrade(tradeToCancel)
      ).to.be.revertedWith("Only the trade owner can cancel");
      await pixelCup.connect(userB).cancelTrade(tradeToCancel);
      // Fail to cancel the same trade
      await expect(
        pixelCup.connect(userA).cancelTrade(tradeToCancel)
      ).to.be.revertedWith("Trade does not exist");
      const ownerTradesAfterCancel = await pixelCup.ownerTrades(userB.address);
      expect(ownerTradesAfterCancel).to.have.length(1);
      expect(ownerTradesAfterCancel[0].index).to.equal(tradeIndex);

      await expect(
        pixelCup.connect(userA).completeTrade(tradeIndex, stickerReq.number + 1)
      ).to.be.revertedWith("Shirt numbers do not match");

      // Compelte trade
      await pixelCup
        .connect(userA)
        .completeTrade(tradeIndex, stickerReq.number);
      expect(await pixelCup.ownerTrades(userB.address)).to.have.length(0);
      // Fail to complete the same trade
      await expect(
        pixelCup.connect(userA).completeTrade(tradeIndex, stickerReq.number)
      ).to.be.revertedWith("Trade does not exist");
    });
  });

  describe("Claim prize", () => {
    async function completeAlbum(user) {
      const album = {};
      for (c = 1; c <= totalCountries; c++) {
        for (t = 1; t <= totalTypes; t++) {
          album[`${c}${t}`] = false;
        }
      }
      function albumCompleted(address) {
        return Object.keys(album).filter((k) => !album[k]).length === 0;
      }
      while (!albumCompleted(user.address)) {
        const packsToMint = 1;
        await pixelCup.mintPacks(user.address, packsToMint, {
          value: packPrice.mul(packsToMint),
        });
        const tx = await pixelCup.connect(user).openPacks(packsToMint);
        const { events } = await tx.wait();
        const packs = events.filter(({ event }) => event === "PackOpened");
        packs.forEach((pack) => {
          const {
            args: { _stickers },
          } = pack;
          _stickers.forEach((sticker) => {
            const props = getStickerProps(sticker);
            album[`${props.country}${props.type}`] = sticker;
          });
        });
      }
      return Object.values(album);
    }

    it("Should fail to claim if not enable", async () => {
      await pixelCup.enableOpenPacks(false);
      const postShirts = [];
      for (c = 0; c < totalCountries; c++) {
        for (t = 0; t < totalTypes; t++) {
          postShirts.push(chance.integer({ min: 1, max: 23 }));
        }
      }
      await expect(
        pixelCup.connect(userA).claimPrize(postShirts)
      ).to.be.revertedWith("This function is not yet enabled!");
      await pixelCup.enableOpenPacks(true);
    });

    it("Should fail to claim without owning all stickers", async () => {
      const postShirts = [];
      for (c = 0; c < totalCountries; c++) {
        for (t = 0; t < totalTypes; t++) {
          postShirts.push(chance.integer({ min: 1, max: 23 }));
        }
      }
      await expect(
        pixelCup.connect(userA).claimPrize(postShirts)
      ).to.be.revertedWith("ERC1155: burn amount exceeds totalSupply");
    });

    it("Should fail to claim with wrong number of stickers", async () => {
      const postShirts = [];
      for (c = 0; c < totalCountries + 1; c++) {
        for (t = 0; t < totalTypes; t++) {
          postShirts.push(chance.integer({ min: 1, max: 23 }));
        }
      }
      await expect(
        pixelCup.connect(userA).claimPrize(postShirts)
      ).to.be.revertedWith("Not the right amount of stickers");
    });

    it("Should allow to claim the prize", async () => {
      const userAalbun = await completeAlbum(userA);
      const stickerBalanceBefore = await pixelCup.balanceOf(userA.address, userAalbun[0]);
      const contractBalanceBeforeClaim = await provider.getBalance(
        pixelCup.address
      );
      const poolBalanceBeforeClaim = await pixelCup.prizePoolBalance();
      const userBalanceBeforeClaim = await ethers.provider.getBalance(
        userA.address
      );
      const tx = await pixelCup
        .connect(userA)
        .claimPrize(userAalbun.map((s) => getStickerProps(s).number));
      // Event
      const { events, gasUsed, effectiveGasPrice } = await tx.wait();
      const gasFee = gasUsed.mul(effectiveGasPrice);
      const winnerEvent = events.find(({ event }) => event === "NewWinner");
      expect(winnerEvent.args._owner).to.equal(userA.address);
      expect(winnerEvent.args._stickers).to.have.deep.members(userAalbun);
      
      // Check that we burn the stickers
      expect(await pixelCup.balanceOf(userA.address, userAalbun[0])).to.equal(stickerBalanceBefore.sub(1));

      // Check sum contract balance
      const userBalanceAfterClaim = await ethers.provider.getBalance(
        userA.address
      );
      const userWinnedPrize = userBalanceAfterClaim
        .sub(userBalanceBeforeClaim)
        .add(gasFee);
      const contractBalanceAfterClaim = await provider.getBalance(
        pixelCup.address
      );
      const ownerBalance = await pixelCup.ownerBalance();
      const poolBalanceAfterClaim = await pixelCup.prizePoolBalance();

      expect(winnerEvent.args._prize).to.equal(userWinnedPrize);
      expect(contractBalanceBeforeClaim.div(2)).to.equal(ownerBalance);
      expect(poolBalanceBeforeClaim.div(2)).to.equal(userWinnedPrize);
      expect(poolBalanceBeforeClaim.div(2)).to.equal(poolBalanceAfterClaim);

      // Winner stats
      expect(await pixelCup.winnersRemaining()).to.equal(maxWinners - 1);

      // Cant wint again with same stickers
      await expect(
        pixelCup
          .connect(userA)
          .claimPrize(userAalbun.map((s) => getStickerProps(s).number))
      ).to.be.revertedWith("ERC1155: burn amount exceeds totalSupply");
    });

    it("All pool prize to last winner", async () => {
      const userBalbum = await completeAlbum(userB);
      await pixelCup
        .connect(userB)
        .claimPrize(userBalbum.map((s) => getStickerProps(s).number));

      const userCalbum = await completeAlbum(userC);
      const poolBalanceBeforeClaim = await pixelCup.prizePoolBalance();
      const userBalanceBeforeClaim = await ethers.provider.getBalance(
        userC.address
      );
      const tx = await pixelCup
        .connect(userC)
        .claimPrize(userCalbum.map((s) => getStickerProps(s).number));
      const { events, gasUsed, effectiveGasPrice } = await tx.wait();
      const gasFee = gasUsed.mul(effectiveGasPrice);
      const winnerEvent = events.find(({ event }) => event === "NewWinner");
      const userBalanceAfterClaim = await ethers.provider.getBalance(
        userC.address
      );
      const userWinnedPrize = userBalanceAfterClaim
        .sub(userBalanceBeforeClaim)
        .add(gasFee);
      const poolBalanceAfterClaim = await pixelCup.prizePoolBalance();

      expect(winnerEvent.args._prize).to.equal(userWinnedPrize);
      expect(userWinnedPrize).to.equal(poolBalanceBeforeClaim);
      expect(poolBalanceAfterClaim).to.equal(0);
    });

    it("Should only allow maxWinners", async () => {
      const postShirts = [];
      for (c = 0; c < totalCountries; c++) {
        for (t = 0; t < totalTypes; t++) {
          postShirts.push(chance.integer({ min: 1, max: 23 }));
        }
      }
      await expect(
        pixelCup.connect(userD).claimPrize(postShirts)
      ).to.be.revertedWith("No more winners");
    });
  });
  describe("Founder balance", () => {
    it("Shoould not allow a non owner to withdraw", async () =>
      expect(pixelCup.connect(userA).withdraw()).to.be.revertedWith(
        "Ownable: caller is not the owner"
      ));

    it("Should allow to withdraw the founder balance", async () => {
      const userBalanceBefore = await ethers.provider.getBalance(owner.address);
      const ownerBalanceBefore = await pixelCup.ownerBalance();
      const tx = await pixelCup.connect(owner).withdraw();
      const { gasUsed, effectiveGasPrice } = await tx.wait();
      const userBalanceAfter = await ethers.provider.getBalance(owner.address);
      const ownerBalanceAfter = await pixelCup.ownerBalance();
      const gasFee = gasUsed.mul(effectiveGasPrice);
      const withdrawAmount = userBalanceAfter
        .sub(userBalanceBefore)
        .add(gasFee);

      expect(withdrawAmount).to.equal(ownerBalanceBefore);
      expect(ownerBalanceAfter).to.equal(0);
    });

    it("Shoould fail to withdraw if there is no balance", async () =>
      expect(pixelCup.connect(owner).withdraw()).to.be.revertedWith(
        "No owner balance"
      ));

    it("Should increase the founder balance once all winners claimed the prize", async () => {
      const packsToMint = 5;
      const ownerBalanceBefore = await pixelCup.ownerBalance();
      await pixelCup.mintPacks(userD.address, packsToMint, {
        value: packPrice.mul(packsToMint),
      });
      const ownerBalanceAfter = await pixelCup.ownerBalance();
      const poolBalanceAfter = await pixelCup.prizePoolBalance();

      expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.equal(
        packPrice.mul(packsToMint)
      );
      expect(poolBalanceAfter).to.equal(0);
    });
  });
});
