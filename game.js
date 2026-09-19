const suits = ['♠', '♥', '♦', '♣'];
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

let gameState = {
    deck: [],
    playerHand: []
};

// --- Network Variables ---
let peer = null;
let isHost = false;
let connections = []; // Host uses this to track all connected friends
let hostConnection = null; // Client uses this to talk to the Host

// --- Game Logic ---
function generateDeck() {
    let deck = [];
    for (let suit of suits) {
        for (let value of values) {
            deck.push({ suit, value });
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

function renderHand() {
    const handDiv = document.getElementById('player-hand');
    handDiv.innerHTML = ''; 

    gameState.playerHand.forEach(card => {
        const cardEl = document.createElement('div');
        cardEl.className = `card ${card.suit === '♥' || card.suit === '♦' ? 'red' : 'black'}`;
        cardEl.textContent = `${card.value}${card.suit}`;
        handDiv.appendChild(cardEl);
    });
}

// --- Networking Logic ---

// 1. Host Game
document.getElementById('hostBtn').addEventListener('click', () => {
    peer = new Peer(); // Connect to PeerJS server
    
    peer.on('open', (id) => {
        document.getElementById('roomIdDisplay').textContent = `Room ID: ${id}`;
        isHost = true;
    });

    peer.on('connection', (conn) => {
        connections.push(conn);
        console.log("A player connected!");
        
        // Immediately send the new player the current game state
        conn.on('open', () => {
            conn.send({ type: 'STATE_UPDATE', state: gameState });
        });
    });
});

// 2. Join Game
document.getElementById('joinBtn').addEventListener('click', () => {
    const roomId = document.getElementById('joinId').value;
    if (!roomId) return;

    peer = new Peer();
    
    peer.on('open', () => {
        hostConnection = peer.connect(roomId);
        
        hostConnection.on('open', () => {
            alert('Connected to host!');
        });

        // Listen for state updates from the Host
        hostConnection.on('data', (data) => {
            if (data.type === 'STATE_UPDATE') {
                gameState = data.state;
                renderHand(); 
            }
        });
    });
});

// --- Event Bindings ---
document.getElementById('dealBtn').addEventListener('click', () => {
    if (!isHost && hostConnection) {
        alert("Only the Host can deal right now!");
        return;
    }

    gameState.deck = generateDeck();
    shuffle(gameState.deck);
    gameState.playerHand = gameState.deck.splice(0, 5); 
    renderHand();

    // Broadcast the new game state to all connected clients
    if (isHost) {
        connections.forEach(conn => {
            conn.send({ type: 'STATE_UPDATE', state: gameState });
        });
    }
});

// (Keep your existing saveGame and loadGame functions down here)
function saveGame() {
    const dataStr = JSON.stringify(gameState);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'card_game_save.json');
    linkElement.click();
}

function loadGame(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            gameState = JSON.parse(e.target.result);
            renderHand();
            if (isHost) {
                connections.forEach(conn => conn.send({ type: 'STATE_UPDATE', state: gameState }));
            }
            alert("State restored successfully.");
        } catch(error) {
            alert("Failed to parse save file.");
        }
    };
    reader.readAsText(file);
}

document.getElementById('saveBtn').addEventListener('click', saveGame);
document.getElementById('loadInput').addEventListener('change', loadGame);