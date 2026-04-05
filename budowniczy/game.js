'use strict';

// ─── Constants ───────────────────────────────────────────────────────────────
const T_SIZE   = 32;          // pixels per tile
const W_COLS   = 256;         // world width in tiles
const W_ROWS   = 64;          // world height in tiles
const GRAVITY  = 0.55;
const JUMP_VEL = -13;
const MOVE_SPD = 3.8;
const MAX_FALL = 18;

// ─── Tile definitions ─────────────────────────────────────────────────────────
const T = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4, BRICK: 5, SAND: 6 };

const TILE_DEF = {
	[T.GRASS]: { fill: '#4caf28', edge: '#357a18', label: 'Trawa'   },
	[T.DIRT]:  { fill: '#8B5E3C', edge: '#5c3a1e', label: 'Ziemia'  },
	[T.STONE]: { fill: '#7a7a7a', edge: '#4a4a4a', label: 'Kamień'  },
	[T.WOOD]:  { fill: '#a07040', edge: '#6a4820', label: 'Drewno'  },
	[T.BRICK]: { fill: '#c04030', edge: '#7a2010', label: 'Cegła'   },
	[T.SAND]:  { fill: '#c8b060', edge: '#907830', label: 'Piasek'  },
};

const TOOLBAR_TILES = [T.DIRT, T.GRASS, T.STONE, T.WOOD, T.BRICK, T.SAND];

// ─── World ────────────────────────────────────────────────────────────────────
const world = new Uint8Array(W_COLS * W_ROWS);

function getCell(col, row) {
	if (col < 0 || col >= W_COLS || row < 0 || row >= W_ROWS) return T.STONE;
	return world[row * W_COLS + col];
}

function setCell(col, row, tile) {
	if (col < 0 || col >= W_COLS || row < 0 || row >= W_ROWS) return;
	world[row * W_COLS + col] = tile;
}

function isSolid(col, row) {
	return getCell(col, row) !== T.AIR;
}

function generateWorld() {
	for (let c = 0; c < W_COLS; c++) {
		const surface = Math.round(
			W_ROWS * 0.55
			+ 7  * Math.sin(c * 0.04)
			+ 4  * Math.sin(c * 0.09 + 1.2)
			+ 2  * Math.sin(c * 0.22 + 0.5)
		);
		for (let r = 0; r < W_ROWS; r++) {
			if (r < surface)         setCell(c, r, T.AIR);
			else if (r === surface)  setCell(c, r, T.GRASS);
			else if (r < surface+4)  setCell(c, r, T.DIRT);
			else                     setCell(c, r, T.STONE);
		}
	}
	// Random sand patches
	for (let i = 0; i < 8; i++) {
		const sc = 20 + Math.floor(Math.random() * (W_COLS - 40));
		for (let r = 0; r < W_ROWS; r++) {
			if (getCell(sc, r) !== T.AIR) {
				for (let dr = 0; dr < 3; dr++)
					for (let dc = -2; dc <= 2; dc++)
						if (getCell(sc + dc, r + dr) !== T.AIR)
							setCell(sc + dc, r + dr, T.SAND);
				break;
			}
		}
	}
}

// ─── Player ───────────────────────────────────────────────────────────────────
const PW = T_SIZE * 0.8;
const PH = T_SIZE * 1.6;

const player = { x: 0, y: 0, vx: 0, vy: 0, onGround: false, facingRight: true };

function spawnPlayer() {
	const startCol = 8;
	for (let r = 0; r < W_ROWS; r++) {
		if (getCell(startCol, r) !== T.AIR) {
			player.x = startCol * T_SIZE + (T_SIZE - PW) / 2;
			player.y = (r - 2) * T_SIZE;
			return;
		}
	}
}

// ─── Camera ───────────────────────────────────────────────────────────────────
const cam = { x: 0, y: 0 };

// ─── Input ────────────────────────────────────────────────────────────────────
const keys      = {};
let mouseX      = 0, mouseY = 0;
let lmbDown     = false, rmbDown = false;
let selectedTile = T.DIRT;

