function switchView(viewId) {
    document.querySelectorAll('.view-container').forEach(el => el.style.display = 'none');
    document.getElementById(viewId).style.display = 'flex';
}

function renderState() {
    if (gameState.phase === 'LOBBY') {
        switchView('view-lobby');
        renderLobby();
    } else {
        switchView('view-game');
        renderGameBoard();
    }
}

function renderLobby() {
    const lobbyDiv = document.getElementById('lobby-players');
    lobbyDiv.innerHTML = '';

    gameState.players.forEach(player => {
        const pDiv = document.createElement('div');
        pDiv.style.display = 'flex';
        pDiv.style.justifyContent = 'space-between';
        pDiv.style.alignItems = 'center';
        pDiv.style.padding = '10px';
        pDiv.style.background = 'rgba(0,0,0,0.4)';
        
        let html = `<span>${player.name} ${player.id === myPeerId ? '(You)' : ''}</span>`;
        if (isHost && player.id !== myPeerId) {
            html += `<button onclick="kickPlayer('${player.id}')" style="background: red; color: white; border: none; padding: 5px 10px; cursor: pointer;">Kick</button>`;
        }
        
        pDiv.innerHTML = html;
        lobbyDiv.appendChild(pDiv);
    });

    if (isHost) {
        document.getElementById('startGameBtn').style.display = gameState.players.length >= 2 ? 'block' : 'none';
    }
}

function renderGameBoard() {
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
    const backToLobbyBtn = document.getElementById('backToLobbyBtn');
    
    myArea.innerHTML = '';
    boardArea.innerHTML = '';
    oppArea.innerHTML = '';
    phaseDisplay.textContent = `Phase: ${gameState.phase}`;

    // Return to Lobby Button
    backToLobbyBtn.style.display = (gameState.phase === 'GAMEOVER' && isHost) ? 'block' : 'none';

    // 1. Shared Board
    gameState.board.forEach(card => boardArea.appendChild(createCardElement(card, false)));

    // 2. Opponents
    gameState.players.forEach(player => {
        if (player.id !== myPeerId) {
            const oppDiv = document.createElement('div');
            oppDiv.className = 'opponent';
            
            // Show points and team reveal if applicable
            let teamIcon = player.team === 'BIDDER_TEAM' ? '🔥' : (player.team === 'DEFENDER_TEAM' ? '🛡️' : '');
            oppDiv.innerHTML = `<div>${player.name} ${teamIcon} <br> Cards: ${player.hand.length} | Pts: ${player.points}</div>`;
            
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

    // 3. Local Player
    const me = gameState.players.find(p => p.id === myPeerId);
    if (me) {
        me.hand.forEach(card => {
            const playable = isCardPlayable(myPeerId, card);
            const cardEl = createCardElement(card, true, playable);
            if (playable) cardEl.addEventListener('click', () => requestPlayCard(card));
            myArea.appendChild(cardEl);
        });

        // Panels
        gameInfo.style.display = 'block';
        if (gameState.phase === 'BIDDING' || gameState.phase === 'TRUMP_SELECTION') {
            bidInfo.innerHTML = `Highest Bid: <b>${gameState.highestBid.amount}</b> by <b>${gameState.highestBid.playerName || 'None'}</b>`;
            trumpInfo.innerHTML = '';
        } else if (gameState.phase === 'PLAYING' || gameState.phase === 'TRICK_EVALUATION' || gameState.phase === 'GAMEOVER') {
            bidInfo.innerHTML = `Bid Winner: <b>${gameState.highestBid.playerName}</b> (${gameState.highestBid.amount} pts) | Pts Earned: <b>${me.points}</b>`;
            trumpInfo.innerHTML = `Cart: <b class="${gameState.trumpSuit === '♥' || gameState.trumpSuit === '♦' ? 'red' : 'black'}">${gameState.trumpSuit}</b> | Team Cards: <b>${gameState.calledCards.join(', ')}</b>`;
        }

        biddingPanel.style.display = (gameState.phase === 'BIDDING' && !me.hasFolded) ? 'flex' : 'none';
        if (biddingPanel.style.display === 'flex') {
            document.getElementById('bidAmount').min = gameState.highestBid.amount + 1;
            document.getElementById('bidAmount').placeholder = `Bid > ${gameState.highestBid.amount}`;
        }

        if (gameState.phase === 'TRUMP_SELECTION' && gameState.highestBid.playerId === myPeerId) {
            trumpPanel.style.display = 'flex';
            teamCardsContainer.innerHTML = ''; 
            let allowedCards = Math.max(1, Math.floor((gameState.players.length - 2) / 2));
            
            for (let i = 0; i < allowedCards; i++) {
                const selectorDiv = document.createElement('div');
                selectorDiv.style.display = 'flex'; selectorDiv.style.gap = '5px';
                
                const rankSelect = document.createElement('select');
                rankSelect.className = 'team-rank-select';
                values.forEach(v => rankSelect.appendChild(new Option(v, v)));
                
                const suitSelect = document.createElement('select');
                suitSelect.className = 'team-suit-select';
                suits.forEach(s => suitSelect.appendChild(new Option(s, s)));
                
                selectorDiv.appendChild(rankSelect); selectorDiv.appendChild(suitSelect);
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
    
    if (isClickable && !isPlayable) {
        cardEl.style.opacity = '0.5';
        cardEl.style.cursor = 'not-allowed';
    }
    return cardEl;
}

function requestPlayCard(card) {
    if (!isCardPlayable(myPeerId, card)) { alert("You cannot play this card."); return; }
    if (isHost) { handlePlayCard(myPeerId, card); broadcastState(); } 
    else if (hostConnection) hostConnection.send({ type: 'ACTION_PLAY_CARD', card: card });
}

// UI Bindings
document.getElementById('startGameBtn').addEventListener('click', () => {
    if (isHost) { startDeal(); broadcastState(); }
});

document.getElementById('backToLobbyBtn').addEventListener('click', () => {
    if (isHost) {
        gameState.phase = 'LOBBY';
        broadcastState();
    }
});

document.getElementById('submitBidBtn').addEventListener('click', () => {
    const bid = document.getElementById('bidAmount').value;
    if (bid === "") return;
    if (isHost) { handlePlaceBid(myPeerId, bid); broadcastState(); }
    else if (hostConnection) hostConnection.send({ type: 'ACTION_PLACE_BID', amount: bid });
    document.getElementById('bidAmount').value = ''; 
});

document.getElementById('foldBtn').addEventListener('click', () => {
    if (gameState.highestBid.playerId === myPeerId) { alert("You have the highest bid, you cannot fold!"); return; }
    if (isHost) { handleFold(myPeerId); broadcastState(); }
    else if (hostConnection) hostConnection.send({ type: 'ACTION_FOLD' });
});

document.getElementById('setTrumpBtn').addEventListener('click', () => {
    const suit = document.getElementById('trumpSuitSelect').value;
    const ranks = document.querySelectorAll('.team-rank-select');
    const suits = document.querySelectorAll('.team-suit-select');
    let chosenCards = [];
    
    for (let i = 0; i < ranks.length; i++) {
        chosenCards.push(`${ranks[i].value}${suits[i].value}`);
    }
    
    if (isHost) { handleSetTrump(myPeerId, suit, chosenCards); broadcastState(); }
    else if (hostConnection) hostConnection.send({ type: 'ACTION_SET_TRUMP', suit: suit, cards: chosenCards });
});