window.addEventListener('beforeunload', (event) => {
    if (gameState.phase !== 'LOBBY' || gameState.players.length > 1) {
        event.preventDefault();
        event.returnValue = ''; // Standard trigger for modern browsers
    }
});

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
    const scorecard = document.getElementById('scorecard-modal');
    const modalBtn = document.getElementById('modalBackToLobbyBtn');
    
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
            let allowedCards = Math.floor((gameState.players.length - 2) / 2);
            
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

    if (gameState.phase === 'GAMEOVER') {
        scorecard.style.display = 'block';
        modalBtn.style.display = isHost ? 'block' : 'none';
        
        let bTeamHtml = ''; let bTotal = 0;
        let dTeamHtml = ''; let dTotal = 0;
        
        gameState.players.forEach(p => {
            if (p.team === 'BIDDER_TEAM') {
                bTeamHtml += `<div>${p.name}: ${p.points}</div>`;
                bTotal += p.points;
            } else {
                dTeamHtml += `<div>${p.name}: ${p.points}</div>`;
                dTotal += p.points;
            }
        });
        
        document.getElementById('bidder-stats').innerHTML = bTeamHtml;
        document.getElementById('defender-stats').innerHTML = dTeamHtml;
        document.getElementById('bidder-total').textContent = bTotal;
        document.getElementById('defender-total').textContent = dTotal;
        document.getElementById('bid-target').textContent = gameState.highestBid.amount;
        
        const won = bTotal >= gameState.highestBid.amount;
        document.getElementById('score-title').textContent = won ? "Bidder Team WON! 🎉" : "Bidder Team LOST! ❌";
        document.getElementById('score-title').style.color = won ? "#4CAF50" : "#f44336";
        
    } else {
        scorecard.style.display = 'none';
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

function saveGame() {
    const payload = {
        gameState: gameState,
        gameStats: gameStats
    };
    
    const dataStr = JSON.stringify(payload, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `kalli_tilli_backup_${Date.now()}.json`);
    linkElement.click();
}

function loadGame(event) {
    if (!isHost) {
        alert("Only the room host can load save files.");
        return;
    }

    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            
            if (parsed.gameState) {
                // Preserve current network IDs while taking game state data
                const currentConnections = gameState.players.map(p => ({ id: p.id, name: p.name }));
                
                gameState = parsed.gameState;
                gameStats = parsed.gameStats || {};

                // Re-bind connected player IDs to loaded records
                currentConnections.forEach((conn, index) => {
                    if (gameState.players[index]) {
                        gameState.players[index].id = conn.id;
                    }
                });

                broadcastState();
                alert("Game state and stats restored.");
            } else {
                throw new Error("Invalid structure");
            }
        } catch(err) {
            alert("Failed to parse the save file.");
        }
    };
    reader.readAsText(file);
}

// UI Bindings
document.getElementById('startGameBtn').addEventListener('click', () => {
    if (isHost) { startDeal(); broadcastState(); }
});

document.getElementById('backToLobbyBtn').addEventListener('click', () => {
    if (isHost) {
        gameState.phase = 'LOBBY';
        if (gameState.spectators) {
            gameState.spectators.forEach(s => {
                // Strip the "(Spectator)" tag
                const cleanName = s.name.replace(" (Spectator)", "");
                gameState.players.push({ id: s.id, name: cleanName, hand: [], wonCards: [], points: 0, currentBid: 0, team: 'UNKNOWN' });
            });
            gameState.spectators = [];
        }
        broadcastState();
    }
});

document.getElementById('modalBackToLobbyBtn').addEventListener('click', () => {
    if (isHost) {
        gameState.phase = 'LOBBY';
        
        // Merge any spectators into active players
        if (gameState.spectators && gameState.spectators.length > 0) {
            gameState.spectators.forEach(s => {
                const cleanName = s.name.replace(" (Spectator)", "");
                gameState.players.push({ 
                    id: s.id, 
                    name: cleanName, 
                    hand: [], 
                    wonCards: [], 
                    points: 0, 
                    currentBid: 0, 
                    team: 'UNKNOWN' 
                });
            });
            gameState.spectators = [];
        }

        // Reset round-specific player properties
        gameState.players.forEach(p => {
            p.hand = [];
            p.wonCards = [];
            p.points = 0;
            p.currentBid = 0;
            p.hasFolded = false;
            p.team = 'UNKNOWN';
        });

        gameState.board = [];
        gameState.highestBid = { playerId: null, amount: 0, playerName: "" };
        gameState.trumpSuit = null;
        gameState.calledCards = [];

        broadcastState();
    }
});

document.getElementById('submitBidBtn').addEventListener('click', () => {
    const bid = document.getElementById('bidAmount').value;
    if (bid === "") return;
    if (isHost) { 
        const res = handlePlaceBid(myPeerId, bid); 
        if (res && res.error) alert(res.error);
        else broadcastState(); 
    }
    else if (hostConnection) {
        hostConnection.send({ type: 'ACTION_PLACE_BID', amount: bid });
    }
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

document.getElementById('saveBtn')?.addEventListener('click', saveGame);
document.getElementById('loadInput')?.addEventListener('change', loadGame);