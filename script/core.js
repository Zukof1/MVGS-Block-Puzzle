// core.js — pure game logic, no DOM access. Unit-tested.

export const TOTAL_LEVELS = 30;

export const STONES = [
    { id: 0, name: 'Ruby', icon: 'assets/gemstone_ruby.png' },
    { id: 1, name: 'Sapphire', icon: 'assets/gemstone_sapphire.png' },
    { id: 2, name: 'Emerald', icon: 'assets/gemstone_emerald.png' },
    { id: 3, name: 'Amethyst', icon: 'assets/gemstone_amethyst.png' },
    { id: 4, name: 'Diamond', icon: 'assets/gemstone_diamond.png' },
    { id: 5, name: 'Stone', icon: 'assets/gemstone_stone.png' },
];

export const SHAPES = [
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

export const POWERUP_COSTS = { swap: 50, bomb: 100, hammer: 150, undo: 25 };

// --- Seeded RNG (mulberry32) ---
export function mulberry32(seed) {
    let t = seed >>> 0;
    return function () {
        t = (t + 0x6d2b79f5) >>> 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

export function hashString(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    }
    return h;
}

export function dayKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function shuffleWith(rng, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// --- Level generation (deterministic for a given seed) ---
// Defaults to seed derived from the level number so "Level 7" is the same
// board every session. Pass an explicit seedOverride for daily challenges.
export function generateLevel(levelNumber, seedOverride) {
    const seed = (seedOverride ?? Math.imul(levelNumber, 0x9e3779b1)) >>> 0;
    const rng = mulberry32(seed);

    const level = { level: levelNumber, seed };
    level.gridSize = Math.min(10, 5 + Math.floor(levelNumber / 4));
    level.scoreGoal = 50 + levelNumber * 15;
    level.currencyReward = 75 + levelNumber * 5;

    // Distinct goal stone types: 1 type up to level 10, 2 types after.
    // Cap per-type stones so the board never fills up completely (which would
    // make the level unplayable). Levels 1-30 are unaffected by the cap.
    const numberOfGoalTypes = levelNumber > 10 ? 2 : 1;
    const maxPerType = Math.floor((level.gridSize * level.gridSize) / numberOfGoalTypes / 2);
    const stonesPerType = Math.max(1, Math.min(2 + Math.floor(levelNumber / 2), maxPerType));
    const shuffledStoneIds = shuffleWith(rng, [0, 1, 2, 3, 4]);
    level.stoneGoal = {};
    for (let i = 0; i < numberOfGoalTypes; i++) {
        level.stoneGoal[shuffledStoneIds[i]] = stonesPerType;
    }

    // Start grid: place locked goal stones on a shuffled cell list so every
    // required stone is guaranteed a spot (no unwinnable levels).
    level.startGrid = Array.from({ length: level.gridSize }, () => Array(level.gridSize).fill(null));
    const spots = [];
    for (let r = 0; r < level.gridSize; r++) {
        for (let c = 0; c < level.gridSize; c++) spots.push([r, c]);
    }
    shuffleWith(rng, spots);
    let spotIndex = 0;
    for (const stoneId of Object.keys(level.stoneGoal)) {
        for (let k = 0; k < level.stoneGoal[stoneId]; k++) {
            const [r, c] = spots[spotIndex++];
            level.startGrid[r][c] = { color: '#4a4e69', stone: { id: parseInt(stoneId, 10) }, locked: true };
        }
    }

    // Fixed 30-block sequence per level. From level 5 on, some blocks carry a
    // goal stone so stone goals can also be earned through play.
    const goalStoneIds = Object.keys(level.stoneGoal).map(Number);
    level.blocks = [];
    for (let i = 0; i < 30; i++) {
        const shape = SHAPES[Math.floor(rng() * SHAPES.length)];
        const stones = [];
        if (levelNumber >= 5 && rng() < 0.35) {
            const positions = [];
            shape.shape.forEach((row, r) => row.forEach((v, c) => { if (v) positions.push({ r, c }); }));
            const pos = positions[Math.floor(rng() * positions.length)];
            stones.push({ r: pos.r, c: pos.c, stoneId: goalStoneIds[Math.floor(rng() * goalStoneIds.length)] });
        }
        level.blocks.push({ shapeId: shape.id, stones });
    }
    return level;
}

// --- Grid helpers ---
export function createEmptyGrid(size) {
    return Array.from({ length: size }, () => Array(size).fill(null));
}

export function cloneGrid(grid) {
    return grid.map(row => row.map(cell => (cell ? { ...cell, stone: cell.stone ? { ...cell.stone } : null } : null)));
}

export function canPlace(grid, block, startRow, startCol) {
    const size = grid.length;
    for (let r = 0; r < block.shape.length; r++) {
        for (let c = 0; c < block.shape[r].length; c++) {
            if (block.shape[r][c]) {
                const gr = startRow + r;
                const gc = startCol + c;
                if (gr >= size || gc >= size || gr < 0 || gc < 0 || grid[gr][gc]) return false;
            }
        }
    }
    return true;
}

// Mutates grid. Returns the number of cells placed.
export function placeBlockOnGrid(grid, block, startRow, startCol) {
    let placed = 0;
    block.shape.forEach((row, r) => {
        row.forEach((cell, c) => {
            if (cell) {
                const stone = block.stones.find(s => s.r === r && s.c === c);
                grid[startRow + r][startCol + c] = { color: block.color, stone: stone ? { id: stone.stoneId } : null };
                placed++;
            }
        });
    });
    return placed;
}

export function findFullLines(grid) {
    const size = grid.length;
    const rows = [];
    const cols = [];
    for (let r = 0; r < size; r++) {
        if (grid[r].every(Boolean)) rows.push(r);
    }
    for (let c = 0; c < size; c++) {
        let full = true;
        for (let r = 0; r < size; r++) {
            if (!grid[r][c]) { full = false; break; }
        }
        if (full) cols.push(c);
    }
    return { rows, cols };
}

// Mutates grid: nulls out full rows/cols. Returns cleared cell count and
// stones collected ({stoneId: count}); intersection cells are counted once.
export function clearLines(grid, lines) {
    const size = grid.length;
    const rowSet = new Set(lines.rows);
    const collected = {};
    let cleared = 0;
    const collect = cell => {
        if (!cell) return;
        cleared++;
        if (cell.stone) collected[cell.stone.id] = (collected[cell.stone.id] || 0) + 1;
    };
    for (const r of lines.rows) {
        for (let c = 0; c < size; c++) collect(grid[r][c]);
    }
    for (const c of lines.cols) {
        for (let r = 0; r < size; r++) {
            if (!rowSet.has(r)) collect(grid[r][c]);
        }
    }
    for (const r of lines.rows) {
        for (let c = 0; c < size; c++) grid[r][c] = null;
    }
    for (const c of lines.cols) {
        for (let r = 0; r < size; r++) grid[r][c] = null;
    }
    return { cleared, collected, lineCount: lines.rows.length + lines.cols.length };
}

export function lineClearScore(lineCount) {
    return 100 * lineCount * lineCount;
}

// Mutates grid: clears the 3x3 area around (row, col). Locked cells included.
export function applyBomb(grid, row, col) {
    const size = grid.length;
    const collected = {};
    let cleared = 0;
    for (let r = row - 1; r <= row + 1; r++) {
        for (let c = col - 1; c <= col + 1; c++) {
            if (r >= 0 && r < size && c >= 0 && c < size && grid[r][c]) {
                if (grid[r][c].stone) {
                    const id = grid[r][c].stone.id;
                    collected[id] = (collected[id] || 0) + 1;
                }
                grid[r][c] = null;
                cleared++;
            }
        }
    }
    return { cleared, collected };
}

// Mutates grid: clears a single cell.
export function applyHammer(grid, row, col) {
    const collected = {};
    let cleared = 0;
    if (grid[row] && grid[row][col]) {
        if (grid[row][col].stone) {
            const id = grid[row][col].stone.id;
            collected[id] = (collected[id] || 0) + 1;
        }
        grid[row][col] = null;
        cleared = 1;
    }
    return { cleared, collected };
}

export function hasAnyPlacement(grid, blocks) {
    const size = grid.length;
    for (const block of blocks) {
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (canPlace(grid, block, r, c)) return true;
            }
        }
    }
    return false;
}

export function calcStars(score, scoreGoal) {
    if (score >= scoreGoal * 2) return 3;
    if (score >= scoreGoal * 1.5) return 2;
    return 1;
}

// --- Rotation (clockwise) ---
export function rotateCW(shape) {
    const h = shape.length;
    const w = shape[0].length;
    const out = Array.from({ length: w }, () => Array(h).fill(0));
    for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) out[c][h - 1 - r] = shape[r][c];
    }
    return out;
}

export function rotateStonesCW(stones, height) {
    return stones.map(s => ({ ...s, r: s.c, c: height - 1 - s.r }));
}

export function rotateBlock(block) {
    const height = block.shape.length;
    return { ...block, shape: rotateCW(block.shape), stones: rotateStonesCW(block.stones || [], height) };
}

// --- Storage parsing/validation helpers ---
export function sanitizeInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

export function parseJSONSafe(text, fallback) {
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch {
        return fallback;
    }
}
