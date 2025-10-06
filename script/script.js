document.addEventListener('DOMContentLoaded', () => {
    // --- Elements ---
    const mainMenu = document.getElementById('main-menu');
    const gameContainer = document.getElementById('game-container');
    const levelsButton = document.getElementById('levels-button');
    const endlessButton = document.getElementById('endless-button');
    const board = document.getElementById('game-board');
    const scoreDisplay = document.getElementById('score');
    const levelDisplay = document.getElementById('level');
    const blockContainer = document.getElementById('block-container');
    const gameOverModal = document.getElementById('game-over-modal');
    const finalScoreDisplay = document.getElementById('final-score');
    const restartButton = document.getElementById('restart-button');
    const modalRestartButton = document.getElementById('modal-restart-button');
    const levelCompleteModal = document.getElementById('level-complete-modal');
    const nextLevelButton = document.getElementById('next-level-button');
    const stoneGoalsContainer = document.getElementById('stone-goals-container');
    const currencyDisplay = document.getElementById('currency-display');
    const swapBlocksButton = document.getElementById('swap-blocks-powerup');
    const bombButton = document.getElementById('bomb-powerup');

    // --- Game State ---
    let GRID_SIZE = 10;
    let grid = [];
    let score = 0;
    let currentBlocks = [];
    let draggedBlockData = null;
    let draggedElement = null;
    let gameMode = 'endless';
    let currentLevel = 1;
    let levelBlockIndex = 0;
    let collectedStones = {};
    let lastTargetCell = null;
    let currency = 0;
    let isBombActive = false;
    let currentLevelConfig = null;
    const generatedLevels = {};

    // --- Game Constants ---
    const STONES = [
        { id: 0, name: 'Ruby', icon: 'assets/gemstone_ruby.png' },
        { id: 1, name: 'Sapphire', icon: 'assets/gemstone_sapphire.png' },
        { id: 2, name: 'Emerald', icon: 'assets/gemstone_emerald.png' },
        { id: 3, name: 'Amethyst', icon: 'assets/gemstone_amethyst.png' },
        { id: 4, name: 'Diamond', icon: 'assets/gemstone_diamond.png' },
        { id: 5, name: 'Stone', icon: 'assets/gemstone_stone.png' },
    ];

    const SHAPES = [
        { shape: [[1, 1, 1, 1]], color: 'cyan', id: 0 },
        { shape: [[1, 1], [1, 1]], color: 'yellow', id: 1 },
        { shape: [[0, 1, 0], [1, 1, 1]], color: 'purple', id: 2 },
        { shape: [[0, 0, 1], [1, 1, 1]], color: 'blue', id: 3 },
        { shape: [[1, 0, 0], [1, 1, 1]], color: 'orange', id: 4 },
        { shape: [[0, 1, 1], [1, 1, 0]], color: 'green', id: 5 },
        { shape: [[1, 1, 0], [0, 1, 1]], color: 'red', id: 6 },
        { shape: [[1]], color: 'pink', id: 7 },
        { shape: [[1, 1]], color: 'lightblue', id: 8 },
        { shape: [[1], [1]], color: 'lightgreen', id: 9 },
    ];
    
    const POWERUP_COSTS = {
        swap: 50,
        bomb: 100,
    };

    function generateLevel(levelNumber) {
        const level = {};
        
        level.level = levelNumber;
        level.gridSize = Math.min(10, 5 + Math.floor(levelNumber / 4));
        level.scoreGoal = 50 + (levelNumber * 15);
        level.currencyReward = 75 + (levelNumber * 5);
        
        level.stoneGoal = {};
        const numberOfGoalTypes = (levelNumber > 10) ? 2 : 1;
        
        for(let i = 0; i < numberOfGoalTypes; i++) {
            const randomStoneId = Math.floor(Math.random() * 5);
            if(!level.stoneGoal[randomStoneId]) {
                const amount = 2 + Math.floor(levelNumber / 2);
                level.stoneGoal[randomStoneId] = amount;
            }
        }

        level.startGrid = Array(level.gridSize).fill(null).map(() => Array(level.gridSize).fill(null));
        const requiredStones = { ...level.stoneGoal };
        const stoneIdsToPlace = Object.keys(requiredStones);

        stoneIdsToPlace.forEach(stoneId => {
            let amountToPlace = requiredStones[stoneId];
            let attempts = 0;
            while(amountToPlace > 0 && attempts < 100) {
                const r = Math.floor(Math.random() * level.gridSize);
                const c = Math.floor(Math.random() * level.gridSize);

                if (!level.startGrid[r][c]) {
                    level.startGrid[r][c] = {
                        color: '#4a4e69',
                        stone: { id: parseInt(stoneId) },
                        locked: true
                    };
                    amountToPlace--;
                }
                attempts++;
            }
        });

        level.blocks = [];
        for (let i = 0; i < 30; i++) {
            const shapeId = Math.floor(Math.random() * SHAPES.length);
            level.blocks.push({ shapeId, stones: [] });
        }

        return level;
    }
    
    function loadCurrency() { 
        const savedCurrency = localStorage.getItem('blockPuzzleCurrency');
        currency = savedCurrency ? parseInt(savedCurrency, 10) : 0;
        updateCurrencyDisplay();
    }

    function saveCurrency() {
        localStorage.setItem('blockPuzzleCurrency', currency);
    }

    function addCurrency(amount) {
        currency += amount;
        updateCurrencyDisplay();
        saveCurrency();
        updatePowerupButtons();
    }

    function updateCurrencyDisplay() {
        currencyDisplay.textContent = currency;
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

    function updatePowerupButtons() {
        swapBlocksButton.disabled = currency < POWERUP_COSTS.swap;
        bombButton.disabled = currency < POWERUP_COSTS.bomb;
    }

    function activateSwapBlocks() {
        if (spendCurrency(POWERUP_COSTS.swap)) {
            generateNewBlocks();
            renderBlocks();
        }
    }

    function activateBomb() {
        if (isBombActive) {
            isBombActive = false;
            board.style.cursor = 'default';
        } else if (spendCurrency(POWERUP_COSTS.bomb)) {
            isBombActive = true;
            board.style.cursor = 'crosshair';
        }
    }

    function useBomb(row, col) {
        if (!isBombActive) return;

        let bombScore = 0;
        for (let r = row - 1; r <= row + 1; r++) {
            for (let c = col - 1; c <= col + 1; c++) {
                if (r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE && grid[r][c]) {
                    if (grid[r][c].stone && collectedStones[grid[r][c].stone.id] !== undefined) {
                        collectedStones[grid[r][c].stone.id]++;
                    }
                    grid[r][c] = null;
                    bombScore++;
                }
            }
        }
        score += bombScore;
        updateScore();
        drawBoard();
        renderStoneGoals();
        checkLevelComplete();

        isBombActive = false;
        board.style.cursor = 'default';
    }

    function init(levelNum = 1) {
        mainMenu.classList.add('hidden');
        gameContainer.classList.remove('hidden');
        
        score = 0;
        updateScore();
        loadCurrency();
        updatePowerupButtons();
        isBombActive = false;
        board.style.cursor = 'default';

        if (gameMode === 'levels') {
            currentLevelConfig = generatedLevels[levelNum];
            
            if (!currentLevelConfig) {
                currentLevelConfig = generateLevel(levelNum);
                generatedLevels[levelNum] = currentLevelConfig;
            }

            currentLevel = levelNum;
            GRID_SIZE = currentLevelConfig.gridSize;
            grid = JSON.parse(JSON.stringify(currentLevelConfig.startGrid));
            levelBlockIndex = 0;
            collectedStones = {};
            if (currentLevelConfig.stoneGoal) {
                Object.keys(currentLevelConfig.stoneGoal).forEach(stoneId => {
                    collectedStones[parseInt(stoneId)] = 0;
                });
            }
        } else {
            currentLevel = 1;
            GRID_SIZE = 10;
            grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
            collectedStones = {};
            currentLevelConfig = null;
        }

        updateLevel();
        createBoard();
        drawBoard();
        renderStoneGoals();
        generateNewBlocks();
        renderBlocks();

        gameOverModal.classList.add('hidden');
        levelCompleteModal.classList.add('hidden');
    }
    
    function createBoard() {
        board.innerHTML = '';
        board.style.gridTemplateColumns = `repeat(${GRID_SIZE}, 1fr)`;
        board.style.gridTemplateRows = `repeat(${GRID_SIZE}, 1fr)`;
        for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-cell');
            cell.dataset.row = Math.floor(i / GRID_SIZE);
            cell.dataset.col = i % GRID_SIZE;
            board.appendChild(cell);
        }
    }

    function drawBoard() {
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                const cell = board.querySelector(`[data-row='${r}'][data-col='${c}']`);
                const cellData = grid[r][c];
                
                cell.style.backgroundColor = '';
                cell.style.backgroundImage = '';
                cell.classList.remove('cell-with-background', 'locked-cell');

                if (cellData) {
                    const color = cellData.color;
                    if (cellData.stone) {
                        const stoneInfo = STONES.find(s => s.id === cellData.stone.id);
                        if (stoneInfo) {
                            cell.style.backgroundColor = color;
                            cell.style.backgroundImage = `url('${stoneInfo.icon}')`;
                            cell.classList.add('cell-with-background');
                        }
                    } else {
                        cell.style.backgroundColor = color;
                    }
                    if (cellData.locked) {
                        cell.classList.add('locked-cell');
                    }
                }
            }
        }
    }

    function renderBlocks() {
        blockContainer.innerHTML = '';
        currentBlocks.forEach(block => {
            const blockEl = document.createElement('div');
            blockEl.classList.add('block-preview');
            blockEl.dataset.blockId = block.instanceId;
            blockEl.style.gridTemplateRows = `repeat(${block.shape.length}, 1fr)`;
            blockEl.style.gridTemplateColumns = `repeat(${block.shape[0].length}, 1fr)`;
            blockEl.style.width = `${block.shape[0].length * 18}px`;
            blockEl.style.height = `${block.shape.length * 18}px`;
            
            block.shape.forEach((row, r) => {
                row.forEach((cellValue, c) => {
                    const cellEl = document.createElement('div');
                    if (cellValue) {
                        const stone = block.stones.find(s => s.r === r && s.c === c);
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
        const isValid = isValidPlacement(block, startRow, startCol);
        for (let r = 0; r < block.shape.length; r++) {
            for (let c = 0; c < block.shape[r].length; c++) {
                if (block.shape[r][c]) {
                    const gridRow = startRow + r;
                    const gridCol = startCol + c;
                    if (gridRow < GRID_SIZE && gridCol < GRID_SIZE && gridRow >= 0 && gridCol >= 0) {
                        const cell = board.querySelector(`[data-row='${gridRow}'][data-col='${gridCol}']`);
                        if (cell && !grid[gridRow][gridCol]) {
                            cell.style.backgroundColor = isValid ? block.color : 'darkred';
                            cell.style.opacity = '0.6';
                        }
                    }
                }
            }
        }
    }

    function clearPreview() {
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (!grid[r][c]) {
                    const cell = board.querySelector(`[data-row='${r}'][data-col='${c}']`);
                    cell.style.backgroundColor = '';
                    cell.style.opacity = '1';
                }
            }
        }
    }

    function generateNewBlocks() {
        currentBlocks = [];
        let generatedFromSequence = false;
        
        if (gameMode === 'levels' && currentLevelConfig && currentLevelConfig.blocks && levelBlockIndex < currentLevelConfig.blocks.length) {
            const blockSequence = currentLevelConfig.blocks;
            const blocksToGenerate = blockSequence.slice(levelBlockIndex, levelBlockIndex + 3);
            
            if (blocksToGenerate.length > 0) {
                blocksToGenerate.forEach((blockInfo, index) => {
                    const shape = SHAPES.find(s => s.id === blockInfo.shapeId);
                    if (shape) {
                        currentBlocks.push({ ...shape, stones: blockInfo.stones || [], instanceId: `block-${Date.now()}-${index}` });
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

    function isValidPlacement(block, startRow, startCol) {
        for (let r = 0; r < block.shape.length; r++) {
            for (let c = 0; c < block.shape[r].length; c++) {
                if (block.shape[r][c]) {
                    const gridRow = startRow + r;
                    const gridCol = startCol + c;
                    if (gridRow >= GRID_SIZE || gridCol >= GRID_SIZE || gridRow < 0 || gridCol < 0 || grid[gridRow][gridCol]) {
                        return false;
                    }
                }
            }
        }
        return true;
    }
    
    function placeBlock(block, startRow, startCol) {
        let blockScore = 0;
        block.shape.forEach((row, r) => {
            row.forEach((cell, c) => {
                if (cell) {
                    const stone = block.stones.find(s => s.r === r && s.c === c);
                    grid[startRow + r][startCol + c] = {
                        color: block.color,
                        stone: stone ? { id: stone.stoneId } : null
                    };
                    blockScore++;
                }
            });
        });
        score += blockScore;
        updateScore();
        drawBoard();
    }

    function checkForLineClears() {
        let rowsToClear = [];
        let colsToClear = [];

        for (let r = 0; r < GRID_SIZE; r++) {
            if (grid[r].every(cell => cell !== null)) {
                rowsToClear.push(r);
            }
        }

        for (let c = 0; c < GRID_SIZE; c++) {
            let fullCol = true;
            for (let r = 0; r < GRID_SIZE; r++) {
                if (grid[r][c] === null) {
                    fullCol = false;
                    break;
                }
            }
            if (fullCol) {
                colsToClear.push(c);
            }
        }

        const linesCleared = rowsToClear.length + colsToClear.length;

        if (linesCleared > 0) {
            score += 100 * linesCleared * linesCleared;

            rowsToClear.forEach(r => {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (grid[r][c]?.stone && collectedStones[grid[r][c].stone.id] !== undefined) {
                        collectedStones[grid[r][c].stone.id]++;
                    }
                }
            });

            colsToClear.forEach(c => {
                for (let r = 0; r < GRID_SIZE; r++) {
                    if (!rowsToClear.includes(r) && grid[r][c]?.stone && collectedStones[grid[r][c].stone.id] !== undefined) {
                        collectedStones[grid[r][c].stone.id]++;
                    }
                }
            });

            rowsToClear.forEach(r => {
                for (let c = 0; c < GRID_SIZE; c++) grid[r][c] = null;
            });
            colsToClear.forEach(c => {
                for (let r = 0; r < GRID_SIZE; r++) grid[r][c] = null;
            });

            updateScore();
            drawBoard();
            renderStoneGoals();
            checkLevelComplete();
        }
    }
    
    function isGameOver() {
        if (currentBlocks.length === 0) return false;
        for (const block of currentBlocks) {
            for (let r = 0; r < GRID_SIZE; r++) {
                for (let c = 0; c < GRID_SIZE; c++) {
                    if (isValidPlacement(block, r, c)) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    function checkLevelComplete() {
        if (gameMode !== 'levels' || !currentLevelConfig) return;
        
        const scoreGoalMet = score >= currentLevelConfig.scoreGoal;
        let stoneGoalsMet = true;
        
        if (currentLevelConfig.stoneGoal) {
            for (const stoneId in currentLevelConfig.stoneGoal) {
                if (collectedStones[stoneId] < currentLevelConfig.stoneGoal[stoneId]) {
                    stoneGoalsMet = false;
                    break;
                }
            }
        }
        
        if (scoreGoalMet && stoneGoalsMet) {
            addCurrency(currentLevelConfig.currencyReward || 50);
            levelCompleteModal.classList.remove('hidden');
        }
    }

    function updateScore() { scoreDisplay.textContent = score; }
    function updateLevel() { levelDisplay.textContent = currentLevel; }

    function renderStoneGoals() {
        stoneGoalsContainer.innerHTML = '';
        if (gameMode !== 'levels' || !currentLevelConfig || !currentLevelConfig.stoneGoal) return;
        
        for (const stoneId in currentLevelConfig.stoneGoal) {
            const goal = currentLevelConfig.stoneGoal[stoneId];
            const current = collectedStones[stoneId];
            const stoneInfo = STONES.find(s => s.id == stoneId);
            if (stoneInfo) {
                const goalEl = document.createElement('div');
                goalEl.classList.add('stone-goal');
                goalEl.innerHTML = `<img src="${stoneInfo.icon}" class="stone-goal-icon-img" alt="${stoneInfo.name}"> <span>${current} / ${goal}</span>`;
                stoneGoalsContainer.appendChild(goalEl);
            }
        }
    }

    function showGameOver() {
        finalScoreDisplay.textContent = score;
        gameOverModal.classList.remove('hidden');
    }

    function getCellFromCoordinates(x, y) {
        if (draggedElement) draggedElement.style.display = 'none';
        const elementUnder = document.elementFromPoint(x, y);
        if (draggedElement) draggedElement.style.display = '';
        
        return elementUnder ? elementUnder.closest('.grid-cell') : null;
    }

    function handleDragStart(e) {
        const blockElement = e.target.closest('[data-block-id]');
        if (!blockElement || isBombActive) return;

        draggedBlockData = currentBlocks.find(b => b.instanceId === blockElement.dataset.blockId);
        if (!draggedBlockData) return;

        draggedElement = blockElement.cloneNode(true);
        draggedElement.style.position = 'absolute';
        draggedElement.style.zIndex = '1000';
        draggedElement.style.pointerEvents = 'none';
        document.body.appendChild(draggedElement);

        const isTouchEvent = e.type === 'touchstart';
        if (isTouchEvent) e.preventDefault();
        const touch = isTouchEvent ? e.touches[0] : null;
        const clientX = isTouchEvent ? touch.clientX : e.clientX;
        const clientY = isTouchEvent ? touch.clientY : e.clientY;
        
        positionDraggedElement(clientX, clientY);
        
        blockElement.style.opacity = '0.4';
    }

    function handleDragMove(e) {
        if (!draggedBlockData) return;
        
        const isTouchEvent = e.type === 'touchmove';
        if (isTouchEvent) e.preventDefault();

        const clientX = isTouchEvent ? e.touches[0].clientX : e.clientX;
        const clientY = isTouchEvent ? e.touches[0].clientY : e.clientY;
        
        positionDraggedElement(clientX, clientY);
        
        const targetCell = getCellFromCoordinates(clientX, clientY);
        
        if (targetCell && targetCell !== lastTargetCell) {
            lastTargetCell = targetCell;
            const row = parseInt(targetCell.dataset.row);
            const col = parseInt(targetCell.dataset.col);
            drawPreview(draggedBlockData, row, col);
        } else if (!targetCell) {
            clearPreview();
            lastTargetCell = null;
        }
    }

    function handleDragEnd(e) {
        if (!draggedBlockData) return;

        const isTouchEvent = e.type === 'touchend';
        if (isTouchEvent) e.preventDefault();

        let dropSuccessful = false;
        
        if (lastTargetCell) {
            const row = parseInt(lastTargetCell.dataset.row);
            const col = parseInt(lastTargetCell.dataset.col);
            if (isValidPlacement(draggedBlockData, row, col)) {
                placeBlock(draggedBlockData, row, col);
                
                currentBlocks = currentBlocks.filter(b => b.instanceId !== draggedBlockData.instanceId);
                const originalBlockEl = blockContainer.querySelector(`[data-block-id="${draggedBlockData.instanceId}"]`);
                if (originalBlockEl) originalBlockEl.remove();

                checkForLineClears();

                if (currentBlocks.length === 0) {
                    generateNewBlocks();
                    renderBlocks();
                }

                if (isGameOver()) {
                    showGameOver();
                }
                dropSuccessful = true;
            }
        }
        
        clearPreview();
        lastTargetCell = null;
        if (draggedElement) {
            draggedElement.remove();
            draggedElement = null;
        }

        if (!dropSuccessful) {
            const originalBlock = blockContainer.querySelector(`[data-block-id="${draggedBlockData.instanceId}"]`);
            if (originalBlock) {
                originalBlock.style.opacity = '1';
            }
        }
        
        draggedBlockData = null;
    }
    
    function positionDraggedElement(x, y) {
        if (draggedElement) {
            draggedElement.style.left = `${x - draggedElement.offsetWidth / 2}px`;
            draggedElement.style.top = `${y - draggedElement.offsetHeight / 2}px`;
        }
    }

    // --- Event Listeners ---
    levelsButton.addEventListener('click', () => {
        gameMode = 'levels';
        init(1);
    });

    endlessButton.addEventListener('click', () => {
        gameMode = 'endless';
        init();
    });

    restartButton.addEventListener('click', () => init(currentLevel));
    modalRestartButton.addEventListener('click', () => {
        init(gameMode === 'levels' ? currentLevel : 1);
    });

    nextLevelButton.addEventListener('click', () => {
        init(currentLevel + 1);
    });
    
    blockContainer.addEventListener('mousedown', handleDragStart);
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
    
    blockContainer.addEventListener('touchstart', handleDragStart, { passive: false });
    document.addEventListener('touchmove', handleDragMove, { passive: false });
    document.addEventListener('touchend', handleDragEnd);

    swapBlocksButton.addEventListener('click', activateSwapBlocks);
    bombButton.addEventListener('click', activateBomb);

    board.addEventListener('click', (e) => {
        if (isBombActive) {
            const cell = e.target.closest('.grid-cell');
            if (cell) {
                const row = parseInt(cell.dataset.row);
                const col = parseInt(cell.dataset.col);
                useBomb(row, col);
            }
        }
    });
});