// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Burnable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PixelCup is
    Ownable,
    ERC1155Burnable,
    ERC1155Pausable,
    ERC1155Supply,
    ERC1155URIStorage,
    ReentrancyGuard
{
    using Counters for Counters.Counter;

    // Events
    event PackOpened(address indexed _owner, uint256[] _stickers);

    // Prize Pool
    uint256 public constant SALES_TO_POOL_PERCENTAGE = 50;
    uint256 public prizePoolBalance;
    uint256 public ownerBalance;

    // Packs
    uint256 public constant PACK_TOKEN_ID = 1;
    uint256 public constant TOTAL_PACKS = 102;
    uint256 public constant STICKERS_PER_PACK = 4;
    uint256 private _packPrice = 0.01 ether;

    // Stickers
    uint256 public constant TOTAL_COUNTRIES = 6;

    // Random index assignment
    uint256 internal nonce = 0;
    struct Sticker {
        uint256 id;
        uint256 amount;
    }
    Sticker[] public _stickers;

    // Winners
    uint256 public constant MAX_WINNERS = 10;
    mapping(address => bool) public winners;
    Counters.Counter private _numWinners;

    // Que pasa si no llegan al max winners? queda la plata en el contrato hasta que alguien lo haga?
    // Si

    /*╔═════════════════════════════╗
      ║         Constructor         ║
      ╚═════════════════════════════╝*/

    constructor(string memory baseURI) ERC1155("") {
        _setBaseURI(baseURI);
    }

    /*╔═════════════════════════════╗
      ║           Counters          ║
      ╚═════════════════════════════╝*/

    function stickersRemaining() public view returns (uint256) {
        uint256 acc = 0;
        for(uint256 s = 0; s < _stickers.length; s++) {
            acc += _stickers[s].amount;
        }
        return acc;
    }

    function registeredStickers() public view returns (uint256) {
        return _stickers.length;
    }

    function numberOfWinners() public view returns (uint256) {
        return _numWinners.current();
    }

    function winnersRemaining() public view returns (uint256) {
        return MAX_WINNERS - numberOfWinners();
    }

    function packBalance(address owner) public view returns (uint256) {
        return balanceOf(owner, PACK_TOKEN_ID);
    }

    function setPackPrice(uint256 value) external onlyOwner {
        _packPrice = value;
    }

    function packPrice() public view returns (uint256) {
        return _packPrice;
    }

    /*╔═════════════════════════════╗
      ║            Mint             ║
      ╚═════════════════════════════╝*/

    function registerStickers(
        uint256[] memory countryIds,
        uint256[] memory typeIds,
        uint256[] memory shirtNumbers,
        uint256[] memory amounts
    ) external onlyOwner {
        // Check equal lengths
        // Check registeredStickersRemaining > 0
        for (uint256 i; i < countryIds.length; i++) {
            // To check that this combination already exists we must make a mapping(tokenId -> bool)
            uint256 tokenId = countryIds[i] *
                1000 +
                typeIds[i] *
                100 +
                shirtNumbers[i];
            _stickers.push(Sticker(tokenId, amounts[i]));
        }
    }

    function mintPacks(address to, uint256 amount)
        external
        payable
        nonReentrant
    {
        // started sale? no need, when we deploy we can mint packs
        // Require that are still packs on sale
        // max per tx? lets do 10

        // No da vuelto - a mi me parece ok
        require(msg.value >= _packPrice * amount, "Insufficient funds");

        _mint(to, PACK_TOKEN_ID, amount, "");

        // Update balances
        ownerBalance += (msg.value * (100 - SALES_TO_POOL_PERCENTAGE)) / 100;
        prizePoolBalance += (msg.value * SALES_TO_POOL_PERCENTAGE) / 100;
    }

    /*╔═════════════════════════════╗
      ║          Open Pack          ║
      ╚═════════════════════════════╝*/

    function randomStickerIndex() internal view returns (uint256) {
        uint256 totalSize = stickersRemaining(); //408
        uint256 index = uint256(
            keccak256(
                abi.encodePacked(
                    nonce,
                    msg.sender,
                    block.difficulty,
                    block.timestamp
                )
            )
        ) % totalSize;
        // Don't allow a zero index, start counting at 1
        uint256 randomIndex = index + 1;
        uint256 acc = 0;
        uint256 stickerIndex;
        for(uint256 s = 0; s < _stickers.length; s++) {
            acc += _stickers[s].amount;
            if (randomIndex <= acc) {
                stickerIndex = s;
                break;
            }
        }
        return stickerIndex;
    }

    function openPacks(uint256 amount) external nonReentrant {
        // Haya empezado el periodo de apertura? A boolean is enough
        // Solamente EOAs
        // chequear que el amount < totalSupply(packTokenId). creo que el burn maneja eso

        require(
            balanceOf(msg.sender, PACK_TOKEN_ID) >= amount,
            "Does not own as many packs"
        );

        burn(msg.sender, PACK_TOKEN_ID, amount);

        for (uint256 i = 0; i < amount; i++) {
            uint256[] memory packStickers = new uint256[](STICKERS_PER_PACK);
            for (uint256 j = 0; j < STICKERS_PER_PACK; j++) {
                // Get random sticker
                uint256 stickerIndex = randomStickerIndex();
                // Increment the nonce for the random
                nonce++;
                // Reduce amount on sticker
                uint256 stickerId = _stickers[stickerIndex].id;
                _stickers[stickerIndex].amount--;
                // Mint an extra amount of the sticker
                _mint(msg.sender, stickerId, 1, "");
                // For the event
                packStickers[j] = stickerId;
            }
            emit PackOpened(msg.sender, packStickers);
        }
    }

    /*╔═════════════════════════════╗
      ║      Complete collection    ║
      ╚═════════════════════════════╝*/

    // shirtNumbersProposed has to be in ascending order
    function claimPrizeV2(uint256[] calldata shirtNumbersProposed)
        external
        nonReentrant
    {
        // check que length == TOTAL_UNIQUE_STICKERS
        // Check that pool balance > 0
        require(winnersRemaining() > 0, "No more winners");

        uint256 shirtNumberIndex;
        // 32 countrys + 3 types
        for (uint256 i = 0; i < TOTAL_COUNTRIES; i++) {
            uint256 countryId = i + 1;
            for (uint256 j = 0; j < 3; j++) {
                uint256 typeId = j + 1;

                // Generate the correspondent stickerId with the proposed shirtnumber
                uint256 tokenId = countryId *
                    1000 +
                    typeId *
                    100 +
                    shirtNumbersProposed[shirtNumberIndex];

                // Check ownership & Burn token Id
                require(
                    balanceOf(msg.sender, tokenId) >= 1,
                    "Does not own sticker"
                );
                burn(msg.sender, tokenId, 1);

                shirtNumberIndex += 1;
            }
        }

        winners[msg.sender] = true;

        uint256 prizeAmount;
        if (winnersRemaining() == 1) {
            prizeAmount = prizePoolBalance;
        } else {
            prizeAmount = prizePoolBalance / 2;
        }
        payable(msg.sender).transfer(prizeAmount);
        prizePoolBalance -= prizeAmount;
    }

    /*╔═════════════════════════════╗
      ║      Withdraw Functions     ║
      ╚═════════════════════════════╝*/

    function withdraw() external onlyOwner {
        require(ownerBalance > 0, "No owner balance");

        payable(msg.sender).transfer(ownerBalance);
    }

    /*╔═════════════════════════════╗
      ║      Override Functions     ║
      ╚═════════════════════════════╝*/

    function uri(uint256 tokenId)
        public
        view
        virtual
        override(ERC1155, ERC1155URIStorage)
        returns (string memory tokenURI)
    {
        tokenURI = super.uri(tokenId);
    }

    function _beforeTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal virtual override(ERC1155, ERC1155Pausable, ERC1155Supply) {
        super._beforeTokenTransfer(operator, from, to, ids, amounts, data);
    }
}