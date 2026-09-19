const suits = ['♠', '♥', '♦', '♣'];
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

let gameState = {
    deck: [],
    playerHand: []
};

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

function saveGame() {
    const dataStr = JSON.stringify(gameState);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', 'teenpatti.json');
    linkElement.click();
}

// File Load Implementation
function loadGame(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            gameState = JSON.parse(e.target.result); // Overwrite active state
            renderHand(); // Force visual update
            alert("State restored successfully.");
        } catch(error) {
            alert("Failed to parse save file.");
        }
    };
    reader.readAsText(file);
}

// Event Bindings
document.getElementById('dealBtn').addEventListener('click', () => {
    gameState.deck = generateDeck();
    shuffle(gameState.deck);
    
    // Draw 5 cards from the top of the deck
    gameState.playerHand = gameState.deck.splice(0, 5); 
    renderHand();
});

document.getElementById('saveBtn').addEventListener('click', saveGame);
document.getElementById('loadInput').addEventListener('change', loadGame);