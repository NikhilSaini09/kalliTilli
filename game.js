const suits = ['♠', '♥', '♦', '♣'];
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function getCardPoints(card) {
    if (card.suit === '♠' && card.value === '3') return 30;
    if (card.value === 'A') return 10;
    // Add other custom point values here
    return 0; 
}

function getCardRank(card) {
    return values.indexOf(card.value);
}

// --- State Structure ---
let gameState = {
    phase: 'LOBBY',       // LOBBY, DEAL, BIDDING, TRUMP_SELECTION, PLAYING
    deck: [],
    board: [],            // The current trick on the table
    players: [],          // Array to enforce turn order: { id, name, hand, points, currentBid, team }
    dealerIndex: 0,       // Rotates +1 every new game
    turnIndex: 0,         // Rotates during bidding and playing
    highestBid: { playerId: null, amount: 0 },
    trumpSuit: null,      // The "Cart"
    calledCards: []       // Cards chosen by the highest bidder to form their secret team
};

let myName = "";
let myPeerId = null; 
let peer = null;
let isHost = false;
let connections = {}; // Object mapping Peer IDs to connections
let hostConnection = null;

// --- Game Logic ---
function generateDeck() {
    let deck = [];
    for (let suit of suits) {
        for (let value of values) {
            deck.push({ suit, value, id: Math.random().toString(36).slice(2, 9) }); // Add unique ID to each card
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
    document.getElementById('controls').style.display = 'flex';
    
    // Only Host sees the Deal button
    if (!isHost) {
        document.getElementById('dealBtn').style.display = 'none';
    }
}

// Visual Rendering
function renderState() {
    const myArea = document.getElementById('my-area');
    const boardArea = document.getElementById('center-board');
    const oppArea = document.getElementById('opponents-area');
    
    myArea.innerHTML = '';
    boardArea.innerHTML = '';
    oppArea.innerHTML = '';

    // 1. Render Shared Board
    gameState.board.forEach(card => {
        boardArea.appendChild(createCardElement(card, false));
    });

    // 2. Render Opponents (Face Down)
    Object.keys(gameState.players).forEach(playerId => {
        if (playerId !== myPeerId) {
            const oppDiv = document.createElement('div');
            oppDiv.className = 'opponent';
            oppDiv.innerHTML = `<div>Player ${playerId.substring(0, 4)}</div>`;
            
            const oppCardsDiv = document.createElement('div');
            oppCardsDiv.className = 'opponent-cards';
            
            // Render a face-down card for however many cards they have
            gameState.players[playerId].forEach(() => {
                const backCard = document.createElement('div');
                backCard.className = 'card face-down';
                oppCardsDiv.appendChild(backCard);
            });
            
            oppDiv.appendChild(oppCardsDiv);
            oppArea.appendChild(oppDiv);
        }
    });

    // 3. Render Local Player (Face Up)
    if (gameState.players[myPeerId]) {
        gameState.players[myPeerId].forEach(card => {
            const cardEl = createCardElement(card, true);
            cardEl.addEventListener('click', () => requestPlayCard(card));
            myArea.appendChild(cardEl);
        });
    }
}

function createCardElement(card) {
    const cardEl = document.createElement('div');
    cardEl.className = `card ${card.suit === '♥' || card.suit === '♦' ? 'red' : 'black'}`;
    cardEl.textContent = `${card.value}${card.suit}`;
    return cardEl;
}

// --- Networking & Messaging ---

function broadcastState() {
    if (!isHost) return;
    // Send the state to all connected clients
    Object.values(connections).forEach(conn => {
        conn.send({ type: 'STATE_UPDATE', state: gameState });
    });
    // Render locally for the Host
    renderState();
}

document.getElementById('hostBtn').addEventListener('click', () => {
    peer = new Peer(); 
    
    peer.on('open', (id) => {
        myPeerId = id;
        isHost = true;
        gameState.players[myPeerId] = []; 
        enterGameUI();
        document.getElementById('roomIdDisplay').textContent = `Room ID: ${id}`;
        document.getElementById('network-menu').style.display = 'flex'; // Keep open briefly to show ID
        document.getElementById('hostBtn').style.display = 'none';
        document.getElementById('joinId').style.display = 'none';
        document.getElementById('joinBtn').style.display = 'none';
    });

    peer.on('connection', (conn) => {
        conn.on('data', (data) => {
            if (data.type === 'JOIN_LOBBY') {
                gameState.players.push({
                    id: conn.peer,
                    name: data.name,
                    hand: [],
                    points: 0,
                    currentBid: 0,
                    team: 'UNKNOWN'
                });
                broadcastState();
            }
        });
    });

    peer.on('connection', (conn) => {
        connections[conn.peer] = conn;
        gameState.players[conn.peer] = []; 
        conn.on('open', () => broadcastState());
        conn.on('data', (data) => {
            if (data.type === 'ACTION_PLAY_CARD') handlePlayCard(conn.peer, data.card);
        });
    });
});

document.getElementById('joinBtn').addEventListener('click', () => {
    const roomId = document.getElementById('joinId').value;
    if (!roomId) return;

    peer = new Peer();
    
    peer.on('open', (id) => {
        myPeerId = id;
        hostConnection = peer.connect(roomId);
        
        hostConnection.on('open', () => {
            alert('Connected to host!');
        });

        // Client Listens for State Updates
        hostConnection.on('data', (data) => {
            if (data.type === 'STATE_UPDATE') {
                gameState = data.state;
                renderState(); 
            }
        });
    });
});

// --- Action Logic ---

// Client requests to play a card
function requestPlayCard(card) {
    if (isHost) {
        handlePlayCard(myPeerId, card); // Host bypasses network
    } else if (hostConnection) {
        hostConnection.send({ type: 'ACTION_PLAY_CARD', card: card });
    }
}

// Host validates and applies the play
function handlePlayCard(playerId, playedCard) {
    if (!isHost) return;

    const playerHand = gameState.players[playerId];
    
    // 1. Validation: Does the player actually have this card?
    const cardIndex = playerHand.findIndex(c => c.id === playedCard.id);
    
    if (cardIndex !== -1) {
        // 2. State Mutation: Remove from hand, add to board
        const [card] = playerHand.splice(cardIndex, 1);
        gameState.board.push(card);
        
        // 3. Broadcast new truth
        broadcastState();
    }
}

document.getElementById('dealBtn').addEventListener('click', () => {
    if (!isHost) {
        alert("Only the Host can deal!");
        return;
    }

    gameState.deck = generateDeck();
    shuffle(gameState.deck);
    gameState.board = []; // Clear board

    // Deal 5 cards to every connected player (including the Host)
    const playerIds = Object.keys(gameState.players);
    for (let i = 0; i < 52 / playerIds.length; i++) {
        playerIds.forEach(id => {
            if (gameState.deck.length > 0) {
                gameState.players[id].push(gameState.deck.pop());
            }
        });
    }

    broadcastState();
});

// Save/Load remain the same, but trigger broadcastState() when loaded by Host
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