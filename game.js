const suits = ['♠', '♥', '♦', '♣'];
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function getCardPoints(card) {
    if (card.suit === '♠' && card.value === '3') return 30;
    if (card.value === 'A') return 10;
    return 0; 
}

function getCardRank(card) {
    return values.indexOf(card.value);
}

// --- State Structure ---
let gameState = {
    phase: 'LOBBY',       // LOBBY, BIDDING, TRUMP_SELECTION, PLAYING
    deck: [],
    board: [],            
    players: [],          // Strictly an array of objects: { id, name, hand, points, currentBid, team }
    dealerIndex: 0,       
    turnIndex: 0,         
    highestBid: { playerId: null, amount: 0 },
    trumpSuit: null,      
    calledCards: []       
};

let myName = "";
let myPeerId = null; 
let peer = null;
let isHost = false;
let connections = {}; 
let hostConnection = null;

function generateDeck() {
    let deck = [];
    for (let suit of suits) {
        for (let value of values) {
            deck.push({ suit, value, id: Math.random().toString(36).slice(2, 9) }); 
        }
    }
    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function enterGameUI() {
    document.getElementById('network-menu').style.display = 'none';
    
    // Unhide the game container
    const container = document.getElementById('game-container');
    container.style.display = 'flex';
    document.getElementById('controls').style.display = 'flex';
    
    // Only Host sees the Deal button, and only in the LOBBY phase
    const dealBtn = document.getElementById('dealBtn');
    if (isHost && gameState.phase === 'LOBBY') {
        dealBtn.style.display = 'block';
    } else {
        dealBtn.style.display = 'none';
    }
}

// Visual Rendering
function renderState() {
    const myArea = document.getElementById('my-area');
    const boardArea = document.getElementById('center-board');
    const oppArea = document.getElementById('opponents-area');
    const phaseDisplay = document.getElementById('phase-display');
    const gameInfo = document.getElementById('game-info');
    const bidInfo = document.getElementById('bid-info');
    const trumpInfo = document.getElementById('trump-info');
    const biddingPanel = document.getElementById('bidding-panel');
    const trumpPanel = document.getElementById('trump-panel');
    const teamCardsContainer = document.getElementById('team-cards-container');
    
    myArea.innerHTML = '';
    boardArea.innerHTML = '';
    oppArea.innerHTML = '';
    phaseDisplay.textContent = `Phase: ${gameState.phase}`;

    // Manage Deal Button visibility based on phase
    if (isHost) {
        document.getElementById('dealBtn').style.display = (gameState.phase === 'LOBBY') ? 'block' : 'none';
    }

    // 1. Render Shared Board
    gameState.board.forEach(card => {
        boardArea.appendChild(createCardElement(card, false));
    });

    // 2. Render Opponents (Face Down)
    gameState.players.forEach(player => {
        if (player.id !== myPeerId) {
            const oppDiv = document.createElement('div');
            oppDiv.className = 'opponent';
            oppDiv.innerHTML = `<div>${player.name} (${player.hand.length})</div>`;
            
            const oppCardsDiv = document.createElement('div');
            oppCardsDiv.className = 'opponent-cards';
            
            player.hand.forEach(() => {
                const backCard = document.createElement('div');
                backCard.className = 'card face-down';
                oppCardsDiv.appendChild(backCard);
            });
            
            oppDiv.appendChild(oppCardsDiv);
            oppArea.appendChild(oppDiv);
        }
    });

    // 3. Render Local Player (Face Up)
    const me = gameState.players.find(p => p.id === myPeerId);
    if (me) {
        me.hand.forEach(card => {
            const playable = isCardPlayable(myPeerId, card);
            const cardEl = createCardElement(card, true, playable);
            
            if (playable) {
                cardEl.addEventListener('click', () => requestPlayCard(card));
            }
            myArea.appendChild(cardEl);
        });
    }
    if (me) {
        // 1. Info Banner Management
        if (gameState.phase === 'LOBBY') {
            gameInfo.style.display = 'none';
        } else {
            gameInfo.style.display = 'block';
            if (gameState.phase === 'BIDDING' || gameState.phase === 'TRUMP_SELECTION') {
                bidInfo.innerHTML = `Current Highest Bid: <b>${gameState.highestBid.amount}</b> by <b>${gameState.highestBid.playerName || 'None'}</b>`;
                trumpInfo.innerHTML = '';
            } else if (gameState.phase === 'PLAYING') {
                bidInfo.innerHTML = `Bid Winner: <b>${gameState.highestBid.playerName}</b> (${gameState.highestBid.amount} pts) | `;
                trumpInfo.innerHTML = `Cart: <b class="${gameState.trumpSuit === '♥' || gameState.trumpSuit === '♦' ? 'red' : 'black'}">${gameState.trumpSuit}</b> | Team Cards: <b>${gameState.calledCards.join(', ')}</b>`;
            }
        }

        // 2. Bidding Panel Management
        if (gameState.phase === 'BIDDING' && !me.hasFolded) {
            biddingPanel.style.display = 'flex';
            // Auto-set the input minimum to 1 higher than current bid
            document.getElementById('bidAmount').min = gameState.highestBid.amount + 1;
            document.getElementById('bidAmount').placeholder = `Bid > ${gameState.highestBid.amount}`;
        } else {
            biddingPanel.style.display = 'none';
        }

        // 3. Trump Selection Panel Management
        if (gameState.phase === 'TRUMP_SELECTION' && gameState.highestBid.playerId === myPeerId) {
            trumpPanel.style.display = 'flex';
            teamCardsContainer.innerHTML = ''; // Clear previous

            // Calculate allowed team cards: (Total Players - 2) / 2
            let allowedCards = Math.floor((gameState.players.length - 2) / 2);

            // Generate the dropdowns dynamically
            for (let i = 0; i < allowedCards; i++) {
                const selectorDiv = document.createElement('div');
                selectorDiv.style.display = 'flex';
                selectorDiv.style.gap = '5px';

                const rankSelect = document.createElement('select');
                rankSelect.className = 'team-rank-select';
                values.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v; opt.textContent = v;
                    rankSelect.appendChild(opt);
                });

                const suitSelect = document.createElement('select');
                suitSelect.className = 'team-suit-select';
                suits.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s; opt.textContent = s;
                    suitSelect.appendChild(opt);
                });

                selectorDiv.appendChild(rankSelect);
                selectorDiv.appendChild(suitSelect);
                teamCardsContainer.appendChild(selectorDiv);
            }
        } else {
            trumpPanel.style.display = 'none';
        }
    }
}

