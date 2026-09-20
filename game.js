const suits = ['♠', '♥', '♦', '♣'];
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function getCardPoints(card) {
    if (card.value === 'A' || card.value === 'K' || card.value === 'Q' ||
                card.value === 'J'|| card.value === '10' ) return 10;
    if (card.value === '5') return 5;
    if (card.suit === '♠' && card.value === '3') return 30;
    return 0; 
}

function getCardRank(card) {
    return values.indexOf(card.value);
}

// --- State Structure ---
let gameState = {
    phase: 'LOBBY',       // LOBBY, BIDDING, TRUMP_SELECTION, PLAYING, TRICK_EVALUATION, GAMEOVER
    deck: [],
    board: [],            
    players: [],          
    dealerIndex: 0,       
    turnIndex: 0,         
    highestBid: { playerId: null, amount: 0, playerName: "" },
    trumpSuit: null,      
    calledCards: []       
};

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

function isCardPlayable(playerId, card) {
    if (gameState.phase !== 'PLAYING') return false;
    
    const playerIndex = gameState.players.findIndex(p => p.id === playerId);
    if (gameState.turnIndex !== playerIndex) return false; 

    if (gameState.board.length === 0) return true; 

    const leadSuit = gameState.board[0].suit;
    if (card.suit === leadSuit) return true; 

    const hasLeadSuit = gameState.players[playerIndex].hand.some(c => c.suit === leadSuit);
    if (hasLeadSuit) return false; 

    return true; 
}

function handlePlayCard(playerId, playedCard) {
    if (!isCardPlayable(playerId, playedCard)) return;

    const playerIndex = gameState.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return;
    const player = gameState.players[playerIndex];
    
    const cardIndex = player.hand.findIndex(c => c.id === playedCard.id);
    if (cardIndex !== -1) {
        const [card] = player.hand.splice(cardIndex, 1);
        card.playedBy = playerId; 
        gameState.board.push(card);
        
        // Team Reveal Logic
        const cardStr = `${card.value}${card.suit}`;
        if (gameState.calledCards.includes(cardStr)) {
            player.team = 'BIDDER_TEAM';
            gameState.calledCards = gameState.calledCards.filter(c => c !== cardStr);
        }

        if (gameState.board.length === gameState.players.length) {
            // Lock board for evaluation
            gameState.phase = 'TRICK_EVALUATION';
            setTimeout(() => {
                evaluateTrick();
                broadcastState(); // Broadcast after evaluation finishes
            }, 2000);
        } else {
            gameState.turnIndex = (gameState.turnIndex + 1) % gameState.players.length;
        }
    }
}

function evaluateTrick() {
    const leadSuit = gameState.board[0].suit;
    let winningCard = gameState.board[0];

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

    const trickPoints = gameState.board.reduce((sum, c) => sum + getCardPoints(c), 0);
    const winnerIndex = gameState.players.findIndex(p => p.id === winningCard.playedBy);
    
    gameState.players[winnerIndex].points += trickPoints;
    gameState.players[winnerIndex].wonCards.push(...gameState.board); 

    gameState.turnIndex = winnerIndex;
    gameState.board = []; 

    if (gameState.players[0].hand.length === 0) {
        evaluateRoundEnd();
    } else {
        gameState.phase = 'PLAYING';
    }
}

function evaluateRoundEnd() {
    gameState.phase = 'GAMEOVER';
    
    gameState.players.forEach(p => {
        if (p.team === 'UNKNOWN') p.team = 'DEFENDER_TEAM';
    });

    let bidderTeamPoints = 0;
    let bidderNames = [];

    gameState.players.forEach(p => {
        if (p.team === 'BIDDER_TEAM') {
            bidderTeamPoints += p.points;
            bidderNames.push(p.name);
        }
    });

    const bidMet = bidderTeamPoints >= gameState.highestBid.amount;
    const statusMsg = bidMet ? 'WON' : 'LOST';
    alert(`Game Over! The Bidder Team (${bidderNames.join(', ')}) scored ${bidderTeamPoints} against a target of ${gameState.highestBid.amount}. They ${statusMsg}!`);
}

function startDeal() {
    gameState.deck = generateDeck();
    shuffle(gameState.deck);
    gameState.board = [];
    gameState.highestBid = { playerId: null, amount: 0, playerName: "" };
    gameState.trumpSuit = null;
    gameState.calledCards = [];

    gameState.players.forEach(p => {
        p.hand = [];
        p.wonCards = [];
        p.hasFolded = false;
        p.points = 0;
        p.team = p.id === myPeerId ? 'UNKNOWN' : 'UNKNOWN'; // Reset teams
    });

    const numPlayers = gameState.players.length;
    let cardsToShuffle = Math.min(13, Math.trunc(52 / numPlayers)) * numPlayers;
    let currentPlayer = 0;
    while (cardsToShuffle-- > 0) {
        gameState.players[currentPlayer].hand.push(gameState.deck.pop());
        currentPlayer = (currentPlayer + 1) % numPlayers;
    }

    gameState.phase = 'BIDDING';
}

function handlePlaceBid(playerId, amount) {
    if (gameState.phase !== 'BIDDING') return;
    const amt = parseInt(amount);
    
    if (amt > gameState.highestBid.amount) {
        const player = gameState.players.find(p => p.id === playerId);
        gameState.highestBid = { playerId: playerId, amount: amt, playerName: player.name };
    }
}

function handleFold(playerId) {
    if (gameState.phase !== 'BIDDING') return;
    if (gameState.highestBid.playerId === playerId) return;

    const player = gameState.players.find(p => p.id === playerId);
    if (player) player.hasFolded = true;

    const activePlayers = gameState.players.filter(p => !p.hasFolded);
    if (activePlayers.length === 1 && gameState.highestBid.playerId !== null) {
        gameState.phase = 'TRUMP_SELECTION';
    }
}

function handleSetTrump(playerId, suit, calledCardsArray) {
    if (gameState.phase !== 'TRUMP_SELECTION' || gameState.highestBid.playerId !== playerId) return;

    gameState.trumpSuit = suit;
    gameState.calledCards = calledCardsArray; 
    
    const bidderIndex = gameState.players.findIndex(p => p.id === playerId);
    gameState.players[bidderIndex].team = 'BIDDER_TEAM';
    gameState.turnIndex = bidderIndex;
    
    gameState.phase = 'PLAYING';
}