// ─── Canvas ───────────────────────────────────────────────────────────────────
const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');

function resize() {
	canvas.width  = window.innerWidth;
	canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ─── Collision helpers ────────────────────────────────────────────────────────
function colRange(x, w) {
	const first = Math.floor(x / T_SIZE);
	const last  = Math.floor((x + w - 0.01) / T_SIZE);
	const out   = [];
	for (let i = first; i <= last; i++) out.push(i);
	return out;
}

function resolveCollisions() {
	// Horizontal
	player.x += player.vx;
	const rows = colRange(player.y, PH);
	if (player.vx > 0) {
		const col = Math.floor((player.x + PW) / T_SIZE);
		for (const r of rows) {
			if (isSolid(col, r)) { player.x = col * T_SIZE - PW; player.vx = 0; break; }
		}
	} else if (player.vx < 0) {
		const col = Math.floor(player.x / T_SIZE);
		for (const r of rows) {
			if (isSolid(col, r)) { player.x = (col + 1) * T_SIZE; player.vx = 0; break; }
		}
	}

	// Vertical
	player.y += player.vy;
	player.onGround = false;
	const cols = colRange(player.x, PW);
	if (player.vy > 0) {
		const row = Math.floor((player.y + PH) / T_SIZE);
		for (const c of cols) {
			if (isSolid(c, row)) {
				player.y = row * T_SIZE - PH;
				player.vy = 0;
				player.onGround = true;
				break;
			}
		}
	} else if (player.vy < 0) {
		const row = Math.floor(player.y / T_SIZE);
		for (const c of cols) {
			if (isSolid(c, row)) { player.y = (row + 1) * T_SIZE; player.vy = 0; break; }
		}
	}

	// World bounds
	if (player.x < 0)                       { player.x = 0;                      player.vx = 0; }
	if (player.x + PW > W_COLS * T_SIZE)    { player.x = W_COLS * T_SIZE - PW;  player.vx = 0; }
	if (player.y < 0)                       { player.y = 0;                      player.vy = 0; }
	if (player.y + PH > W_ROWS * T_SIZE)    { player.y = W_ROWS * T_SIZE - PH;  player.vy = 0; player.onGround = true; }
}

// ─── Block interaction ────────────────────────────────────────────────────────
function worldCoords() {
	return {
		col: Math.floor((mouseX + cam.x) / T_SIZE),
		row: Math.floor((mouseY + cam.y) / T_SIZE),
	};
}

function playerOccupies(col, row) {
	const pc1 = Math.floor(player.x / T_SIZE);
	const pc2 = Math.floor((player.x + PW - 0.01) / T_SIZE);
	const pr1 = Math.floor(player.y / T_SIZE);
	const pr2 = Math.floor((player.y + PH - 0.01) / T_SIZE);
	return col >= pc1 && col <= pc2 && row >= pr1 && row <= pr2;
}

function placeBlock() {
	const { col, row } = worldCoords();
	if (!playerOccupies(col, row) && getCell(col, row) === T.AIR) {
		setCell(col, row, selectedTile);
	}
}

function removeBlock() {
	const { col, row } = worldCoords();
	if (getCell(col, row) !== T.AIR) {
		setCell(col, row, T.AIR);
	}
}

// ─── Update ───────────────────────────────────────────────────────────────────
function update() {
	// Movement
	const left  = keys['ArrowLeft']  || keys['a'] || keys['A'];
	const right = keys['ArrowRight'] || keys['d'] || keys['D'];
	const jump  = keys['ArrowUp']    || keys['w'] || keys['W'] || keys[' '];

	if (right) { player.vx = MOVE_SPD;  player.facingRight = true;  }
	else if (left) { player.vx = -MOVE_SPD; player.facingRight = false; }
	else { player.vx *= 0.6; if (Math.abs(player.vx) < 0.1) player.vx = 0; }

	if (jump && player.onGround) { player.vy = JUMP_VEL; player.onGround = false; }

	player.vy = Math.min(player.vy + GRAVITY, MAX_FALL);

	resolveCollisions();

	// Camera (smooth follow)
	const tx = player.x + PW / 2 - canvas.width  / 2;
	const ty = player.y + PH / 2 - canvas.height / 2;
	cam.x += (tx - cam.x) * 0.12;
	cam.y += (ty - cam.y) * 0.12;
	cam.x = Math.max(0, Math.min(cam.x, W_COLS * T_SIZE - canvas.width));
	cam.y = Math.max(0, Math.min(cam.y, W_ROWS * T_SIZE - canvas.height));

	// Block actions (held mouse)
	if (lmbDown) placeBlock();
	if (rmbDown) removeBlock();
}

// ─── Render helpers ───────────────────────────────────────────────────────────
function drawRoundRect(x, y, w, h, r) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
}

