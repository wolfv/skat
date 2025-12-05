// Skat UI Module
// Handles all UI rendering and user interactions

class SkatUI {
    constructor(game, session) {
        this.game = game;
        this.session = session;
        this.helpVisible = false;

        // Bind event handlers
        this.onCreateRoom = null;
        this.onJoinRoom = null;
        this.onStartGame = null;
        this.onPlayCard = null;
        this.onBid = null;
        this.onPass = null;
        this.onPickUpSkat = null;
        this.onSelectGame = null;
        this.onPushCard = null;
    }

    showLobby() {
        document.getElementById('lobby').style.display = 'flex';
        document.getElementById('gameContainer').style.display = 'none';
    }

    showGame() {
        document.getElementById('lobby').style.display = 'none';
        document.getElementById('gameContainer').style.display = 'block';
    }

    updatePlayerList(participants) {
        const container = document.getElementById('players');
        container.innerHTML = participants.map((p, i) => `
            <div class="player-item">
                <div class="player-status ${p.connected ? '' : 'waiting'}"></div>
                <span>${p.name}${p.id === this.session.myPeerId ? ' (Du)' : ''}</span>
            </div>
        `).join('');

        const startBtn = document.getElementById('startGameBtn');
        if (this.session.isHost && participants.length >= 3) {
            startBtn.style.display = 'block';
        } else {
            startBtn.style.display = 'none';
        }
    }

    renderHands() {
        const myHand = document.getElementById('myHand');
        const hand = this.game.hands[this.game.myIndex] || [];
        const playable = this.game.phase === 'playing' ? this.game.getPlayableCards(hand) : [];

        myHand.innerHTML = hand.map(card => {
            const isPlayable = playable.some(c => c.suit === card.suit && c.rank === card.rank);
            const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
            return `
                <div class="card ${isRed ? 'red' : ''} ${isPlayable ? 'playable' : ''}"
                     onclick="ui.handleCardClick('${card.suit}', '${card.rank}')">
                    <span class="rank">${card.rank}</span>
                    <span class="suit">${SUIT_SYMBOLS[card.suit]}</span>
                </div>
            `;
        }).join('');

        // Render opponent hands (face down)
        for (let i = 0; i < 3; i++) {
            if (i === this.game.myIndex) continue;

            const handEl = document.getElementById(i === (this.game.myIndex + 1) % 3 ? 'player1Hand' : 'player2Hand');
            const count = this.game.hands[i] ? this.game.hands[i].length : 10;

            handEl.innerHTML = Array(count).fill('<div class="card card-back"></div>').join('');
        }
    }

    renderTrick() {
        const area = document.getElementById('trickArea');

        area.innerHTML = this.game.trick.map((t, i) => {
            const isRed = t.card.suit === 'hearts' || t.card.suit === 'diamonds';
            const offset = (t.player - this.game.trickStarter + 3) % 3;
            return `
                <div class="card trick-card ${isRed ? 'red' : ''}" style="transform: translateX(${(offset - 1) * 40}px)">
                    <span class="rank">${t.card.rank}</span>
                    <span class="suit">${SUIT_SYMBOLS[t.card.suit]}</span>
                </div>
            `;
        }).join('');
    }

    renderSkat() {
        const area = document.getElementById('skatArea');

        if (this.game.phase === 'skat' && this.game.declarer === this.game.myIndex && this.game.skat.length === 2) {
            area.innerHTML = `
                <div style="text-align: center; margin-bottom: 1rem;">
                    <button class="btn btn-primary" onclick="ui.handlePickUpSkat()">Skat aufnehmen</button>
                </div>
            ` + this.game.skat.map(card => {
                const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
                return `
                    <div class="card ${isRed ? 'red' : ''}">
                        <span class="rank">${card.rank}</span>
                        <span class="suit">${SUIT_SYMBOLS[card.suit]}</span>
                    </div>
                `;
            }).join('');
        } else if (this.game.phase === 'skat' || (this.game.phase === 'bidding' && this.game.skat.length === 2)) {
            area.innerHTML = `
                <div class="card card-back"></div>
                <div class="card card-back"></div>
            `;
        } else {
            area.innerHTML = '';
        }
    }

