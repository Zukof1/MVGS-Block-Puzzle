import { describe, it, expect } from 'vitest';
import {
    mulberry32, hashString, dayKey,
    generateLevel, createEmptyGrid, cloneGrid, canPlace, placeBlockOnGrid,
    findFullLines, clearLines, lineClearScore, applyBomb, applyHammer,
    hasAnyPlacement, calcStars, rotateCW, rotateBlock,
    sanitizeInt, parseJSONSafe,
    SHAPES, TOTAL_LEVELS,
} from '../script/core.js';

const blockFromShape = (shape, extra = {}) => ({
    shape,
    color: 'cyan',
    stones: [],
    instanceId: 'test',
    ...extra,
});

describe('mulberry32', () => {
    it('is deterministic for the same seed', () => {
        const a = mulberry32(12345);
        const b = mulberry32(12345);
        for (let i = 0; i < 50; i++) expect(a()).toBe(b());
    });

    it('produces different streams for different seeds', () => {
        const a = mulberry32(1);
        const b = mulberry32(2);
        const seqA = Array.from({ length: 10 }, () => a());
        const seqB = Array.from({ length: 10 }, () => b());
        expect(seqA).not.toEqual(seqB);
    });

    it('stays within [0, 1)', () => {
        const rng = mulberry32(999);
        for (let i = 0; i < 1000; i++) {
            const v = rng();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
});

describe('generateLevel', () => {
    it('is deterministic per level number (same board every session)', () => {
        for (const n of [1, 7, 15, 30]) {
            expect(generateLevel(n)).toEqual(generateLevel(n));
        }
    });

    it('different levels produce different configs', () => {
        expect(generateLevel(3)).not.toEqual(generateLevel(4));
    });

    it('honors an explicit seed override (daily challenge)', () => {
        expect(generateLevel(5, 42)).toEqual(generateLevel(5, 42));
        expect(generateLevel(5, 42)).not.toEqual(generateLevel(5, 43));
    });

    it('uses the documented difficulty formulas', () => {
        const lvl = generateLevel(8);
        expect(lvl.gridSize).toBe(Math.min(10, 5 + Math.floor(8 / 4)));
        expect(lvl.scoreGoal).toBe(50 + 8 * 15);
        expect(lvl.currencyReward).toBe(75 + 8 * 5);
        expect(generateLevel(100).gridSize).toBe(10);
        // Extreme levels stay playable: stones never exceed half the board.
        const extreme = generateLevel(100);
        const totalStones = Object.values(extreme.stoneGoal).reduce((a, b) => a + b, 0);
        expect(totalStones).toBeLessThanOrEqual(Math.floor((extreme.gridSize ** 2) / 2));
    });

    it('has 1 goal type up to level 10 and 2 after, all distinct', () => {
        expect(Object.keys(generateLevel(10).stoneGoal).length).toBe(1);
        const lvl = generateLevel(11);
        const ids = Object.keys(lvl.stoneGoal).map(Number);
        expect(ids.length).toBe(2);
        expect(new Set(ids).size).toBe(2);
    });

    it('always places every required goal stone (no unwinnable levels)', () => {
        for (let n = 1; n <= TOTAL_LEVELS; n++) {
            const lvl = generateLevel(n);
            const required = Object.values(lvl.stoneGoal).reduce((a, b) => a + b, 0);
            let placed = 0;
            for (const row of lvl.startGrid) {
                for (const cell of row) {
                    if (cell && cell.locked && cell.stone) placed++;
                }
            }
            expect(placed).toBe(required);
        }
    });

    it('never places more stones than there are cells', () => {
        for (let n = 1; n <= TOTAL_LEVELS; n++) {
            const lvl = generateLevel(n);
            const required = Object.values(lvl.stoneGoal).reduce((a, b) => a + b, 0);
            expect(required).toBeLessThanOrEqual(lvl.gridSize * lvl.gridSize);
        }
    });

    it('produces a 30-block sequence with valid shape ids and goal stones only from the goal set', () => {
        for (const n of [1, 5, 12, 30]) {
            const lvl = generateLevel(n);
            expect(lvl.blocks.length).toBe(30);
            const validShapeIds = new Set(SHAPES.map(s => s.id));
            const goalIds = new Set(Object.keys(lvl.stoneGoal).map(Number));
            for (const b of lvl.blocks) {
                expect(validShapeIds.has(b.shapeId)).toBe(true);
                for (const s of b.stones) {
                    expect(goalIds.has(s.stoneId)).toBe(true);
                    const shape = SHAPES.find(sh => sh.id === b.shapeId).shape;
                    expect(shape[s.r][s.c]).toBe(1);
                }
            }
        }
    });
});

describe('grid helpers', () => {
    it('createEmptyGrid makes an NxN null grid', () => {
        const g = createEmptyGrid(7);
        expect(g.length).toBe(7);
        expect(g[0].length).toBe(7);
        expect(g.flat().every(c => c === null)).toBe(true);
    });

    it('cloneGrid is a deep copy', () => {
        const g = createEmptyGrid(3);
        g[0][0] = { color: 'red', stone: { id: 1 } };
        const copy = cloneGrid(g);
        copy[0][0].color = 'blue';
        copy[0][0].stone.id = 2;
        expect(g[0][0].color).toBe('red');
        expect(g[0][0].stone.id).toBe(1);
    });
});

describe('canPlace', () => {
    const grid = createEmptyGrid(4);

    it('accepts placement in empty space', () => {
        expect(canPlace(grid, blockFromShape([[1, 1], [1, 1]]), 0, 0)).toBe(true);
    });

    it('rejects out-of-bounds', () => {
        expect(canPlace(grid, blockFromShape([[1, 1, 1, 1]]), 0, 1)).toBe(false);
        expect(canPlace(grid, blockFromShape([[1], [1], [1], [1], [1]]), 0, 0)).toBe(false);
        expect(canPlace(grid, blockFromShape([[1]]), -1, 0)).toBe(false);
    });

    it('rejects occupied cells (including locked stones)', () => {
        const g = createEmptyGrid(4);
        g[1][1] = { color: '#4a4e69', stone: { id: 0 }, locked: true };
        expect(canPlace(g, blockFromShape([[1]]), 1, 1)).toBe(false);
        expect(canPlace(g, blockFromShape([[1]]), 1, 0)).toBe(true);
    });
});

describe('placeBlockOnGrid', () => {
    it('places cells and reports the count, keeping stones', () => {
        const g = createEmptyGrid(4);
        const block = blockFromShape([[1, 1], [1, 0]], { stones: [{ r: 0, c: 1, stoneId: 2 }] });
        const placed = placeBlockOnGrid(g, block, 1, 1);
        expect(placed).toBe(3);
        expect(g[1][1].color).toBe('cyan');
        expect(g[1][2].stone).toEqual({ id: 2 });
        expect(g[2][1].stone).toBeNull();
        expect(g[2][2]).toBeNull();
    });
});

describe('findFullLines / clearLines', () => {
    it('detects full rows and columns', () => {
        const g = createEmptyGrid(3);
        for (let c = 0; c < 3; c++) g[1][c] = { color: 'red' };
        for (let r = 0; r < 3; r++) g[r][2] = { color: 'red' };
        const lines = findFullLines(g);
        expect(lines.rows).toEqual([1]);
        expect(lines.cols).toEqual([2]);
    });

    it('clears lines and counts intersection stones only once', () => {
        const g = createEmptyGrid(3);
        for (let c = 0; c < 3; c++) g[1][c] = { color: 'red', stone: { id: 0 } };
        for (let r = 0; r < 3; r++) g[r][2] = { color: 'red', stone: { id: 0 } };
        const lines = findFullLines(g);
        const { cleared, collected, lineCount } = clearLines(g, lines);
        expect(lineCount).toBe(2);
        // row 1: 3 cells, col 2 minus intersection: 2 cells
        expect(cleared).toBe(5);
        expect(collected[0]).toBe(5);
        expect(g.flat().every(c => c === null)).toBe(true);
    });

    it('leaves non-cleared cells intact', () => {
        const g = createEmptyGrid(3);
        for (let c = 0; c < 3; c++) g[0][c] = { color: 'red' };
        g[1][0] = { color: 'blue' };
        clearLines(g, findFullLines(g));
        expect(g[1][0].color).toBe('blue'); // row 0 cleared; column 0 not full
        expect(g[0][0]).toBeNull();
        expect(g[2][1]).toBeNull();
    });
});

describe('lineClearScore', () => {
    it('scores 100 * lines^2', () => {
        expect(lineClearScore(1)).toBe(100);
        expect(lineClearScore(2)).toBe(400);
        expect(lineClearScore(3)).toBe(900);
    });
});

describe('applyBomb', () => {
    it('clears the 3x3 area and collects stones', () => {
        const g = createEmptyGrid(4);
        g[1][1] = { color: 'red', stone: { id: 3 } };
        g[1][2] = { color: 'red' };
        g[3][3] = { color: 'blue' };
        const { cleared, collected } = applyBomb(g, 1, 1);
        expect(cleared).toBe(2);
        expect(collected[3]).toBe(1);
        expect(g[1][1]).toBeNull();
        expect(g[3][3]).not.toBeNull(); // outside blast radius
    });

    it('clips at edges without throwing', () => {
        const g = createEmptyGrid(3);
        g[0][0] = { color: 'red' };
        const { cleared } = applyBomb(g, 0, 0);
        expect(cleared).toBe(1);
    });
});

describe('applyHammer', () => {
    it('clears exactly one cell and collects its stone', () => {
        const g = createEmptyGrid(3);
        g[1][1] = { color: 'red', stone: { id: 1 } };
        g[1][2] = { color: 'blue' };
        const { cleared, collected } = applyHammer(g, 1, 1);
        expect(cleared).toBe(1);
        expect(collected[1]).toBe(1);
        expect(g[1][1]).toBeNull();
        expect(g[1][2]).not.toBeNull();
    });

    it('returns zero on an empty cell', () => {
        const g = createEmptyGrid(3);
        expect(applyHammer(g, 0, 0).cleared).toBe(0);
    });
});

describe('hasAnyPlacement', () => {
    it('true when any block fits anywhere', () => {
        const g = createEmptyGrid(3);
        expect(hasAnyPlacement(g, [blockFromShape([[1, 1, 1], [1, 1, 1], [1, 1, 1]])])).toBe(true);
    });

    it('false when nothing fits', () => {
        const g = createEmptyGrid(2);
        g[0][0] = { color: 'red' };
        expect(hasAnyPlacement(g, [blockFromShape([[1, 1], [1, 1]])])).toBe(false);
    });

    it('false for an empty tray', () => {
        expect(hasAnyPlacement(createEmptyGrid(3), [])).toBe(false);
    });
});

describe('calcStars', () => {
    it('awards 1/2/3 stars at goal, 1.5x, 2x', () => {
        expect(calcStars(100, 100)).toBe(1);
        expect(calcStars(149, 100)).toBe(1);
        expect(calcStars(150, 100)).toBe(2);
        expect(calcStars(199, 100)).toBe(2);
        expect(calcStars(200, 100)).toBe(3);
        expect(calcStars(9999, 100)).toBe(3);
    });
});

describe('rotation', () => {
    it('rotates a 1x4 into a 4x1 clockwise', () => {
        expect(rotateCW([[1, 1, 1, 1]])).toEqual([[1], [1], [1], [1]]);
    });

    it('rotates a 2x3 correctly', () => {
        expect(rotateCW([[1, 0, 0], [1, 1, 1]])).toEqual([[1, 1], [1, 0], [1, 0]]);
    });

    it('four rotations restore any shape', () => {
        for (const { shape } of SHAPES) {
            let s = shape;
            for (let i = 0; i < 4; i++) s = rotateCW(s);
            expect(s).toEqual(shape);
        }
    });

    it('rotateBlock moves stones with their cells', () => {
        const block = blockFromShape([[1, 0, 0], [1, 1, 1]], { stones: [{ r: 0, c: 0, stoneId: 4 }] });
        const rotated = rotateBlock(block);
        expect(rotated.stones).toEqual([{ r: 0, c: 1, stoneId: 4 }]);
        expect(rotated.shape[0][1]).toBe(1); // stone still sits on a filled cell
    });
});

describe('storage helpers', () => {
    it('sanitizeInt falls back on garbage and clamps', () => {
        expect(sanitizeInt(null, 1, 1, 30)).toBe(1);
        expect(sanitizeInt('abc', 5, 1, 30)).toBe(5);
        expect(sanitizeInt('NaN', 5)).toBe(5);
        expect(sanitizeInt('7', 1, 1, 30)).toBe(7);
        expect(sanitizeInt('999', 1, 1, 30)).toBe(30);
        expect(sanitizeInt('-3', 0, 0)).toBe(0);
    });

    it('parseJSONSafe returns fallback for corrupt data', () => {
        expect(parseJSONSafe('not json', { a: 1 })).toEqual({ a: 1 });
        expect(parseJSONSafe('42', { a: 1 })).toEqual({ a: 1 });
        expect(parseJSONSafe('null', { a: 1 })).toEqual({ a: 1 });
        expect(parseJSONSafe('{"b":2}', {})).toEqual({ b: 2 });
    });
});

describe('hashString / dayKey', () => {
    it('hashes deterministically and distinguishes inputs', () => {
        expect(hashString('daily-2026-10-21')).toBe(hashString('daily-2026-10-21'));
        expect(hashString('a')).not.toBe(hashString('b'));
    });

    it('formats day keys as YYYY-MM-DD', () => {
        expect(dayKey(new Date(2026, 9, 21))).toBe('2026-10-21');
        expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    });
});
