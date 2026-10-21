// main.js — DOM, state, input, storage. Game logic lives in core.js.
import {
    TOTAL_LEVELS, STONES, SHAPES, POWERUP_COSTS,
    generateLevel, createEmptyGrid, cloneGrid, canPlace, placeBlockOnGrid,
    findFullLines, clearLines, lineClearScore, applyBomb, applyHammer,
    hasAnyPlacement, calcStars, rotateBlock, sanitizeInt, parseJSONSafe,
    hashString, dayKey,
} from './core.js';

// --- Elements ---
const mainMenu = document.getElementById('main-menu');
const levelSelectMenu = document.getElementById('level-select-menu');
const gameContainer = document.getElementById('game-container');
const levelsButton = document.getElementById('levels-button');
const endlessButton = document.getElementById('endless-button');
const dailyButton = document.getElementById('daily-button');
const backToMainMenuButton = document.getElementById('back-to-main-menu');
const homeButton = document.getElementById('home-button');
const muteButton = document.getElementById('mute-button');
const levelGrid = document.getElementById('level-grid');
const board = document.getElementById('game-board');
const scoreDisplay = document.getElementById('score');
const levelDisplay = document.getElementById('level');
const levelLabel = document.querySelector('.level-label');
const blockContainer = document.getElementById('block-container');
const gameOverModal = document.getElementById('game-over-modal');
const finalScoreDisplay = document.getElementById('final-score');
const bestScoreRow = document.getElementById('best-score-row');
const bestScoreDisplay = document.getElementById('best-score');
const restartButton = document.getElementById('restart-button');
const modalRestartButton = document.getElementById('modal-restart-button');
const modalMenuButtons = document.querySelectorAll('.modal-menu-button');
const levelCompleteModal = document.getElementById('level-complete-modal');
const nextLevelButton = document.getElementById('next-level-button');
const modalStars = document.getElementById('modal-stars');
const stoneGoalsContainer = document.getElementById('stone-goals-container');
const currencyDisplay = document.getElementById('currency-display');
const swapBlocksButton = document.getElementById('swap-blocks-powerup');
const bombButton = document.getElementById('bomb-powerup');
const hammerButton = document.getElementById('hammer-powerup');
const undoButton = document.getElementById('undo-powerup');
const rotateButton = document.getElementById('rotate-button');

// --- Storage keys ---
const KEY_MAX_LEVEL = 'blockPuzzleMaxLevel';
const KEY_CURRENCY = 'blockPuzzleCurrency';
const KEY_HIGH_SCORE = 'blockPuzzleHighScore';
const KEY_LEVEL_RESULTS = 'blockPuzzleLevelResults';
const KEY_DAILY = 'blockPuzzleDaily';
const KEY_MUTED = 'blockPuzzleMuted';

// --- Game State ---
let GRID_SIZE = 10;
let grid = [];
let cellEls = []; // cached [row][col] cell elements
let score = 0;
let currentBlocks = [];
let draggedBlockData = null;
let draggedElement = null;
let selectedBlockId = null;
let gameMode = 'endless'; // 'endless' | 'levels' | 'daily'
let currentLevel = 1;
let maxUnlockedLevel = 1;
let levelBlockIndex = 0;
let collectedStones = {};
let currency = 0;
let isBombActive = false;
let isHammerActive = false;
let isAnimating = false;
let levelCompleted = false;
let undoStack = [];
let currentLevelConfig = null;
let bestEndlessScore = 0;
let levelResults = {}; // { level: { score, stars } }
let dailyResults = {}; // { 'YYYY-MM-DD': { score, stars, rewardTaken } }
let muted = false;
let audioCtx = null;

// --- Audio (tiny WebAudio sfx, no assets) ---
function playTone(freq, dur = 0.08, type = 'sine', vol = 0.12) {
    if (muted) return;
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.value = vol;
        o.connect(g);
        g.connect(audioCtx.destination);
        o.start();
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
        o.stop(audioCtx.currentTime + dur);
    } catch { /* audio unavailable */ }
}

const sfx = {
    place: () => playTone(320, 0.07, 'triangle'),
    invalid: () => playTone(130, 0.15, 'sawtooth', 0.08),
    clear: () => { playTone(523, 0.1, 'triangle'); setTimeout(() => playTone(659, 0.1, 'triangle'), 70); },
    coin: () => playTone(988, 0.06, 'square', 0.06),
    win: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.12, 'triangle'), i * 90)); },
    over: () => { playTone(196, 0.25, 'sine', 0.15); setTimeout(() => playTone(147, 0.4, 'sine', 0.15), 180); },
};