    renderPlayerNames() {
        const positions = [
            { id: 'myPlayerName', pos: 'bottom' },
            { id: 'player1Name', pos: 'top-left' },
            { id: 'player2Name', pos: 'top-right' }
        ];

        for (let offset = 0; offset < 3; offset++) {
            const playerIdx = (this.game.myIndex + offset) % 3;
            const pos = positions[offset];
            const el = document.getElementById(pos.id);
            const player = this.game.players[playerIdx];

            if (!player) continue;

            let classes = 'player-name';
            if (this.game.currentPlayer === playerIdx) classes += ' active';
            if (this.game.dealer === playerIdx) classes += ' dealer';
            if (this.game.declarer === playerIdx) classes += ' declarer';

            el.className = classes;
            el.textContent = player.name + (playerIdx === this.game.myIndex ? ' (Du)' : '');
        }
    }

    renderGame() {
        this.renderHands();
        this.renderTrick();
        this.renderSkat();
        this.renderPlayerNames();
        this.updateScores();

        if (this.game.phase === 'bidding') {
            this.handleBidding();
        } else {
            document.getElementById('biddingPanel').style.display = 'none';
        }
    }

    updateScores() {
        document.getElementById('myScore').textContent = this.game.scores[this.game.myIndex] || 0;
    }

    handleCardClick(suit, rank) {
        const card = { suit, rank };

        if (this.game.phase === 'skat' && this.game.declarer === this.game.myIndex) {
            if (this.game.hands[this.game.myIndex].length > 10) {
                if (this.onPushCard) this.onPushCard(card);
            }
        } else if (this.game.phase === 'playing') {
            if (this.onPlayCard) this.onPlayCard(card);
        }
    }

    handleBidding() {
        const bs = this.game.biddingState;
        const panel = document.getElementById('biddingPanel');

        if (this.game.currentPlayer === this.game.myIndex) {
            panel.style.display = 'block';
            document.getElementById('currentBid').textContent = bs.currentBid;

            if (this.game.currentPlayer === bs.responder) {
                document.getElementById('biddingInfo').textContent =
                    `${this.game.players[bs.currentBidder].name} sagt ${bs.currentBid}. Hältst du?`;
            } else {
                document.getElementById('biddingInfo').textContent =
                    `Dein Gebot: ${bs.currentBid}?`;
            }
        } else {
            panel.style.display = 'none';
        }
    }

    handlePickUpSkat() {
        if (this.onPickUpSkat) this.onPickUpSkat();
    }

    showGameSelection() {
        if (this.game.declarer === this.game.myIndex) {
            document.getElementById('gameSelection').style.display = 'block';
        }
    }

    hideGameSelection() {
        document.getElementById('gameSelection').style.display = 'none';
    }

    selectGame(type) {
        this.hideGameSelection();
        document.getElementById('gameType').innerHTML = `Spieltyp: <strong>${this.getGameTypeName(type)}</strong>`;
        this.showToast(`${this.game.players[this.game.declarer].name} spielt ${this.getGameTypeName(type)}!`);

        if (this.onSelectGame) this.onSelectGame(type);
    }

    getGameTypeName(type) {
        const names = {
            'clubs': '♣ Kreuz',
            'spades': '♠ Pik',
            'hearts': '♥ Herz',
            'diamonds': '♦ Karo',
            'grand': 'Grand',
            'null': 'Null'
        };
        return names[type] || type;
    }

    toggleHelp() {
        this.helpVisible = !this.helpVisible;
        document.getElementById('helpPanel').style.display = this.helpVisible ? 'block' : 'none';
    }

