const { expect } = require('chai');
const Chance = require('chance');
const chance = new Chance();
const provider = hre.ethers.provider;

describe('PixelCup Contract', () => {
  let pixelCup, owner, userA, userB;

  it('Should should deploy contract', async () => {
    ([owner, userA, userB] = await ethers.getSigners());
    const Contract = await ethers.getContractFactory("PixelCup");
    pixelCup = await Contract.deploy('ifps://');
    
    const totalStickers = await pixelCup.TOTAL_PACKS();
    expect(totalStickers).to.equal(102);
  });

  it('Should register stickers', async () => {
    const countryIds = [1,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,3,3,3,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6];
    const typeIds = [3,1,1,1,1,2,2,2,2,3,1,1,1,1,2,2,2,2,3,1,1,1,1,2,2,2,2,3,1,1,1,1,2,2,2,2,3,1,1,1,1,2,2,2,2,3,1,1,1,1,2,2,2,2];
    const shirtNumbers = [1,2,3,4,5,2,3,4,5,1,2,3,4,5,2,3,4,5,1,2,3,4,5,2,3,4,5,1,2,3,4,5,2,3,4,5,1,2,3,4,5,2,3,4,5,1,2,3,4,5,2,3,4,5];
    const amounts = [6,9,4,5,6,8,8,10,5,8,4,5,10,5,11,9,7,8,11,6,7,10,5,8,6,6,8,10,5,5,8,6,8,7,7,10,10,9,7,8,8,7,4,11,8,7,7,9,11,10,7,9,7,8];
    const totalAmount = amounts.reduce((p, a) => p + a, 0);

    await pixelCup.registerStickers(countryIds, typeIds, shirtNumbers, amounts);

    const totalStickers = await pixelCup.stickersRemaining();
    const registeredStickers = await pixelCup.registeredStickers();

    expect(totalStickers).to.equal(totalAmount);
    expect(registeredStickers).to.equal(amounts.length);
  });

  it('Should mint pack(s) on the wallet', async () => {
    const packsToMint = chance.integer({ min: 1, max: 10 });
    const packPrice = await pixelCup.packPrice();
    const totalPrice = ethers.utils.formatEther(packPrice.mul(packsToMint));
    const totalPriceWei = ethers.utils.parseEther(totalPrice.toString());
    await pixelCup.mintPacks(userA.address, packsToMint, {
      value: totalPriceWei,
    });
    
    const packBalance = await pixelCup.packBalance(userA.address);
    expect(packBalance).to.equal(packsToMint, 'Packs to mint');

    const contractBalance = await provider.getBalance(pixelCup.address);
    const poolBalance = await pixelCup.prizePoolBalance();
    const ownerBalance = await pixelCup.ownerBalance();
    expect(contractBalance).be.equal(totalPriceWei, 'Total price to in Wei');
    expect(poolBalance).be.equal(totalPriceWei.div(2), 'Pool balance');
    expect(ownerBalance).be.equal(totalPriceWei.div(2), 'Owner balance');
  });

  it('Should open the pack for stickers', async () => {
    const packsToMint = chance.integer({ min: 1, max: 10 });
    const packPrice = await pixelCup.packPrice();
    const totalPrice = ethers.utils.formatEther(packPrice.mul(packsToMint));
    const totalPriceWei = ethers.utils.parseEther(totalPrice.toString());
    const stickersPerPack = await pixelCup.STICKERS_PER_PACK();

    await pixelCup.mintPacks(userB.address, packsToMint, {
      value: totalPriceWei,
    });
    const totalStickersMinted = packsToMint * stickersPerPack;

    const tx = await pixelCup.connect(userB).openPacks(packsToMint);
    const { events } = await tx.wait()
    // Burn pack
    expect(events[0].args.from).to.equal(userB.address);
    expect(events[0].args.to).to.equal(ethers.constants.AddressZero);
    expect(events[0].args.id).to.equal(1);

    // Sticks minted
    const packsOpened = events.filter(({event}) => event === 'PackOpened');
    expect(packsOpened.length).to.equal(packsToMint)
    let totalMinted = 0;
    packsOpened.forEach((pack) => {
      const { args: { _stickers } } = pack
      totalMinted += _stickers.length;
      expect(_stickers.length).to.equal(stickersPerPack);
    });
    expect(totalMinted).to.equal(totalStickersMinted)
  });

});