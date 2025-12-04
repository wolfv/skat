// Skat Game Logic Module
// Pure game logic separate from networking and UI

const SUITS = ['clubs', 'spades', 'hearts', 'diamonds'];
const SUIT_SYMBOLS = { clubs: '♣', spades: '♠', hearts: '♥', diamonds: '♦' };
const SUIT_NAMES = { clubs: 'Kreuz', spades: 'Pik', hearts: 'Herz', diamonds: 'Karo' };
const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_NAMES = { '7': '7', '8': '8', '9': '9', '10': '10', 'J': 'Bube', 'Q': 'Dame', 'K': 'König', 'A': 'Ass' };
const CARD_VALUES = { 'A': 11, '10': 10, 'K': 4, 'Q': 3, 'J': 2, '9': 0, '8': 0, '7': 0 };
const BID_VALUES = [18, 20, 22, 23, 24, 27, 30, 33, 35, 36, 40, 44, 45, 46, 48, 50, 54, 55, 59, 60, 63, 66, 70, 72, 77, 80, 81, 84, 88, 90, 96, 99, 100, 108, 110, 117, 120, 121, 126, 130, 132, 135, 140, 143, 144, 150, 153, 154, 156, 160, 162, 165, 168, 170, 176, 180, 187, 192, 198, 204, 216, 240, 264];

class SkatGame {
    constructor() {
        this.phase = 'lobby'; // lobby, bidding, skat, playing, finished
        this.players = [];
        this.myIndex = 0;
        this.dealer = 0;
        this.hands = [[], [], []];
        this.skat = [];
        this.trick = [];
        this.trickStarter = 0;
        this.currentPlayer = 0;
        this.declarer = -1;
        this.gameType = null;
        this.biddingState = null;
        this.tricks = [[], [], []];
        this.scores = [0, 0, 0];

        this.onPhaseChange = null;
        this.onGameStateUpdate = null;
    }

    initializeRound(dealer = 0) {
        this.phase = 'bidding';
        this.dealer = dealer;
        this.currentPlayer = 0;
        this.declarer = -1;
        this.gameType = null;
        this.trick = [];
        this.skat = [];
        this.tricks = [[], [], []];

        this.dealCards();
        this.initBidding();
    }