// ─── Render world ─────────────────────────────────────────────────────────────
function renderWorld() {
	// Sky
	const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
	sky.addColorStop(0, '#4fc3f7');
	sky.addColorStop(1, '#b3e5fc');
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	// Visible tiles
	const c0 = Math.max(0, Math.floor(cam.x / T_SIZE) - 1);
	const c1 = Math.min(W_COLS, Math.ceil((cam.x + canvas.width)  / T_SIZE) + 1);
	const r0 = Math.max(0, Math.floor(cam.y / T_SIZE) - 1);
	const r1 = Math.min(W_ROWS, Math.ceil((cam.y + canvas.height) / T_SIZE) + 1);

	for (let r = r0; r < r1; r++) {
		for (let c = c0; c < c1; c++) {
			const tile = getCell(c, r);
			if (tile === T.AIR) continue;

			const def = TILE_DEF[tile];
			const sx  = c * T_SIZE - cam.x;
			const sy  = r * T_SIZE - cam.y;

			// Grass cap (top of grass tile darker green stripe)
			if (tile === T.GRASS) {
				ctx.fillStyle = def.fill;
				ctx.fillRect(sx, sy, T_SIZE, T_SIZE);
				ctx.fillStyle = '#6ed434';
				ctx.fillRect(sx, sy, T_SIZE, 6);
			} else if (tile === T.BRICK) {
				ctx.fillStyle = def.fill;
				ctx.fillRect(sx, sy, T_SIZE, T_SIZE);
				// Mortar lines
				ctx.fillStyle = '#8a2010';
				ctx.fillRect(sx,              sy,              T_SIZE, 1);
				ctx.fillRect(sx,              sy + T_SIZE / 2, T_SIZE, 1);
				ctx.fillRect(sx,              sy,              1, T_SIZE / 2);
				ctx.fillRect(sx + T_SIZE / 2, sy + T_SIZE / 2, 1, T_SIZE / 2);
				ctx.fillRect(sx + T_SIZE,     sy,              1, T_SIZE / 2);
				ctx.fillRect(sx + T_SIZE / 4, sy + T_SIZE / 2, 1, T_SIZE / 2);
			} else if (tile === T.WOOD) {
				ctx.fillStyle = def.fill;
				ctx.fillRect(sx, sy, T_SIZE, T_SIZE);
				// Wood grain
				ctx.fillStyle = 'rgba(0,0,0,0.12)';
				for (let g = 4; g < T_SIZE; g += 10) {
					ctx.fillRect(sx, sy + g, T_SIZE, 2);
				}
			} else if (tile === T.STONE) {
				ctx.fillStyle = def.fill;
				ctx.fillRect(sx, sy, T_SIZE, T_SIZE);
				ctx.fillStyle = 'rgba(255,255,255,0.06)';
				ctx.fillRect(sx, sy, T_SIZE / 2, T_SIZE / 2);
				ctx.fillRect(sx + T_SIZE / 2, sy + T_SIZE / 2, T_SIZE / 2, T_SIZE / 2);
			} else {
				ctx.fillStyle = def.fill;
				ctx.fillRect(sx, sy, T_SIZE, T_SIZE);
			}

			// Edge
			ctx.strokeStyle = def.edge;
			ctx.lineWidth   = 1;
			ctx.strokeRect(sx + 0.5, sy + 0.5, T_SIZE - 1, T_SIZE - 1);
		}
	}
}

