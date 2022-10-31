const { expect } = require('chai');

describe('Edge cases', () => {
  describe('Make sure we use all stickers', () => {
    let totalPacks = 9,
      stickersPerPack = 4,
      maxWinners = 1,
      totalCountries = 4,
      totalTypes = 3,
      marketingPacks = 0,
      packPrice = ethers.utils.parseEther('0.01');

    let pixelCup, owner, user, userAstickers = [], userBstickers = [];

    it('Should deploy the contract', async () => {
      ([owner, user] = await ethers.getSigners());
      const baseUri = 'ipfs://QmUGSCB1ZKxNtqB2atogJYgoYoAq7qXM81kH45esbBkZSe';
      const contractUri = 'ipfs://QmUGYgoYoAq7qXM81kH45esbBkZSeSCB1ZKxNtqB2atogJ';
      const Contract = await ethers.getContractFactory("PixelCup");
      pixelCup = await Contract.deploy(
        baseUri,
        contractUri,
        totalPacks,
        marketingPacks,
        stickersPerPack,
        maxWinners,
        totalCountries,
        packPrice
      );
      
      // Contract conf
      expect(await pixelCup.totalPacks()).to.equal(totalPacks);
      expect(await pixelCup.stickersPerPack()).to.equal(stickersPerPack);
      expect(await pixelCup.maxWinners()).to.equal(maxWinners);
      expect(await pixelCup.totalCountries()).to.equal(totalCountries);
      expect(await pixelCup.packPrice()).to.equal(packPrice);

      // Pack allocation
      expect(await pixelCup.packBalance(owner.address)).to.equal(marketingPacks);
      expect(await pixelCup.mintedPacks()).to.equal(marketingPacks);

      // Token Uri
      expect(await pixelCup.uri(1)).to.equal(baseUri);
      
      // Contract Uri for OpenSea
      expect(await pixelCup.contractURI()).to.equal(contractUri);
    });

    it('Should register stickers', async () => {
      const countryIds = [];
      const typeIds = [];
      const shirtNumbers = [];
      const amounts = [];
      for (let c = 1; c <= totalCountries; c++) {
        for (let t = 1; t <= totalTypes; t++) {
          for (let n = 1; n <= 3; n++) {
            countryIds.push(c);
            typeIds.push(t);
            shirtNumbers.push(n);
            amounts.push(1);
          } 
        }
      }
      const totalAmount = amounts.reduce((p, a) => p + a, 0);
      const step = stickersPerPack;

      // Do it in batches as it will be in mainnet
      for (let j = step; j <= (amounts.length + step); j+=step) {
        await pixelCup.registerStickers(
          countryIds.slice(j - step, j),
          typeIds.slice(j - step, j),
          shirtNumbers.slice(j - step, j),
          amounts.slice(j - step, j)
        );
      }

      expect(await pixelCup.stickersRemaining()).to.equal(totalAmount);
      expect(await pixelCup.registeredStickers()).to.equal(amounts.length);
    });
    
    it('Should open all packs', async () => {
      await pixelCup.enableOpenPacks(true);
      const totalStickers = await pixelCup.stickersRemaining();

      const packsToMint = totalPacks;
      await pixelCup.mintPacks(user.address, packsToMint, {
        value: packPrice.mul(packsToMint),
      });
      const tx = await pixelCup.connect(user).openPacks(packsToMint);
      const { events } = await tx.wait();
      const packsOpened = events.filter(({event}) => event === 'PackOpened');
      expect(packsOpened.length).to.equal(packsToMint)
      const userStickers = [];
      packsOpened.forEach((pack) => {
        const { args: { _stickers } } = pack
        userStickers.push(..._stickers);
      });
      expect(await pixelCup.stickersRemaining()).to.equal(0);
      expect(userStickers.length).to.equal(totalStickers);
      expect(await pixelCup.mintedPacks()).to.equal(packsToMint);

      await expect(pixelCup.connect(user).mintPacks(user.address, 1, {
        value: packPrice.mul(1),
      })).to.be.revertedWith('Not enough packs left');

      await expect(pixelCup.connect(user).openPacks(1)).to.be
        .revertedWith('ERC1155: burn amount exceeds totalSupply');
    })
  });
});