    updateHelp(phase) {
        const content = document.getElementById('helpContent');

        const helpTexts = {
            bidding: `
                <p><strong>📢 Reizen</strong></p>
                <p>Jetzt wird gereizt! Das Reizen bestimmt, wer als Alleinspieler gegen die anderen beiden spielt.</p>

                <div class="tip">
                    <strong>So funktioniert's:</strong><br>
                    Der Mittelhand bietet zuerst an Vorhand. Vorhand sagt "Ja" oder "Passe".
                    Dann bietet Hinterhand gegen den Gewinner.
                </div>

                <p><strong>Reizwerte:</strong> 18, 20, 22, 23, 24, 27, 30...</p>
                <p>Diese ergeben sich aus Spielwert × Spitzenanzahl.</p>

                <div class="tip">
                    <strong>Tipp:</strong> Reize nur so hoch, wie du mit deinen Karten auch gewinnen kannst!
                </div>
            `,
            skat: `
                <p><strong>📦 Skat aufnehmen</strong></p>
                <p>Du hast das Reizen gewonnen! Jetzt darfst du den Skat aufnehmen.</p>

                <div class="tip">
                    <strong>So geht's:</strong>
                    <ol style="margin-left: 1rem; margin-top: 0.5rem;">
                        <li>Klicke "Skat aufnehmen"</li>
                        <li>Wähle 2 Karten zum Drücken (die zählen für dich!)</li>
                        <li>Wähle dann dein Spiel</li>
                    </ol>
                </div>

                <p><strong>Strategie:</strong> Drücke Karten, die dir nicht helfen (z.B. blanke Asse in Nebenfarben sind gefährlich!).</p>
            `,
            playing: `
                <p><strong>🎴 Stichphase</strong></p>
                <p>Jetzt werden 10 Stiche gespielt. Der Alleinspieler braucht mindestens 61 Augen zum Gewinnen.</p>

                <div class="tip">
                    <strong>Regeln:</strong>
                    <ul style="margin-left: 1rem; margin-top: 0.5rem;">
                        <li>Farbe muss bedient werden!</li>
                        <li>Kannst du nicht bedienen, darfst du frei spielen</li>
                        <li>Höchste Karte (oder Trumpf) gewinnt</li>
                    </ul>
                </div>

                <p><strong>Trumpfreihenfolge:</strong></p>
                <p>♣B > ♠B > ♥B > ♦B > dann Trumpffarbe (A, 10, K, D, 9, 8, 7)</p>

                <p><strong>Kartenwerte:</strong></p>
                <p>Ass=11, 10=10, König=4, Dame=3, Bube=2, 9-7=0</p>
            `
        };

        if (helpTexts[phase]) {
            content.innerHTML = helpTexts[phase];
        }
    }

    showRoundSummary(summary) {
        const panel = document.getElementById('roundSummary');
        const title = document.getElementById('summaryTitle');
        const result = document.getElementById('summaryResult');
        const points = document.getElementById('summaryPoints');

        title.textContent = summary.won ? '🎉 Gewonnen!' : '😢 Verloren!';
        result.innerHTML = `
            ${this.game.players[summary.declarer].name} spielte ${this.getGameTypeName(summary.gameType)}<br>
            Augen: ${summary.points} / 120
        `;
        points.textContent = `${summary.finalScore > 0 ? '+' : ''}${summary.finalScore} Punkte`;

        panel.style.display = 'block';
    }

    hideRoundSummary() {
        document.getElementById('roundSummary').style.display = 'none';
    }

    showToast(message) {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.style.display = 'block';
        toast.style.animation = 'none';
        toast.offsetHeight;
        toast.style.animation = 'fadeInOut 3s ease';

        setTimeout(() => {
            toast.style.display = 'none';
        }, 3000);
    }

    showConnectionArea(show = true) {
        document.getElementById('connectionArea').style.display = show ? 'block' : 'none';
    }
}