// ─── Render player ────────────────────────────────────────────────────────────
function renderPlayer() {
	const px = Math.round(player.x - cam.x);
	const py = Math.round(player.y - cam.y);
	const fx = player.facingRight ? 1 : -1;

	ctx.save();
	ctx.translate(px + PW / 2, py);
	ctx.scale(fx, 1);
	const ox = -PW / 2;

	// Legs (animated by walk)
	const legSwing = player.onGround ? Math.sin(Date.now() * 0.015) * 4 * Math.abs(player.vx) / MOVE_SPD : 0;
	ctx.fillStyle = '#3a5fa0';
	ctx.fillRect(ox,              PH * 0.65, PW * 0.42, PH * 0.35);
	ctx.fillRect(ox + PW * 0.5,  PH * 0.65 + legSwing, PW * 0.42, PH * 0.35 - legSwing);

	// Body
	ctx.fillStyle = '#e07840';
	ctx.fillRect(ox, PH * 0.22, PW, PH * 0.46);

	// Arms
	ctx.fillStyle = '#c05820';
	ctx.fillRect(ox - PW * 0.22, PH * 0.24, PW * 0.22, PH * 0.32);
	ctx.fillRect(ox + PW,        PH * 0.24, PW * 0.22, PH * 0.32);

	// Head
	ctx.fillStyle = '#f5c18a';
	ctx.fillRect(ox + PW * 0.05, 0, PW * 0.9, PH * 0.26);

	// Hat
	ctx.fillStyle = '#2a2a2a';
	ctx.fillRect(ox + PW * 0.1, -PH * 0.1, PW * 0.8, PH * 0.1);
	ctx.fillRect(ox,             -PH * 0.05, PW, PH * 0.05);

	// Eye
	ctx.fillStyle = '#fff';
	ctx.fillRect(ox + PW * 0.52, PH * 0.06, PW * 0.28, PH * 0.12);
	ctx.fillStyle = '#1a1a1a';
	ctx.fillRect(ox + PW * 0.62, PH * 0.08, PW * 0.12, PH * 0.08);

	ctx.restore();
}

// ─── Render cursor highlight ──────────────────────────────────────────────────
function renderCursor() {
	const { col, row } = worldCoords();
	const sx = col * T_SIZE - cam.x;
	const sy = row * T_SIZE - cam.y;
	const tile = getCell(col, row);

	// Ghost preview for placement
	if (tile === T.AIR && !playerOccupies(col, row)) {
		const def = TILE_DEF[selectedTile];
		ctx.globalAlpha = 0.4;
		ctx.fillStyle   = def.fill;
		ctx.fillRect(sx, sy, T_SIZE, T_SIZE);
		ctx.globalAlpha = 1;
	}

	// Outline
	ctx.strokeStyle = tile !== T.AIR ? 'rgba(255,80,80,0.9)' : 'rgba(255,255,255,0.8)';
	ctx.lineWidth   = 2;
	ctx.strokeRect(sx + 1, sy + 1, T_SIZE - 2, T_SIZE - 2);

	// Crosshair dot
	ctx.fillStyle = 'rgba(255,255,255,0.9)';
	ctx.beginPath();
	ctx.arc(mouseX, mouseY, 3, 0, Math.PI * 2);
	ctx.fill();
}