function createCardElement(card, isClickable, isPlayable = true) {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${card.suit === '♥' || card.suit === '♦' ? 'red' : 'black'}`;
    cardEl.textContent = `${card.value}${card.suit}`;
    
    // Dim unplayable cards so the user knows they can't click them
    if (isClickable && !isPlayable) {
        cardEl.style.opacity = '0.5';
        cardEl.style.cursor = 'not-allowed';
    }
    return cardEl;
}

// --- Networking & Messaging ---
function broadcastState() {
    if (!isHost) return;
    Object.values(connections).forEach(conn => {
        conn.send({ type: 'STATE_UPDATE', state: gameState });
    });
    renderState();
}

document.getElementById('hostBtn').addEventListener('click', () => {
    myName = document.getElementById('playerName').value || "Host";
    peer = new Peer(); 
    
    peer.on('open', (id) => {
        myPeerId = id;
        isHost = true;
        // Host adds themselves to the player array
        gameState.players.push({ id: myPeerId, name: myName, hand: [], wonCards: [], points: 0, currentBid: 0, team: 'UNKNOWN' });
        
        enterGameUI();
        document.getElementById('roomIdDisplay').textContent = `Room ID: ${id}`;
        document.getElementById('network-menu').style.display = 'flex'; // Keep open briefly to show ID
        document.getElementById('hostBtn').style.display = 'none';
        document.getElementById('joinId').style.display = 'none';
        document.getElementById('joinBtn').style.display = 'none';
        document.getElementById('playerName').style.display = 'none';
    });

    peer.on('connection', (conn) => {
        connections[conn.peer] = conn;
        
        conn.on('open', () => broadcastState());
        
        // Consolidated Listener for all client actions
        conn.on('data', (data) => {
            if (data.type === 'JOIN_LOBBY') {
                gameState.players.push({
                    id: conn.peer,
                    name: data.name,
                    hand: [],
                    wonCards: [],
                    points: 0,
                    currentBid: 0,
                    team: 'UNKNOWN'
                });
                broadcastState();
            }
            if (data.type === 'ACTION_PLAY_CARD') handlePlayCard(conn.peer, data.card);
            if (data.type === 'ACTION_PLACE_BID') handlePlaceBid(conn.peer, data.amount);
            if (data.type === 'ACTION_FOLD') handleFold(conn.peer);
            if (data.type === 'ACTION_SET_TRUMP') handleSetTrump(conn.peer, data.suit, data.cards);
        });
    });
});

document.getElementById('joinBtn').addEventListener('click', () => {
    const nameInput = document.getElementById('playerName').value.trim();
    if (!nameInput) {
        alert("You must enter a name to join a game.");
        return;
    }
    
    const roomId = document.getElementById('joinId').value.trim();
    if (!roomId) {
        alert("Enter a Room ID.");
        return;
    }
    
    myName = nameInput;

    peer = new Peer();
    peer.on('open', (id) => {
        myPeerId = id;
        hostConnection = peer.connect(roomId);
        
        hostConnection.on('open', () => {
            // Send name to host immediately upon connecting
            hostConnection.send({ type: 'JOIN_LOBBY', name: myName });
            enterGameUI();
        });

        hostConnection.on('data', (data) => {
            if (data.type === 'STATE_UPDATE') {
                gameState = data.state;
                renderState(); 
            }
        });
    });
});

function isCardPlayable(playerId, card) {
    if (gameState.phase !== 'PLAYING') return false;
    
    const playerIndex = gameState.players.findIndex(p => p.id === playerId);
    if (gameState.turnIndex !== playerIndex) return false; // Not their turn

    if (gameState.board.length === 0) return true; // First player can lead any card

    const leadSuit = gameState.board[0].suit;
    if (card.suit === leadSuit) return true; // Following suit is always legal

    // If they didn't follow suit, check if they are hiding the suit in their hand
    const hasLeadSuit = gameState.players[playerIndex].hand.some(c => c.suit === leadSuit);
    if (hasLeadSuit) return false; // Must follow suit if possible

    return true; // Doesn't have the lead suit, can legally play a different suit/trump
}

// --- Action Logic ---
function requestPlayCard(card) {
    if (!isCardPlayable(myPeerId, card)) {
        alert("You cannot play this card right now.");
        return;
    }

    if (isHost) {
        handlePlayCard(myPeerId, card);
    } else if (hostConnection) {
        hostConnection.send({ type: 'ACTION_PLAY_CARD', card: card });
    }
}

function handlePlayCard(playerId, playedCard) {
    if (!isHost) return;
    if (!isCardPlayable(playerId, playedCard)) return;

    const playerIndex = gameState.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;
    const player = gameState.players[playerIndex];
    
    const cardIndex = player.hand.findIndex(c => c.id === playedCard.id);
    if (cardIndex !== -1) {
        const [card] = player.hand.splice(cardIndex, 1);
        card.playedBy = playerId; 
        gameState.board.push(card);
        
        // --- TEAM REVEAL LOGIC ---
        const cardStr = `${card.value}${card.suit}`;
        if (gameState.calledCards.includes(cardStr)) {
            player.team = 'BIDDER_TEAM';
            gameState.calledCards = gameState.calledCards.filter(c => c !== cardStr);
            // In a real UI, you could trigger a toast notification here
        }

        // Check if trick is complete (everyone played one card)
        if (gameState.board.length === gameState.players.length) {
            // Lock the board to prevent players from throwing cards during the timeout
            gameState.phase = 'EVALUATION';
            broadcastState(); // Tell clients the board is locked
            
            setTimeout(() => {
                evaluateTrick();
            }, 2000); 
        } else {
            // Only advance the turn if the trick is still ongoing
            gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
            broadcastState();
        }
    }
}

function evaluateTrick() {
    const leadSuit = gameState.board[0].suit;
    let winningCard = gameState.board[0];

    // Determine the highest card
    for (let i = 1; i < gameState.board.length; i++) {
        const card = gameState.board[i];
        const isTrump = card.suit === gameState.trumpSuit;
        const winningIsTrump = winningCard.suit === gameState.trumpSuit;

        if (isTrump && !winningIsTrump) {
            winningCard = card;
        } else if ((isTrump && winningIsTrump) || (!isTrump && !winningIsTrump && card.suit === leadSuit)) {
            if (getCardRank(card) > getCardRank(winningCard)) {
                winningCard = card;
            }
        }
    }

    // Allocate points to the winner
    const trickPoints = gameState.board.reduce((sum, c) => sum + getCardPoints(c), 0);
    const winnerIndex = gameState.players.findIndex(p => p.id === winningCard.playedBy);

    gameState.players[winnerIndex].points += trickPoints;
    gameState.players[winnerIndex].wonCards.push(...gameState.board);

    // The winner of the trick gets to start the next trick
    gameState.turnIndex = winnerIndex;
    gameState.board = []; // Clear the table

    // Check if the round is over
    if (gameState.players[0].hand.length === 0) {
        evaluateRoundEnd();
    } else {
        gameState.phase = 'PLAYING';
        broadcastState();
    }
}

function evaluateRoundEnd() {
    gameState.phase = 'GAMEOVER';
    
    // Anyone whose team is still 'UNKNOWN' is placed on the defending team
    gameState.players.forEach(p => {
        if (p.team === 'UNKNOWN') p.team = 'DEFENDER_TEAM';
    });

    let bidderTeamPoints = 0;
    let defenderTeamPoints = 0;

    let bidderNames = [];
    let defenderNames = [];

    gameState.players.forEach(p => {
        if (p.team === 'BIDDER_TEAM') {
            bidderTeamPoints += p.points;
            bidderNames.push(p.name);
        } else {
            defenderTeamPoints += p.points;
            defenderNames.push(p.name);
        }
    });

    const bidMet = bidderTeamPoints >= gameState.highestBid.amount;
    
    // Broadcast the final calculated state so clients can render the scorecard
    broadcastState(); 
    alert(`Round Over! Bidder Team (${bidderNames.join(', ')}) got ${bidderTeamPoints} (Target: ${gameState.highestBid.amount}). They ${bidMet ? 'WON' : 'LOST'}!`);
}

document.getElementById('dealBtn').addEventListener('click', () => {
    if (!isHost) return;

    // Reset game state for a new deal
    gameState.deck = generateDeck();
    shuffle(gameState.deck);
    gameState.board = [];
    
    gameState.highestBid = { playerId: null, amount: 0, playerName: "" };
    gameState.trumpSuit = null;
    gameState.calledCards = [];

    gameState.players.forEach(p => {
        p.hand = [];
        p.hasFolded = false; // Track who has exited bidding
    });

    // Deal all 52 cards evenly among players
    const numPlayers = gameState.players.length;
    if (numPlayers === 0) return;

    let cardsToShuffle = Math.min(13, Math.trunc(52 / numPlayers)) * numPlayers;
    let currentPlayer = 0;
    while (cardsToShuffle-- > 0) {
        gameState.players[currentPlayer].hand.push(gameState.deck.pop());
        currentPlayer = (currentPlayer + 1) % numPlayers;
    }

    // Advance to bidding phase
    gameState.phase = 'BIDDING';
    broadcastState();
});

function handlePlaceBid(playerId, amount) {
    if (gameState.phase !== 'BIDDING') return;
    const amt = parseInt(amount);
    
    // Bid must be strictly higher than current
    if (amt > gameState.highestBid.amount) {
        const player = gameState.players.find(p => p.id === playerId);
        gameState.highestBid = { playerId: playerId, amount: amt, playerName: player.name };
        broadcastState();
    }
}

function handleFold(playerId) {
    if (gameState.phase !== 'BIDDING') return;
    
    // The current highest bidder is locked and cannot fold
    if (gameState.highestBid.playerId === playerId) {
        return;
    }

    const player = gameState.players.find(p => p.id === playerId);
    if (player) player.hasFolded = true;

    // Check if bidding is over (only one player remains unfolded)
    const activePlayers = gameState.players.filter(p => !p.hasFolded);
    if (activePlayers.length === 1 && gameState.highestBid.playerId !== null) {
        gameState.phase = 'TRUMP_SELECTION';
    }
    broadcastState();
}

function handleSetTrump(playerId, suit, calledCardsArray) {
    if (gameState.phase !== 'TRUMP_SELECTION' || gameState.highestBid.playerId !== playerId) return;

    gameState.trumpSuit = suit;
    gameState.calledCards = calledCardsArray; // Array of formatted strings like ["A♠", "K♥"]
    
    // The highest bidder leads the first trick
    gameState.turnIndex = gameState.players.findIndex(p => p.id === playerId);
    
    gameState.phase = 'PLAYING';
    broadcastState();
}

// Hook up the Bidding Buttons
document.getElementById('submitBidBtn').addEventListener('click', () => {
    const bid = document.getElementById('bidAmount').value;
    if (bid === "") return;
    
    if (isHost) handlePlaceBid(myPeerId, bid);
    else if (hostConnection) hostConnection.send({ type: 'ACTION_PLACE_BID', amount: bid });
    
    document.getElementById('bidAmount').value = ''; // Clear input
});

document.getElementById('foldBtn').addEventListener('click', () => {
    if (gameState.highestBid.playerId === myPeerId) {
        alert("You have the highest bid, you cannot fold!");
        return;
    }

    if (isHost) handleFold(myPeerId);
    else if (hostConnection) hostConnection.send({ type: 'ACTION_FOLD' });
});

// Hook up the Trump/Team Selection Button
document.getElementById('setTrumpBtn').addEventListener('click', () => {
    const suit = document.getElementById('trumpSuitSelect').value;
    
    // Gather all selected cards from the dynamically generated dropdowns
    const ranks = document.querySelectorAll('.team-rank-select');
    const suits = document.querySelectorAll('.team-suit-select');
    let chosenCards = [];
    
    for (let i = 0; i < ranks.length; i++) {
        chosenCards.push(`${ranks[i].value}${suits[i].value}`);
    }
    
    if (isHost) handleSetTrump(myPeerId, suit, chosenCards);
    else if (hostConnection) hostConnection.send({ type: 'ACTION_SET_TRUMP', suit: suit, cards: chosenCards });
});

// Save/Load
function saveGame() {
    const dataStr = JSON.stringify(gameState);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'kalliTilli.json');
    linkElement.click();
}

function loadGame(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            gameState = JSON.parse(e.target.result);
            renderState();
            if (isHost) broadcastState();
            alert("State restored successfully.");
        } catch(error) {
            alert("Failed to parse save file.");
        }
    };
    reader.readAsText(file);
}

document.getElementById('saveBtn').addEventListener('click', saveGame);
document.getElementById('loadInput').addEventListener('change', loadGame);