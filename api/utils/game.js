import {nanoid} from "nanoid";

export const CardLabels = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "Jack", "Queen", "King", "Ace"];
export const CardSuits = ['♡', '♢', '♣', '♤'];

/**
 * Generates a whole card deck for use in the format of a list. Each
 * element follows the format of '<label> of <suit>'.
 * */
export function generateCardDeck() {
    return CardLabels.map((label) => {
        return CardSuits.map((suit) => {
            return `${label} of ${suit}`;
        })
    }).flat();
}


/**
 * Simple function to split the card string into it's 'numerical'
 * value and it's 'suite' value.
 *
 * @param {String} card String representing card which is to be parsed.
 * @return {Array<String>} The numerical and suite component of the card.
 * */
export function parseCard(card) {
    return card.split(" of ")
}

/**
 * Shuffle the deck using
 * */
export function shuffleDeck(deck) {
    let currentIndex = deck.length, temp, randomIndex;

    while (0 !== currentIndex) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temp = deck[currentIndex];
        deck[currentIndex] = deck[randomIndex];
        deck[randomIndex] = temp;
    }

    return deck;
}

export class Game {
    static DECK_SIZE = 6;

    constructor(id, players, history) {
        this.history = {};
        this.players = {};

        /**
         * This is the deck that's currently placed on the table. It's easier to work
         * with a Key-Value structure. The keys signify cards that are opposing the
         * defending player, and the values are the cards that the defending player
         * sets to defend against the card. */
        this.tableTop = {};

        // generate card deck and shuffle it for the game
        this.deck = generateCardDeck();
        shuffleDeck(this.deck);

        // perform an 'id' check to see if there is a entry within MongoDB

        // Check if the players argument follows the specified constraints.
        if (!Number.isInteger(players) && players < 0) {
            throw new Error("Number of players must be a positive integer.");
        } else if (players > 8) {
            throw new Error("Number of players cannot be greater than eight.");
        } else {
            // set the game up for the 'players' number.
            for (let index = 0; index < players; index++) {
                const id = nanoid();

                this.players[id] = {
                    deck: [],
                    startsFirst: false,
                    defending: false,
                }
            }
        }

        // distribute the cards between the players as if in a physical way
        for (let index = 0; index < Game.DECK_SIZE; index++) {
            Object.keys(this.players).forEach((id) => {
                this.players[id].deck.push(this.deck.shift());
            });
        }

        // Select the first remaining card and set the 'suite' of the game and then
        // shift the first element to the end of the stack.
        this.trumpSuite = parseCard(this.deck[0])[1];

        this.deck.push(this.deck.shift());

        // Setup the initial state of the game if it hasn't been created yet.
    }

    /**
     * @version 1.0.0
     * This function is used to add a card from the attacking player, or any
     * attacking player. The function will do some basic logic checking on the
     * conditions that should be passed for the card to be added. There are three
     * basic requirements for the card to be added:
     *
     * 1. The defending player must have the the same or greater number of cards
     *    than the cards that aren't covered in the tableTop.
     *
     * 2. There can only be a maximum of 6 cards in a table top
     *
     * 3. The card to be added into the pile must have the same numerical value
     *    as some card on the table top.
     *
     * If these conditions pass, the card is added onto the table top and a history
     * node is added to the game history. The card is also taken from the player
     * that adds the card.
     *
     * @param {String} from - The id of the player that's taking the card.
     * @param {String} card - The card that's being added to the table top.
     * */
    addCardToTableTop(from, card) {
        // check if the deck is already filled up.
        if (!(Object.keys(this.tableTop).length < 6)) {
            throw new Error("Player deck already full.");
        }

        const player = this.players[from];

        // check if the id is valid
        if (typeof player === 'undefined') {
            throw new Error("Player doesn't exist.");
        }

        // check that the defending play is able to cover the table top cards.
        const coveredCards = Object.values(this.tableTop).reduce((item) => item !== null).length;

        if (Object.keys(this.tableTop).length - coveredCards + 1 > player.deck.length) {
            throw new Error("Player doesn't have enough cards to cover attack.");
        }

        const [cardLabel, cardSuite] = parseCard(card);

        // check if the card is valid
        if (!CardLabels.includes(cardLabel) || !CardSuits.includes(cardSuite)) {
            throw new Error("Invalid card");
        }

        // Now check the presence of the given card, in the players deck.
        if (!player.deck.includes(card)) {
            throw new Error("Player doesn't hold current card");
        }

        // Also check that the current card is allowed to be added to the deck. To determine this,
        // the cardLabel of the card to be added must be present on the tableTop.
        if (!this.getTableTopDeck().map(item => parseCard(item)[0]).includes(cardLabel)) {
            throw new Error("Card numerical value isn't present on the table top.");
        }

        // TODO: add this transaction as a history node.
        // finally, if everything passes then add the card to the table top from the players
        // deck.
        this.tableTop[card] = null;
        player.deck = player.deck.reduce((item) => item !== card);
    }

    coverCardOnTableTop(card, coveringCard) {}

    getTableTopDeck() {
        return Object.entries(this.tableTop).flat();
    }

    addHistoryNode() {
    }

    moveTableTopTo(to) {
    }

    /**
     * This function will void all the cards that are currently on the table top
     * because it is the end of the round, and the defending player successfully
     * defended themselves against the attackers.
     * */
    voidTableTop() {
    }

    serialize() {}
}