    dealCards() {
        let deck = [];
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push({ suit, rank });
            }
        }

        // Fisher-Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        this.hands = [[], [], []];
        let cardIndex = 0;

        // 3-skat-4-3 pattern
        for (let p = 0; p < 3; p++) {
            for (let i = 0; i < 3; i++) {
                this.hands[(this.dealer + 1 + p) % 3].push(deck[cardIndex++]);
            }
        }

        this.skat = [deck[cardIndex++], deck[cardIndex++]];

        for (let p = 0; p < 3; p++) {
            for (let i = 0; i < 4; i++) {
                this.hands[(this.dealer + 1 + p) % 3].push(deck[cardIndex++]);
            }
        }

        for (let p = 0; p < 3; p++) {
            for (let i = 0; i < 3; i++) {
                this.hands[(this.dealer + 1 + p) % 3].push(deck[cardIndex++]);
            }
        }

        this.hands.forEach(hand => this.sortHand(hand));
    }

    sortHand(hand) {
        const suitOrder = { clubs: 0, spades: 1, hearts: 2, diamonds: 3 };
        const rankOrder = { 'A': 0, '10': 1, 'K': 2, 'Q': 3, 'J': 4, '9': 5, '8': 6, '7': 7 };

        hand.sort((a, b) => {
            if (a.rank === 'J' && b.rank !== 'J') return -1;
            if (b.rank === 'J' && a.rank !== 'J') return 1;
            if (a.rank === 'J' && b.rank === 'J') {
                return suitOrder[a.suit] - suitOrder[b.suit];
            }

            if (suitOrder[a.suit] !== suitOrder[b.suit]) {
                return suitOrder[a.suit] - suitOrder[b.suit];
            }

            return rankOrder[a.rank] - rankOrder[b.rank];
        });
    }

    initBidding() {
        const d = this.dealer;
        this.biddingState = {
            currentBid: 18,
            bidIndex: 0,
            forehand: (d + 1) % 3,
            middlehand: (d + 2) % 3,
            rearhand: d,
            passed: [false, false, false],
            phase: 'middle-fore',
            currentBidder: (d + 2) % 3,
            responder: (d + 1) % 3
        };
        this.currentPlayer = this.biddingState.currentBidder;
    }

    placeBid(playerIndex) {
        if (this.phase !== 'bidding') return false;
        if (this.currentPlayer !== playerIndex) return false;

        const bs = this.biddingState;

        if (this.currentPlayer === bs.responder) {
            this.currentPlayer = bs.currentBidder;
            if (bs.bidIndex < BID_VALUES.length - 1) {
                bs.bidIndex++;
                bs.currentBid = BID_VALUES[bs.bidIndex];
            }
        } else {
            this.currentPlayer = bs.responder;
        }

        return true;
    }

    passBid(playerIndex) {
        if (this.phase !== 'bidding') return false;
        if (this.currentPlayer !== playerIndex) return false;

        const bs = this.biddingState;
        const passer = this.currentPlayer;
        bs.passed[passer] = true;

        if (bs.phase === 'middle-fore') {
            if (passer === bs.middlehand) {
                bs.phase = 'rear-fore';
                bs.currentBidder = bs.rearhand;
                bs.responder = bs.forehand;
                this.currentPlayer = bs.rearhand;
            } else {
                bs.phase = 'rear-middle';
                bs.responder = bs.middlehand;
                bs.currentBidder = bs.rearhand;
                this.currentPlayer = bs.rearhand;
            }
        } else if (bs.phase === 'rear-fore' || bs.phase === 'rear-middle') {
            if (passer === bs.rearhand) {
                const winner = bs.responder;
                if (bs.passed[winner]) {
                    return false; // Everyone passed
                }
                this.finishBidding(winner);
            } else {
                this.finishBidding(bs.rearhand);
            }
        }

        return true;
    }

    finishBidding(winner) {
        this.declarer = winner;
        this.phase = 'skat';
    }

    pickUpSkat(playerIndex) {
        if (this.phase !== 'skat') return false;
        if (this.declarer !== playerIndex) return false;

        this.hands[playerIndex].push(...this.skat);
        this.sortHand(this.hands[playerIndex]);
        this.skat = [];

        return true;
    }

    pushCard(playerIndex, card) {
        if (this.phase !== 'skat') return false;
        if (this.declarer !== playerIndex) return false;
        if (this.skat.length >= 2) return false;

        const hand = this.hands[playerIndex];
        const idx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        if (idx === -1) return false;

        this.skat.push(hand.splice(idx, 1)[0]);
        return this.skat.length === 2;
    }

    selectGameType(playerIndex, gameType) {
        if (this.phase !== 'skat') return false;
        if (this.declarer !== playerIndex) return false;

        this.gameType = gameType;
        this.phase = 'playing';
        this.trickStarter = (this.dealer + 1) % 3;
        this.currentPlayer = this.trickStarter;
        this.trick = [];

        return true;
    }

    playCard(playerIndex, card) {
        if (this.phase !== 'playing') return false;
        if (this.currentPlayer !== playerIndex) return false;

        const hand = this.hands[playerIndex];
        const playable = this.getPlayableCards(hand);

        if (!playable.some(c => c.suit === card.suit && c.rank === card.rank)) {
            return false;
        }

        const idx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        hand.splice(idx, 1);

        this.trick.push({ card, player: playerIndex });

        if (this.trick.length === 3) {
            this.resolveTrick();
        } else {
            this.currentPlayer = (this.currentPlayer + 1) % 3;
        }

        return true;
    }

    resolveTrick() {
        const winner = this.determineTrickWinner();
        const points = this.trick.reduce((sum, t) => sum + CARD_VALUES[t.card.rank], 0);

        this.tricks[winner].push(...this.trick.map(t => t.card));

        this.trick = [];
        this.trickStarter = winner;
        this.currentPlayer = winner;

        if (this.hands.every(h => h.length === 0)) {
            this.endRound();
        }
    }

    endRound() {
        this.phase = 'finished';

        const declarerPoints = this.tricks[this.declarer].reduce(
            (sum, card) => sum + CARD_VALUES[card.rank], 0
        );

        const skatPoints = this.skat.reduce((sum, card) => sum + CARD_VALUES[card.rank], 0);
        const totalPoints = declarerPoints + skatPoints;

        const gameValue = this.calculateGameValue();
        const won = (this.gameType === 'null')
            ? this.tricks[this.declarer].length === 0
            : totalPoints >= 61;

        const finalScore = won ? gameValue : -2 * gameValue;
        this.scores[this.declarer] += finalScore;

        return {
            declarer: this.declarer,
            gameType: this.gameType,
            points: totalPoints,
            won,
            gameValue,
            finalScore
        };
    }

    calculateGameValue() {
        const baseValues = {
            'diamonds': 9, 'hearts': 10, 'spades': 11, 'clubs': 12,
            'grand': 24, 'null': 23
        };

        if (this.gameType === 'null') {
            return 23;
        }

        const hand = [...this.hands[this.declarer], ...this.skat];
        const hasJack = suit => hand.some(c => c.rank === 'J' && c.suit === suit);

        let matadors = 0;
        const jackOrder = ['clubs', 'spades', 'hearts', 'diamonds'];

        if (hasJack('clubs')) {
            matadors = 1;
            for (let i = 1; i < 4; i++) {
                if (hasJack(jackOrder[i])) matadors++;
                else break;
            }
        } else {
            matadors = 1;
            for (let i = 1; i < 4; i++) {
                if (!hasJack(jackOrder[i])) matadors++;
                else break;
            }
        }

        return baseValues[this.gameType] * (matadors + 1);
    }

    getPlayableCards(hand) {
        if (this.trick.length === 0) {
            return [...hand];
        }

        const leadCard = this.trick[0].card;
        const leadSuit = this.getEffectiveSuit(leadCard);

        const sameSuit = hand.filter(c => this.getEffectiveSuit(c) === leadSuit);
        if (sameSuit.length > 0) return sameSuit;

        return [...hand];
    }

    getEffectiveSuit(card) {
        if (this.gameType === 'null') {
            return card.suit;
        }

        if (card.rank === 'J') {
            return 'trump';
        }

        if (this.gameType === 'grand') {
            return card.suit;
        }

        if (card.suit === this.gameType) {
            return 'trump';
        }

        return card.suit;
    }

    determineTrickWinner() {
        const leadSuit = this.getEffectiveSuit(this.trick[0].card);

        let winner = 0;
        let winningCard = this.trick[0].card;

        for (let i = 1; i < 3; i++) {
            const card = this.trick[i].card;
            if (this.beats(card, winningCard, leadSuit)) {
                winner = i;
                winningCard = card;
            }
        }

        return this.trick[winner].player;
    }

    beats(card, other, leadSuit) {
        const cardSuit = this.getEffectiveSuit(card);
        const otherSuit = this.getEffectiveSuit(other);

        if (cardSuit === 'trump' && otherSuit !== 'trump') return true;
        if (cardSuit !== 'trump' && otherSuit === 'trump') return false;

        if (cardSuit === 'trump' && otherSuit === 'trump') {
            return this.getTrumpValue(card) > this.getTrumpValue(other);
        }

        if (cardSuit !== leadSuit) return false;
        if (otherSuit !== leadSuit) return true;

        return this.getRankValue(card.rank) > this.getRankValue(other.rank);
    }

    getTrumpValue(card) {
        if (card.rank === 'J') {
            const jackOrder = { clubs: 4, spades: 3, hearts: 2, diamonds: 1 };
            return 100 + jackOrder[card.suit];
        }
        return this.getRankValue(card.rank);
    }

    getRankValue(rank) {
        const order = { 'A': 8, '10': 7, 'K': 6, 'Q': 5, '9': 4, '8': 3, '7': 2, 'J': 1 };
        return order[rank] || 0;
    }

    getState() {
        return {
            phase: this.phase,
            players: this.players,
            myIndex: this.myIndex,
            dealer: this.dealer,
            hands: this.hands,
            skat: this.skat,
            trick: this.trick,
            trickStarter: this.trickStarter,
            currentPlayer: this.currentPlayer,
            declarer: this.declarer,
            gameType: this.gameType,
            biddingState: this.biddingState,
            tricks: this.tricks,
            scores: this.scores
        };
    }

    setState(state) {
        Object.assign(this, state);
    }
}