// ─── Render toolbar ───────────────────────────────────────────────────────────
function renderToolbar() {
	const N     = TOOLBAR_TILES.length;
	const SZ    = 44;
	const PAD   = 6;
	const GAP   = 4;
	const totalW = N * SZ + (N - 1) * GAP + PAD * 2;
	const bx    = (canvas.width - totalW) / 2;
	const by    = canvas.height - SZ - 20;

	// Background pill
	ctx.fillStyle = 'rgba(0,0,0,0.62)';
	drawRoundRect(bx - 2, by - PAD, totalW + 4, SZ + PAD * 2, 12);
	ctx.fill();

	TOOLBAR_TILES.forEach((tile, i) => {
		const def = TILE_DEF[tile];
		const tx  = bx + PAD + i * (SZ + GAP);
		const ty  = by;

		// Selected ring
		if (tile === selectedTile) {
			ctx.strokeStyle = '#fff';
			ctx.lineWidth   = 2.5;
			drawRoundRect(tx - 4, ty - 4, SZ + 8, SZ + 8, 6);
			ctx.stroke();
		}

		ctx.fillStyle = def.fill;
		ctx.fillRect(tx, ty, SZ, SZ);
		ctx.strokeStyle = def.edge;
		ctx.lineWidth   = 1;
		ctx.strokeRect(tx + 0.5, ty + 0.5, SZ - 1, SZ - 1);

		// Number badge
		ctx.fillStyle   = 'rgba(0,0,0,0.55)';
		ctx.fillRect(tx, ty + SZ - 14, 14, 14);
		ctx.fillStyle   = '#fff';
		ctx.font        = 'bold 11px sans-serif';
		ctx.textAlign   = 'center';
		ctx.fillText(i + 1, tx + 7, ty + SZ - 3);

		// Label below
		ctx.fillStyle = tile === selectedTile ? '#fff' : 'rgba(255,255,255,0.6)';
		ctx.font      = '10px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(def.label, tx + SZ / 2, by + SZ + PAD + 10);
	});
}

// ─── Render HUD ───────────────────────────────────────────────────────────────
function renderHUD() {
	const lines = [
		'WASD / ← → ↑  –  ruch i skok',
		'LPM  –  postaw blok',
		'PPM  –  usuń blok',
		'1 – 6  –  wybierz materiał',
	];
	const lh  = 16;
	const bw  = 198, bh = lines.length * lh + 14;
	const bx  = 10, by = 10;

	ctx.fillStyle = 'rgba(0,0,0,0.5)';
	drawRoundRect(bx, by, bw, bh, 8);
	ctx.fill();

	ctx.fillStyle = 'rgba(255,255,255,0.8)';
	ctx.font      = '12px sans-serif';
	ctx.textAlign = 'left';
	lines.forEach((l, i) => ctx.fillText(l, bx + 10, by + 11 + (i + 1) * lh - 3));
}

// ─── Main loop ────────────────────────────────────────────────────────────────
function loop() {
	update();
	renderWorld();
	renderPlayer();
	renderCursor();
	renderToolbar();
	renderHUD();
	requestAnimationFrame(loop);
}

// ─── Events ───────────────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
	keys[e.key] = true;
	const n = parseInt(e.key);
	if (n >= 1 && n <= TOOLBAR_TILES.length) selectedTile = TOOLBAR_TILES[n - 1];
	// Prevent page scroll with arrow keys / space
	if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

canvas.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });

canvas.addEventListener('mousedown', e => {
	if (e.button === 0) { lmbDown = true; placeBlock(); }
	if (e.button === 2) { rmbDown = true; removeBlock(); }

	// Toolbar click
	const N = TOOLBAR_TILES.length;
	const SZ = 44, PAD = 6, GAP = 4;
	const totalW = N * SZ + (N - 1) * GAP + PAD * 2;
	const bx = (canvas.width - totalW) / 2;
	const by = canvas.height - SZ - 20;
	TOOLBAR_TILES.forEach((tile, i) => {
		const tx = bx + PAD + i * (SZ + GAP);
		if (e.clientX >= tx && e.clientX <= tx + SZ && e.clientY >= by && e.clientY <= by + SZ) {
			selectedTile = tile;
		}
	});
});
canvas.addEventListener('mouseup', e => {
	if (e.button === 0) lmbDown = false;
	if (e.button === 2) rmbDown = false;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ─── Init ─────────────────────────────────────────────────────────────────────
generateWorld();
spawnPlayer();
loop();
