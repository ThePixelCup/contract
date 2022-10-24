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
    event NewWinner(
        address indexed _owner,
        uint256 _prize,
        uint256[] _stickers
    );

    // Constants
    uint256 public constant SALES_TO_POOL_PERCENTAGE = 50;
    uint256 public constant PACK_TOKEN_ID = 1;
    uint256 public constant TOTAL_TYPES = 3;

    // Prize Pool
    uint256 public prizePoolBalance;
    uint256 public ownerBalance;

    // Packs
    uint256 public totalPacks;
    uint256 public stickersPerPack;
    uint256 public packPrice;
    uint256 public mintedPacks = 0;
    bool private _opePacksEnabled = false;

    // Stickers
    struct Sticker {
        uint256 id;
        uint256 amount;
    }
    Sticker[] private _stickers;
    uint256 public totalCountries;

    // Random index assignment
    uint256 internal nonce = 0;

    // Trades
    struct Trade {
        address owner;
        uint256 offerId;
        uint256 reqCountry;
        uint256 reqType;
        uint256 reqNumber;
        uint256 index;
    }

    // ANDRE: por que usas array en vez de mapping? me parece mejor - address -> tokenId --> Trade o algo con el shirtnumber
    Trade[] private _trades;

    // Winners
    uint256 public maxWinners;
    mapping(address => bool) public winners;
    Counters.Counter private _numWinners;

    modifier onlyEoa() {
        require(tx.origin == msg.sender, "Not EOA");
        _;
    }

    /*╔═════════════════════════════╗
      ║         Constructor         ║
      ╚═════════════════════════════╝*/

    constructor(
        string memory baseURI,
        uint256 setTotalPacks,
        uint256 packsToMint,
        uint256 setStickersPerPack,
        uint256 setMaxWinners,
        uint256 setTotalCountries,
        uint256 setInitialPackPrice
    ) ERC1155(baseURI) {
        // Set contract variables
        totalPacks = setTotalPacks;
        stickersPerPack = setStickersPerPack;
        maxWinners = setMaxWinners;
        totalCountries = setTotalCountries;
        packPrice = setInitialPackPrice;

        // Mint marketing packs
        _mint(msg.sender, PACK_TOKEN_ID, packsToMint, "");
        mintedPacks = packsToMint;
    }

    /*╔═════════════════════════════╗
      ║           Counters          ║
      ╚═════════════════════════════╝*/

    // ANDRE
    // Esto es stickers remaining o total stickers?
    // No entiendo bien esto
    // Esta funcion se usa en el random, porque tiene que saber cuantos quedan para sacar un numero del 1 a eso
    // Yo le agregaria un campo de minted o remaining al objeto sticker
    function stickersRemaining() public view returns (uint256) {
        uint256 acc = 0;
        for (uint256 s = 0; s < _stickers.length; s++) {
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
        return maxWinners - numberOfWinners();
    }

    function packBalance(address owner) public view returns (uint256) {
        return balanceOf(owner, PACK_TOKEN_ID);
    }

    /*╔═════════════════════════════╗
      ║           Trade             ║
      ╚═════════════════════════════╝*/

    function startTrade(
        uint256 offerId,
        uint256 reqCountry,
        uint256 reqType,
        uint256 reqNumber
    ) external returns (uint256) {
        require(offerId != PACK_TOKEN_ID, "Can not trade packs");
        require(
            reqCountry > 0 && reqCountry <= totalCountries,
            "Invalid country"
        );
        require(reqType > 0 && reqType <= TOTAL_TYPES, "Invalid type");

        // Transfer the sticker to the contract for escrow
        // This will check that the offer sticker is valid and the owner has balance
        safeTransferFrom(msg.sender, address(this), offerId, 1, "");
        // Add to the trades table

        _trades.push(
            Trade(
                msg.sender,
                offerId,
                reqCountry,
                reqType,
                reqNumber,
                _trades.length
            )
        );
        return _trades.length - 1;
    }

    function completeTrade(uint256 tradeIndex, uint256 shirtNumber) external {
        // ANDRE: aca si es un mapping es mas facil encontrarlo, no necesitas el index, vas con el tokenId y address
        Trade storage trade = _trades[tradeIndex];
        if (trade.reqNumber > 0) {
            require(
                trade.reqNumber == shirtNumber,
                "Shirt numbers do not match"
            );
        }
        // Generate the tokenId to complete the trade
        uint256 tokenId = trade.reqCountry *
            1000 +
            trade.reqType *
            100 +
            shirtNumber;

        // ANDRE: funciono esto sin un approve antes?

        // Trade owner receives the token, will fail if there is no balance or invalid
        safeTransferFrom(msg.sender, trade.owner, tokenId, 1, "");

        // Send the sticker hold on escrow
        IERC1155(address(this)).safeTransferFrom(
            address(this),
            msg.sender,
            trade.offerId,
            1,
            ""
        );
        delete _trades[tradeIndex];
    }

    function tradeDetails(uint256 tradeIndex)
        public
        view
        returns (Trade memory)
    {
        Trade storage trade = _trades[tradeIndex];
        return trade;
    }

    function totalTrades() public view returns (uint256) {
        return _trades.length;
    }

    function totalActiveTrades(address owner) public view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < _trades.length; i++) {
            if (_trades[i].owner == owner) {
                count++;
            }
        }
        return count;
    }

    function ownerTrades(address owner) public view returns (Trade[] memory) {
        // There is no way to avoid two loops to return a dynamic array
        uint256 activeTrades = totalActiveTrades(owner);
        Trade[] memory values = new Trade[](activeTrades);
        uint256 valuesIndex = 0;
        for (uint256 i = 0; i < _trades.length; i++) {
            if (_trades[i].owner == owner) {
                Trade storage trade = _trades[i];
                values[valuesIndex] = trade;
                valuesIndex++;
            }
        }

        return values;
    }

    function cancelTrade(uint256 tradeIndex) external {
        Trade memory trade = _trades[tradeIndex];
        require(trade.owner == msg.sender, "Only the trade owner can cancel");
        // Return the sticker to the owner
        IERC1155(address(this)).safeTransferFrom(
            address(this),
            msg.sender,
            trade.offerId,
            1,
            ""
        );
        delete _trades[tradeIndex];
    }

    /*╔═════════════════════════════╗
      ║            Mint             ║
      ╚═════════════════════════════╝*/

    function mintPacks(address to, uint256 amount)
        external
        payable
        nonReentrant
    {
        require((mintedPacks + amount) < totalPacks, "Not enough packs left");
        require(msg.value >= packPrice * amount, "Insufficient funds");

        _mint(to, PACK_TOKEN_ID, amount, "");
        mintedPacks += amount;

        if (winnersRemaining() > 0) {
            // Update balances
            ownerBalance +=
                (msg.value * (100 - SALES_TO_POOL_PERCENTAGE)) /
                100;
            prizePoolBalance += (msg.value * SALES_TO_POOL_PERCENTAGE) / 100;
        } else {
            // If there are no more possible winners and somehow we still have
            // packs left, the revenue goes to the team for future proyects
            ownerBalance += msg.value;
        }
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
        for (uint256 s = 0; s < _stickers.length; s++) {
            acc += _stickers[s].amount;
            if (randomIndex <= acc) {
                stickerIndex = s;
                break;
            }
        }
        return stickerIndex;
    }

    function openPacks(uint256 amount)
        external
        nonReentrant
        onlyEoa
        returns (uint256[] memory)
    {
        require(_opePacksEnabled == true, "This function is not yet enabled!");

        _burn(msg.sender, PACK_TOKEN_ID, amount);

        uint256[] memory totalOpenedPacks = new uint256[](
            amount * stickersPerPack
        );
        for (uint256 i = 0; i < amount; i++) {
            uint256[] memory packStickers = new uint256[](stickersPerPack);
            for (uint256 j = 0; j < stickersPerPack; j++) {
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
                totalOpenedPacks[i * stickersPerPack + j] = stickerId;
            }
            emit PackOpened(msg.sender, packStickers);
        }
        return totalOpenedPacks;
    }

    /*╔═════════════════════════════╗
      ║      Complete collection    ║
      ╚═════════════════════════════╝*/

    // shirtNumbersProposed has to be in ascending order
    function claimPrize(uint256[] calldata shirtNumbersProposed)
        external
        nonReentrant
    {
        require(
            shirtNumbersProposed.length == (totalCountries * TOTAL_TYPES),
            "Not the right amount of stickers"
        );
        // ANDRE: Mejor directo sin el true
        // require(_opePacksEnabled, "This function is not yet enabled!");
        require(_opePacksEnabled == true, "This function is not yet enabled!");
        require(winnersRemaining() > 0, "No more winners");

        uint256 shirtNumberIndex;
        uint256[] memory stickersToBurn = new uint256[](
            shirtNumbersProposed.length
        );

        for (uint256 i = 0; i < totalCountries; i++) {
            uint256 countryId = i + 1;
            for (uint256 j = 0; j < TOTAL_TYPES; j++) {
                uint256 typeId = j + 1;

                // Generate the correspondent stickerId with the proposed shirtnumber
                uint256 tokenId = countryId *
                    1000 +
                    typeId *
                    100 +
                    shirtNumbersProposed[shirtNumberIndex];

                // Check ownership & Burn token Id
                _burn(msg.sender, tokenId, 1);
                stickersToBurn[shirtNumberIndex] = tokenId;
                shirtNumberIndex += 1;
            }
        }

        uint256 prizeAmount;
        if (winnersRemaining() == 1) {
            // Send remaining balance to last possible winner
            prizeAmount = prizePoolBalance;
        } else {
            prizeAmount = prizePoolBalance / 2;
        }
        // Send prize
        payable(msg.sender).transfer(prizeAmount);
        prizePoolBalance -= prizeAmount;

        _numWinners.increment();
        emit NewWinner(msg.sender, prizeAmount, stickersToBurn);
    }

    /*╔═════════════════════════════╗
      ║           Owner             ║
      ╚═════════════════════════════╝*/

    function registerStickers(
        uint256[] memory countryIds,
        uint256[] memory typeIds,
        uint256[] memory shirtNumbers,
        uint256[] memory amounts
    ) external onlyOwner {
        require(
            countryIds.length == typeIds.length &&
                typeIds.length == shirtNumbers.length &&
                shirtNumbers.length == amounts.length,
            "All arrays should hae same length"
        );
        for (uint256 i; i < countryIds.length; i++) {
            uint256 tokenId = countryIds[i] *
                1000 +
                typeIds[i] *
                100 +
                shirtNumbers[i];
            _stickers.push(Sticker(tokenId, amounts[i]));
        }
    }

    function setPackPrice(uint256 value) external onlyOwner {
        packPrice = value;
    }

    // ANDRE: A mi me gusta mas una funcion enable y otra disable para que no se confunda
    function enableOpenPacks(bool enable) external onlyOwner {
        _opePacksEnabled = enable;
    }

    /*╔═════════════════════════════╗
      ║      Withdraw Functions     ║
      ╚═════════════════════════════╝*/

    function withdraw() external onlyOwner nonReentrant {
        require(ownerBalance > 0, "No owner balance");

        payable(msg.sender).transfer(ownerBalance);
        ownerBalance = 0;
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

    function onERC1155Received(
        address,
        address,
        uint256,
        uint256,
        bytes memory
    ) public virtual returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] memory,
        uint256[] memory,
        bytes memory
    ) public virtual returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) public virtual returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