function vibrate(pattern) {
    if (!muted && navigator.vibrate) navigator.vibrate(pattern);
}

// --- Floating score popups ---
function floatText(text, x, y, extraClass = '') {
    const el = document.createElement('div');
    el.className = `float-text ${extraClass}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 950);
}

function boardCenter() {
    const rect = board.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// --- Progress Saving & Loading (validated) ---
function saveProgress() {
    localStorage.setItem(KEY_MAX_LEVEL, String(maxUnlockedLevel));
}

function loadProgress() {
    maxUnlockedLevel = sanitizeInt(localStorage.getItem(KEY_MAX_LEVEL), 1, 1, TOTAL_LEVELS);
    bestEndlessScore = sanitizeInt(localStorage.getItem(KEY_HIGH_SCORE), 0, 0);
    levelResults = parseJSONSafe(localStorage.getItem(KEY_LEVEL_RESULTS), {});
    dailyResults = parseJSONSafe(localStorage.getItem(KEY_DAILY), {});
    muted = localStorage.getItem(KEY_MUTED) === 'true';
    updateMuteButton();
    loadCurrency();
    renderLevelSelect();
}

function saveLevelResults() {
    localStorage.setItem(KEY_LEVEL_RESULTS, JSON.stringify(levelResults));
}

function saveDaily() {
    localStorage.setItem(KEY_DAILY, JSON.stringify(dailyResults));
}

// --- Level Select Screen Rendering ---
function renderLevelSelect() {
    levelGrid.innerHTML = '';
    for (let i = 1; i <= TOTAL_LEVELS; i++) {
        const button = document.createElement('button');
        button.classList.add('level-button');
        if (i <= maxUnlockedLevel) {
            const result = levelResults[i];
            button.setAttribute('aria-label', result ? `Level ${i}, best ${result.score}, ${result.stars} stars` : `Level ${i}`);
            button.innerHTML = `<span>${i}</span>`;
            if (result) {
                const stars = document.createElement('span');
                stars.className = 'level-stars';
                stars.textContent = '★'.repeat(result.stars);
                button.appendChild(stars);
                button.classList.add('completed');
            }
            button.addEventListener('click', () => {
                gameMode = 'levels';
                init(i);
            });
        } else {
            button.classList.add('locked');
            button.innerHTML = `<svg class="lock-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z"></path></svg>`;
            button.disabled = true;
            button.setAttribute('aria-label', `Level ${i}, locked`);
        }
        levelGrid.appendChild(button);
    }
}

// --- Currency ---
function loadCurrency() {
    currency = sanitizeInt(localStorage.getItem(KEY_CURRENCY), 0, 0);
    updateCurrencyDisplay();
}

function saveCurrency() {
    localStorage.setItem(KEY_CURRENCY, String(currency));
}

function addCurrency(amount) {
    currency += amount;
    updateCurrencyDisplay();
    saveCurrency();
    updatePowerupButtons();
}

function spendCurrency(amount) {
    if (currency >= amount) {
        currency -= amount;
        updateCurrencyDisplay();
        saveCurrency();
        updatePowerupButtons();
        return true;
    }
    return false;
}

function updateCurrencyDisplay() {
    currencyDisplay.textContent = currency;
}

function updatePowerupButtons() {
    swapBlocksButton.disabled = currency < POWERUP_COSTS.swap;
    // While active, the button must stay clickable so the player can cancel
    // (and get a refund).
    bombButton.disabled = !isBombActive && currency < POWERUP_COSTS.bomb;
    hammerButton.disabled = !isHammerActive && currency < POWERUP_COSTS.hammer;
    bombButton.classList.toggle('active', isBombActive);
    hammerButton.classList.toggle('active', isHammerActive);
    undoButton.disabled = undoStack.length === 0 || currency < POWERUP_COSTS.undo;
    rotateButton.disabled = !selectedBlockId;
    rotateButton.classList.toggle('active', !!selectedBlockId);
}

// --- Power-ups ---
function activateSwapBlocks() {
    if (spendCurrency(POWERUP_COSTS.swap)) {
        pushUndo();
        clearSelection();
        generateNewBlocks();
        renderBlocks();
        updatePowerupButtons();
        sfx.coin();
    }
}

function toggleBomb() {
    if (isBombActive) {
        deactivateBomb(); // refund handled inside
    } else if (spendCurrency(POWERUP_COSTS.bomb)) {
        deactivateHammer(false);
        isBombActive = true;
        board.style.cursor = 'crosshair';
        updatePowerupButtons();
        sfx.coin();
    }
}

function deactivateBomb(refund = true) {
    if (!isBombActive) return;
    isBombActive = false;
    board.style.cursor = 'default';
    if (refund) addCurrency(POWERUP_COSTS.bomb); // no more money burned on cancel
    updatePowerupButtons();
}

function toggleHammer() {
    if (isHammerActive) {
        deactivateHammer();
    } else if (spendCurrency(POWERUP_COSTS.hammer)) {
        deactivateBomb(false);
        isHammerActive = true;
        board.style.cursor = 'crosshair';
        updatePowerupButtons();
        sfx.coin();
    }
}

function deactivateHammer(refund = true) {
    if (!isHammerActive) return;
    isHammerActive = false;
    board.style.cursor = 'default';
    if (refund) addCurrency(POWERUP_COSTS.hammer);
    updatePowerupButtons();
}

function useBomb(row, col) {
    if (!isBombActive) return;
    pushUndo();
    deactivateBomb(false); // consumed
    const { cleared, collected } = applyBomb(grid, row, col);
    score += cleared;
    mergeCollected(collected);
    updateScore();
    drawBoard();
    renderStoneGoals();
    const { x, y } = boardCenter();
    if (cleared > 0) {
        floatText(`+${cleared}`, x, y);
        sfx.place();
        vibrate(30);
    }
    afterTurn();
}

function useHammer(row, col) {
    if (!isHammerActive) return;
    if (!grid[row][col]) {
        sfx.invalid();
        return;
    }
    pushUndo();
    deactivateHammer(false); // consumed
    const { cleared, collected } = applyHammer(grid, row, col);
    score += cleared;
    mergeCollected(collected);
    updateScore();
    drawBoard();
    renderStoneGoals();
    const cellRect = cellEls[row][col].getBoundingClientRect();
    floatText(`+${cleared}`, cellRect.left + cellRect.width / 2, cellRect.top);
    sfx.place();
    vibrate(30);
    afterTurn();
}

function undoLast() {
    if (undoStack.length === 0) return;
    if (!spendCurrency(POWERUP_COSTS.undo)) return;
    const snap = undoStack.pop();
    grid = snap.grid;
    score = snap.score;
    currentBlocks = snap.currentBlocks;
    levelBlockIndex = snap.levelBlockIndex;
    collectedStones = snap.collectedStones;
    levelCompleted = false;
    clearSelection();
    deactivateBomb(false);
    deactivateHammer(false);
    drawBoard();
    renderBlocks();
    renderStoneGoals();
    updateScore();
    updatePowerupButtons();
    sfx.coin();
}

function rotateSelected() {
    if (!selectedBlockId) return;
    const block = currentBlocks.find(b => b.instanceId === selectedBlockId);
    if (!block) {
        clearSelection();
        return;
    }
    const rotated = rotateBlock(block);
    Object.assign(block, rotated);
    renderBlocks();
    sfx.place();
}

// --- Undo snapshots ---
function pushUndo() {
    undoStack.push({
        grid: cloneGrid(grid),
        score,
        currentBlocks: currentBlocks.map(b => ({ ...b, shape: b.shape.map(row => [...row]), stones: (b.stones || []).map(s => ({ ...s })) })),
        levelBlockIndex,
        collectedStones: { ...collectedStones },
    });
    if (undoStack.length > 10) undoStack.shift();
}

// --- Init / navigation ---
function showMainMenu() {
    deactivateBomb(); // refund if charged but unused
    deactivateHammer();
    clearSelection();
    gameContainer.classList.add('hidden');
    levelSelectMenu.classList.add('hidden');
    gameOverModal.classList.add('hidden');
    levelCompleteModal.classList.add('hidden');
    mainMenu.classList.remove('hidden');
    renderLevelSelect();
}

function init(levelNum = 1) {
    // Refund any charged-but-unused power-up on (re)start.
    if (isBombActive) addCurrency(POWERUP_COSTS.bomb);
    if (isHammerActive) addCurrency(POWERUP_COSTS.hammer);
    isBombActive = false;
    isHammerActive = false;

    mainMenu.classList.add('hidden');
    levelSelectMenu.classList.add('hidden');
    gameContainer.classList.remove('hidden');

    score = 0;
    updateScore();
    board.style.cursor = 'default';
    isAnimating = false;
    levelCompleted = false;
    undoStack = [];
    selectedBlockId = null;
    draggedBlockData = null;

    if (gameMode === 'levels') {
        currentLevelConfig = generateLevel(levelNum);
        currentLevel = levelNum;
        GRID_SIZE = currentLevelConfig.gridSize;
        grid = cloneGrid(currentLevelConfig.startGrid);
        levelBlockIndex = 0;
        levelLabel.textContent = 'LEVEL';
        collectedStones = {};
        Object.keys(currentLevelConfig.stoneGoal).forEach(id => { collectedStones[parseInt(id, 10)] = 0; });
    } else if (gameMode === 'daily') {
        const today = dayKey();
        currentLevelConfig = generateLevel(12, hashString(`daily-${today}`));
        currentLevel = new Date().getDate();
        GRID_SIZE = currentLevelConfig.gridSize;
        grid = cloneGrid(currentLevelConfig.startGrid);
        levelBlockIndex = 0;
        levelLabel.textContent = 'DAY';
        collectedStones = {};
        Object.keys(currentLevelConfig.stoneGoal).forEach(id => { collectedStones[parseInt(id, 10)] = 0; });
    } else {
        currentLevel = 1;
        levelLabel.textContent = 'LEVEL';
        GRID_SIZE = 10;
        grid = createEmptyGrid(GRID_SIZE);
        collectedStones = {};
        currentLevelConfig = null;
    }

    updateLevel();
    createBoard();
    drawBoard();
    renderStoneGoals();
    generateNewBlocks();
    renderBlocks();
    updatePowerupButtons();
    gameOverModal.classList.add('hidden');
    levelCompleteModal.classList.add('hidden');
}

function updateLevel() {
    levelDisplay.textContent = currentLevel;
}

// --- Board rendering (cells cached) ---
function createBoard() {
    board.innerHTML = '';
    cellEls = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
    board.style.gridTemplateColumns = `repeat(${GRID_SIZE}, 1fr)`;
    board.style.gridTemplateRows = `repeat(${GRID_SIZE}, 1fr)`;
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-cell');
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.setAttribute('role', 'gridcell');
            cell.setAttribute('aria-label', `Row ${r + 1}, column ${c + 1}`);
            board.appendChild(cell);
            cellEls[r][c] = cell;
        }
    }
}

function drawBoard() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const cell = cellEls[r][c];
            const cellData = grid[r][c];
            cell.style.backgroundColor = '';
            cell.style.backgroundImage = '';
            cell.style.opacity = '';
            cell.classList.remove('cell-with-background', 'locked-cell');
            if (cellData) {
                cell.style.backgroundColor = cellData.color;
                if (cellData.stone) {
                    const stoneInfo = STONES.find(s => s.id === cellData.stone.id);
                    if (stoneInfo) {
                        cell.style.backgroundImage = `url('${stoneInfo.icon}')`;
                        cell.classList.add('cell-with-background');
                    }
                }
                if (cellData.locked) cell.classList.add('locked-cell');
                cell.setAttribute('aria-disabled', 'true');
            } else {
                cell.removeAttribute('aria-disabled');
            }
        }
    }
}

function renderBlocks() {
    blockContainer.innerHTML = '';
    currentBlocks.forEach(block => {
        const blockEl = document.createElement('div');
        blockEl.classList.add('block-preview');
        if (block.instanceId === selectedBlockId) blockEl.classList.add('selected');
        blockEl.dataset.blockId = block.instanceId;
        blockEl.tabIndex = 0;
        blockEl.setAttribute('role', 'button');
        blockEl.setAttribute('aria-label', `Select ${block.shape[0].length} by ${block.shape.length} block`);
        blockEl.style.gridTemplateRows = `repeat(${block.shape.length}, 1fr)`;
        blockEl.style.gridTemplateColumns = `repeat(${block.shape[0].length}, 1fr)`;
        blockEl.style.width = `${block.shape[0].length * 18}px`;
        blockEl.style.height = `${block.shape.length * 18}px`;
        block.shape.forEach((row, r) => {
            row.forEach((cellValue, c) => {
                const cellEl = document.createElement('div');
                if (cellValue) {
                    const stone = (block.stones || []).find(s => s.r === r && s.c === c);
                    if (stone) {
                        const stoneInfo = STONES.find(s => s.id === stone.stoneId);
                        if (stoneInfo) {
                            cellEl.style.backgroundColor = block.color;
                            cellEl.style.backgroundImage = `url('${stoneInfo.icon}')`;
                            cellEl.classList.add('cell-with-background');
                        }
                    } else {
                        cellEl.style.backgroundColor = block.color;
                    }
                    cellEl.classList.add('block-cell');
                }
                blockEl.appendChild(cellEl);
            });
        });
        blockContainer.appendChild(blockEl);
    });
}

function drawPreview(block, startRow, startCol) {
    clearPreview();
    const isValid = canPlace(grid, block, startRow, startCol);
    for (let r = 0; r < block.shape.length; r++) {
        for (let c = 0; c < block.shape[r].length; c++) {
            if (block.shape[r][c]) {
                const gr = startRow + r;
                const gc = startCol + c;
                if (gr < GRID_SIZE && gc < GRID_SIZE && gr >= 0 && gc >= 0 && !grid[gr][gc]) {
                    const cell = cellEls[gr][gc];
                    cell.style.backgroundColor = isValid ? block.color : 'darkred';
                    cell.style.opacity = '0.6';
                }
            }
        }
    }
}

function clearPreview() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (!grid[r][c]) {
                cellEls[r][c].style.backgroundColor = '';
                cellEls[r][c].style.opacity = '';
            }
        }
    }
}

function generateNewBlocks() {
    currentBlocks = [];
    let generatedFromSequence = false;
    if (currentLevelConfig && currentLevelConfig.blocks && levelBlockIndex < currentLevelConfig.blocks.length) {
        const blockSequence = currentLevelConfig.blocks;
        const blocksToGenerate = blockSequence.slice(levelBlockIndex, levelBlockIndex + 3);
        if (blocksToGenerate.length > 0) {
            blocksToGenerate.forEach((blockInfo, index) => {
                const shape = SHAPES.find(s => s.id === blockInfo.shapeId);
                if (shape) {
                    currentBlocks.push({ ...shape, stones: blockInfo.stones || [], instanceId: `block-${Date.now()}-${levelBlockIndex + index}` });
                }
            });
            levelBlockIndex += blocksToGenerate.length;
            generatedFromSequence = true;
        }
    }
    if (!generatedFromSequence) {
        for (let i = 0; i < 3; i++) {
            const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
            currentBlocks.push({ ...shape, stones: [], instanceId: `block-${Date.now()}-${i}` });
        }
    }
}

// --- Turn resolution ---
function mergeCollected(collected) {
    for (const id in collected) {
        if (collectedStones[id] !== undefined) collectedStones[id] += collected[id];
    }
}

function commitPlacement(block, row, col) {
    pushUndo();
    const placedScore = placeBlockOnGrid(grid, block, row, col);
    score += placedScore;
    updateScore();
    currentBlocks = currentBlocks.filter(b => b.instanceId !== block.instanceId);
    const originalEl = blockContainer.querySelector(`[data-block-id="${block.instanceId}"]`);
    if (originalEl) originalEl.remove();
    clearSelection();
    drawBoard();
    sfx.place();
    vibrate(15);
    const anchor = cellEls[row][col].getBoundingClientRect();
    floatText(`+${placedScore}`, anchor.left + anchor.width / 2, anchor.top);
    resolveLines();
}

function resolveLines() {
    const lines = findFullLines(grid);
    const lineCount = lines.rows.length + lines.cols.length;
    if (lineCount === 0) {
        afterTurn();
        return;
    }
    // Flash the cleared cells, then apply the clear.
    isAnimating = true;
    const flashed = [];
    lines.rows.forEach(r => { for (let c = 0; c < GRID_SIZE; c++) flashed.push(cellEls[r][c]); });
    lines.cols.forEach(c => { for (let r = 0; r < GRID_SIZE; r++) if (!lines.rows.includes(r)) flashed.push(cellEls[r][c]); });
    flashed.forEach(el => el.classList.add('clearing'));
    setTimeout(() => {
        flashed.forEach(el => el.classList.remove('clearing'));
        const { collected, lineCount: n } = clearLines(grid, lines);
        const gained = lineClearScore(n);
        score += gained;
        mergeCollected(collected);
        if (gameMode === 'endless') addCurrency(10 * n); // endless earns coins
        updateScore();
        drawBoard();
        renderStoneGoals();
        const { x, y } = boardCenter();
        floatText(`+${gained}${n > 1 ? ` COMBO ×${n}` : ''}`, x, y, 'float-combo');
        sfx.clear();
        vibrate([30, 40, 30]);
        isAnimating = false;
        afterTurn();
    }, 220);
}

function afterTurn() {
    if (currentBlocks.length === 0) {
        generateNewBlocks();
        renderBlocks();
    }
    checkLevelComplete();
    if (!levelCompleted && !hasAnyPlacement(grid, currentBlocks)) {
        showGameOver();
    }
    updatePowerupButtons();
}

// --- Level / daily completion ---
function checkLevelComplete() {
    if (!currentLevelConfig || gameMode === 'endless' || levelCompleted) return;
    const scoreGoalMet = score >= currentLevelConfig.scoreGoal;
    let stoneGoalsMet = true;
    for (const stoneId in currentLevelConfig.stoneGoal) {
        if ((collectedStones[stoneId] || 0) < currentLevelConfig.stoneGoal[stoneId]) {
            stoneGoalsMet = false;
            break;
        }
    }
    if (!scoreGoalMet || !stoneGoalsMet) return;

    levelCompleted = true;
    const stars = calcStars(score, currentLevelConfig.scoreGoal);
    sfx.win();
    vibrate([40, 60, 40, 60, 80]);

    let rewardText = '';
    if (gameMode === 'levels') {
        const prev = levelResults[currentLevel];
        const firstTime = !prev;
        if (!prev || score > prev.score || stars > prev.stars) {
            levelResults[currentLevel] = {
                score: Math.max(score, prev ? prev.score : 0),
                stars: Math.max(stars, prev ? prev.stars : 0),
            };
            saveLevelResults();
        }
        // Reward is paid only the first time a level is completed.
        if (firstTime) {
            addCurrency(currentLevelConfig.currencyReward || 50);
            rewardText = ` +${currentLevelConfig.currencyReward || 50} coins!`;
        }
        const nextLevel = currentLevel + 1;
        if (nextLevel > maxUnlockedLevel && nextLevel <= TOTAL_LEVELS) {
            maxUnlockedLevel = nextLevel;
            saveProgress();
        }
        renderLevelSelect();
    } else if (gameMode === 'daily') {
        const today = dayKey();
        const rec = dailyResults[today] || { score: 0, stars: 0, rewardTaken: false };
        if (!rec.rewardTaken) {
            addCurrency(currentLevelConfig.currencyReward || 50);
            rec.rewardTaken = true;
            rewardText = ` +${currentLevelConfig.currencyReward || 50} coins!`;
        }
        rec.stars = Math.max(rec.stars, stars);
        rec.score = Math.max(rec.score, score);
        dailyResults[today] = rec;
        saveDaily();
    }

    renderStars(stars);
    document.getElementById('level-complete-message').textContent =
        `You earned ${stars} star${stars > 1 ? 's' : ''}!${rewardText}`;
    nextLevelButton.textContent = (gameMode === 'levels' && currentLevel < TOTAL_LEVELS) ? 'Next Level' : 'Back to Menu';
    levelCompleteModal.classList.remove('hidden');
}

function renderStars(stars) {
    modalStars.innerHTML = '';
    for (let i = 1; i <= 3; i++) {
        const span = document.createElement('span');
        span.className = 'star' + (i <= stars ? ' earned' : '');
        span.textContent = '★';
        modalStars.appendChild(span);
    }
}

function renderStoneGoals() {
    stoneGoalsContainer.innerHTML = '';
    if (!currentLevelConfig || !currentLevelConfig.stoneGoal) return;
    for (const stoneId in currentLevelConfig.stoneGoal) {
        const goal = currentLevelConfig.stoneGoal[stoneId];
        const current = collectedStones[stoneId] || 0;
        const stoneInfo = STONES.find(s => s.id == stoneId);
        if (stoneInfo) {
            const goalEl = document.createElement('div');
            goalEl.classList.add('stone-goal');
            if (current >= goal) goalEl.classList.add('goal-met');
            goalEl.innerHTML = `<img src="${stoneInfo.icon}" class="stone-goal-icon-img" alt="${stoneInfo.name}"> <span>${current} / ${goal}</span>`;
            stoneGoalsContainer.appendChild(goalEl);
        }
    }
}

function updateScore() {
    scoreDisplay.textContent = score;
}

function showGameOver() {
    finalScoreDisplay.textContent = score;
    if (gameMode === 'endless') {
        const isBest = score > bestEndlessScore;
        if (isBest) {
            bestEndlessScore = score;
            localStorage.setItem(KEY_HIGH_SCORE, String(bestEndlessScore));
        }
        bestScoreRow.classList.remove('hidden');
        bestScoreDisplay.textContent = bestEndlessScore;
        bestScoreRow.classList.toggle('new-best', isBest);
        document.querySelector('#game-over-modal h2').textContent = isBest ? 'New Best!' : 'Game Over';
    } else {
        bestScoreRow.classList.add('hidden');
        document.querySelector('#game-over-modal h2').textContent = 'Game Over';
    }
    sfx.over();
    vibrate([60, 80, 60]);
    gameOverModal.classList.remove('hidden');
}

// --- Selection (tap-to-select) ---
function clearSelection() {
    selectedBlockId = null;
    renderBlocks();
    updatePowerupButtons();
}

function toggleSelect(blockId) {
    selectedBlockId = selectedBlockId === blockId ? null : blockId;
    renderBlocks();
    updatePowerupButtons();
    if (selectedBlockId) sfx.place();
}

function getBlockById(id) {
    return currentBlocks.find(b => b.instanceId === id);
}

// --- Pointer-based drag & drop (unifies mouse + touch) ---
let pointerState = null;
let lastTargetCell = null;

function getCellFromCoordinates(x, y) {
    if (draggedElement) draggedElement.style.display = 'none';
    const elementUnder = document.elementFromPoint(x, y);
    if (draggedElement) draggedElement.style.display = '';
    return elementUnder ? elementUnder.closest('.grid-cell') : null;
}

function positionDraggedElement(x, y) {
    if (draggedElement) {
        draggedElement.style.left = `${x - draggedElement.offsetWidth / 2}px`;
        draggedElement.style.top = `${y - draggedElement.offsetHeight / 2}px`;
    }
}

function startDrag(e) {
    const blockElement = e.target.closest('[data-block-id]');
    if (!blockElement || isBombActive || isHammerActive || isAnimating) return;
    const block = getBlockById(blockElement.dataset.blockId);
    if (!block) return;
    pointerState = { block, element: blockElement, startX: e.clientX, startY: e.clientY, dragging: false, pointerId: e.pointerId };
}

function moveDrag(e) {
    if (!pointerState) return;
    const dx = e.clientX - pointerState.startX;
    const dy = e.clientY - pointerState.startY;
    if (!pointerState.dragging) {
        if (Math.hypot(dx, dy) < 6) return;
        pointerState.dragging = true;
        draggedBlockData = pointerState.block;
        draggedElement = pointerState.element.cloneNode(true);
        draggedElement.style.position = 'absolute';
        draggedElement.style.zIndex = '1000';
        draggedElement.style.pointerEvents = 'none';
        document.body.appendChild(draggedElement);
        positionDraggedElement(e.clientX, e.clientY);
        pointerState.element.style.opacity = '0.4';
    }
    positionDraggedElement(e.clientX, e.clientY);
    const targetCell = getCellFromCoordinates(e.clientX, e.clientY);
    if (targetCell && targetCell !== lastTargetCell) {
        lastTargetCell = targetCell;
        drawPreview(draggedBlockData, parseInt(targetCell.dataset.row), parseInt(targetCell.dataset.col));
    } else if (!targetCell) {
        clearPreview();
        lastTargetCell = null;
    }
}

function endDrag(e) {
    if (!pointerState) return;
    const state = pointerState;
    pointerState = null;
    if (state.dragging) {
        let placed = false;
        if (lastTargetCell && draggedBlockData) {
            const row = parseInt(lastTargetCell.dataset.row);
            const col = parseInt(lastTargetCell.dataset.col);
            if (canPlace(grid, draggedBlockData, row, col)) {
                commitPlacement(draggedBlockData, row, col);
                placed = true;
            }
        }
        clearPreview();
        lastTargetCell = null;
        if (draggedElement) {
            draggedElement.remove();
            draggedElement = null;
        }
        if (!placed) {
            state.element.style.opacity = '1';
            sfx.invalid();
        }
        draggedBlockData = null;
    } else {
        // Tap without movement → select/deselect.
        toggleSelect(state.block.instanceId);
    }
}

function tryPlaceSelected(row, col) {
    const block = getBlockById(selectedBlockId);
    if (!block) {
        clearSelection();
        return;
    }
    if (!canPlace(grid, block, row, col)) {
        sfx.invalid();
        const cellRect = cellEls[row][col].getBoundingClientRect();
        floatText('✗', cellRect.left + cellRect.width / 2, cellRect.top, 'float-bad');
        return;
    }
    commitPlacement(block, row, col);
}

// --- Keyboard play ---
function moveCursor(dr, dc) {
    cursorPos.r = Math.min(Math.max(cursorPos.r + dr, 0), GRID_SIZE - 1);
    cursorPos.c = Math.min(Math.max(cursorPos.c + dc, 0), GRID_SIZE - 1);
    drawCursor();
}

function drawCursor() {
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            cellEls[r][c].classList.toggle('cursor-cell', r === cursorPos.r && c === cursorPos.c);
        }
    }
}

let cursorPos = { r: 0, c: 0 };

// --- Event Listeners ---
levelsButton.addEventListener('click', () => {
    mainMenu.classList.add('hidden');
    levelSelectMenu.classList.remove('hidden');
});

endlessButton.addEventListener('click', () => {
    gameMode = 'endless';
    init();
});

dailyButton.addEventListener('click', () => {
    gameMode = 'daily';
    init();
});

backToMainMenuButton.addEventListener('click', showMainMenu);
homeButton.addEventListener('click', showMainMenu);
modalMenuButtons.forEach(btn => btn.addEventListener('click', showMainMenu));

muteButton.addEventListener('click', () => {
    muted = !muted;
    localStorage.setItem(KEY_MUTED, String(muted));
    updateMuteButton();
});

function updateMuteButton() {
    muteButton.textContent = muted ? '🔇' : '🔊';
    muteButton.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
}

restartButton.addEventListener('click', () => init(currentLevel));
modalRestartButton.addEventListener('click', () => init(currentLevel));

nextLevelButton.addEventListener('click', () => {
    if (gameMode === 'levels' && currentLevel < TOTAL_LEVELS) {
        init(currentLevel + 1);
    } else {
        showMainMenu();
    }
});

blockContainer.addEventListener('pointerdown', startDrag);
document.addEventListener('pointermove', moveDrag);
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
// Prevent page scroll while a drag is in progress on touch devices.
document.addEventListener('touchmove', e => { if (pointerState) e.preventDefault(); }, { passive: false });

blockContainer.addEventListener('keydown', e => {
    const blockElement = e.target.closest('[data-block-id]');
    if (!blockElement) return;
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleSelect(blockElement.dataset.blockId);
    }
});

swapBlocksButton.addEventListener('click', activateSwapBlocks);
bombButton.addEventListener('click', toggleBomb);
hammerButton.addEventListener('click', toggleHammer);
undoButton.addEventListener('click', undoLast);
rotateButton.addEventListener('click', rotateSelected);

board.addEventListener('click', e => {
    const cell = e.target.closest('.grid-cell');
    if (!cell || isAnimating) return;
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    cursorPos = { r: row, c: col };
    drawCursor();
    if (isBombActive) {
        useBomb(row, col);
    } else if (isHammerActive) {
        useHammer(row, col);
    } else if (selectedBlockId) {
        tryPlaceSelected(row, col);
    }
});

board.addEventListener('keydown', e => {
    const keys = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (keys[e.key]) {
        e.preventDefault();
        moveCursor(...keys[e.key]);
    } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isBombActive) useBomb(cursorPos.r, cursorPos.c);
        else if (isHammerActive) useHammer(cursorPos.r, cursorPos.c);
        else if (selectedBlockId) tryPlaceSelected(cursorPos.r, cursorPos.c);
    } else if (e.key === 'r' || e.key === 'R') {
        rotateSelected();
    } else if (e.key === 'Escape') {
        clearSelection();
        deactivateBomb();
        deactivateHammer();
    }
});

document.addEventListener('keydown', e => {
    if (e.key === 'r' || e.key === 'R') {
        if (selectedBlockId && document.activeElement !== board) rotateSelected();
    }
});

// --- Initial Load ---
loadProgress();

// --- Service worker (PWA, served over http(s) only) ---
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => { /* offline-first not available */ });
    });
}
