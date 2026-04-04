(() => {
	const canvas = document.getElementById('game');
	const ctx = canvas.getContext('2d');

	const scoreEl = document.getElementById('score');
	const missesEl = document.getElementById('misses');
	const startBtn = document.getElementById('startBtn');
	const resetBtn = document.getElementById('resetBtn');
	const overlay = document.getElementById('overlay');
	const overlayStart = document.getElementById('overlayStart');
	const finalScoreEl = document.getElementById('finalScore');
	const introTextEl = document.getElementById('introText');
	const timerEl = document.getElementById('timer');
	const instructionsEl = document.getElementById('instructions');
	// ranking (Top 10) wyłączony – brak elementów UI
	const shotAudioEl = /** @type {HTMLAudioElement|null} */(document.getElementById('sndShot'));
	const bgMusicEl = /** @type {HTMLAudioElement|null} */(document.getElementById('bgMusic'));
	const levelLabelEl = document.getElementById('levelLabel');
	const weaponSelectEl = document.getElementById('weaponSelect');
	const weaponHintEl = document.getElementById('weaponHint');
	const iconRevolverEl = document.getElementById('iconRevolver');
	const iconBazookaEl = document.getElementById('iconBazooka');
	const iconMachinegunEl = document.getElementById('iconMachinegun');
	const iconShotgunEl = document.getElementById('iconShotgun');
	const weaponIconEl = document.getElementById('weaponIcon');
	const reloadAudioEl = /** @type {HTMLAudioElement|null} */(document.getElementById('sndReload'));
	const ammoDisplayEl = document.getElementById('ammoDisplay');
	const ammoTextEl = document.getElementById('ammoText');

	let width = 0;
	let height = 0;
	let dpiScale = 1;

	/** @type {{x:number,y:number,vx:number,vy:number,r:number,hit:boolean,age:number,isBomb?:boolean,isGolden?:boolean,isSilver?:boolean,falling?:boolean,flashMs?:number}[]} */
	let pigeons = [];
	let goldenSpawned = false;
	let goldenSpawnAtMs = 0;
	let silverSpawned = false;
	let silverSpawnAtMs = 0;
	/** @type {{x:number,y:number,age:number,ttl:number,r:number}[]} */
	let particles = [];
	let running = false;
	let lastTime = 0;
	let elapsed = 0;
	let spawnAccumulator = 0;
	let score = 0;
	let misses = 0;
	let mouse = { x: 0, y: 0, visible: false };
	const GAME_DURATION_MS = 60_000;
	const MAX_MISSES = 100;
	let lastBeepSecond = null;
	let audioCtx = null;
	// Specjalny nabój po 5 trafieniach
	let hitStreak = 0;
	let specialReady = false;
	// Poziomy trudności
	let level = 1;
	let levelUpTriggered = false;
	// Fajerwerki w tle
	let fireworks = [];
	// Power-up: przelatujący pocisk (12 strzałów w rewolwerze)
	let powerups = [];
	let powerupRevolverAcc = 0;
	let powerupRevolverIntervalMs = 22000; // start ~22s, can vary
	let powerupBazookaAcc = 0;
	let powerupBazookaIntervalMs = 26000; // bazooka power-up ~26-38s
	// Broń
	let currentWeapon = 'pistol';
	let pistolShotsFired = 0;
	let pistolReloadUntil = 0; // epoch ms; 0 = not reloading
	let pistolMagazineSize = 7;
	let pistolExtendedActive = false; // gdy true, magazynek = 12 do następnego przeładowania
	let bazookaReloadUntil = 0; // 0 = gotowa
	let machinegunAmmo = 100;
	let machinegunLastShot = 0; // epoch ms
	let machinegunFireRate = 50; // ms między strzałami (bardzo szybko)
	let mouseDown = false;
	let shotgunAmmo = 7;
	let shotgunShotsFired = 0;
	let shotgunReloadUntil = 0; // epoch ms; 0 = not reloading
	let shotgunLastShot = 0; // epoch ms
	let shotgunFireRate = 800; // ms między strzałami (wolno)
	const FALL_GRAVITY = 0.0009; // px/ms²; spowalnia opadanie trafionych gołębi
	const FALL_TERMINAL_VY = 0.75; // px/ms; maksymalna prędkość spadania

	function updateWeaponIcon() {
		if (!iconRevolverEl || !iconBazookaEl || !iconMachinegunEl || !iconShotgunEl) return;
		if (currentWeapon === 'bazooka') {
			iconBazookaEl.style.display = '';
			iconRevolverEl.style.display = 'none';
			iconMachinegunEl.style.display = 'none';
			iconShotgunEl.style.display = 'none';
		} else if (currentWeapon === 'machinegun') {
			iconBazookaEl.style.display = 'none';
			iconRevolverEl.style.display = 'none';
			iconMachinegunEl.style.display = '';
			iconShotgunEl.style.display = 'none';
		} else if (currentWeapon === 'shotgun') {
			iconBazookaEl.style.display = 'none';
			iconRevolverEl.style.display = 'none';
			iconMachinegunEl.style.display = 'none';
			iconShotgunEl.style.display = '';
		} else {
			iconBazookaEl.style.display = 'none';
			iconMachinegunEl.style.display = 'none';
			iconShotgunEl.style.display = 'none';
			iconRevolverEl.style.display = '';
		}
	}

	function updateAmmoDisplay() {
		if (!ammoDisplayEl || !ammoTextEl) return;
		if (!running) {
			ammoDisplayEl.style.display = 'none';
			return;
		}
		ammoDisplayEl.style.display = '';
		const now = Date.now();
		if (currentWeapon === 'pistol') {
			const isReloading = pistolReloadUntil && now < pistolReloadUntil;
			if (isReloading) {
				ammoTextEl.textContent = 'Przeładowywanie...';
			} else {
				const remaining = pistolMagazineSize - pistolShotsFired;
				ammoTextEl.textContent = `${remaining}/${pistolMagazineSize}`;
			}
		} else if (currentWeapon === 'bazooka') {
			const isReloading = bazookaReloadUntil && now < bazookaReloadUntil;
			if (isReloading) {
				ammoTextEl.textContent = 'Przeładowywanie...';
			} else {
				ammoTextEl.textContent = 'Gotowa';
			}
		} else if (currentWeapon === 'machinegun') {
			ammoTextEl.textContent = `${machinegunAmmo}/100`;
		} else if (currentWeapon === 'shotgun') {
			const isReloading = shotgunReloadUntil && now < shotgunReloadUntil;
			if (isReloading) {
				ammoTextEl.textContent = 'Przeładowywanie...';
			} else {
				const remaining = shotgunAmmo - shotgunShotsFired;
				ammoTextEl.textContent = `${remaining}/${shotgunAmmo}`;
			}
		}
	}

	function resize() {
		width = Math.floor(window.innerWidth);
		height = Math.floor(window.innerHeight);
		dpiScale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
		canvas.width = Math.floor(width * dpiScale);
		canvas.height = Math.floor(height * dpiScale);
		canvas.style.width = width + 'px';
		canvas.style.height = height + 'px';
		ctx.setTransform(dpiScale, 0, 0, dpiScale, 0, 0);
	}

	function rand(min, max) {
		return Math.random() * (max - min) + min;
	}

	function hasGoldenPigeon() {
		let count = 0;
		for (const p of pigeons) if (p.isGolden) count++;
		return count >= 2; // zwraca true jeśli są już 2 lub więcej złotych gołębi
	}

	function hasSilverPigeon() {
		for (const p of pigeons) if (p.isSilver) return true;
		return false;
	}

	function getPigeonPoints(p) {
		if (p.isSilver) return 200;
		if (p.isGolden) return 100;
		return p.r <= 20 ? 5 : 1;
	}

	function spawnPigeon() {
		const side = Math.random() < 0.5 ? 'left' : 'right';
		const y = rand(height * 0.1, height * 0.8);
		const r = rand(16, 26);
		// Speed scales gently over time; values are px/s converted to px/ms
		const base = 55 + Math.min(45, elapsed * 0.008); // ~55→100 px/s over a long time
		// diversify speeds per pigeon
		const variance = rand(-25, 70); // px/s
		const speed = Math.max(30, base + variance); // ensure minimum speed
		const speedMul = level >= 2 ? 2 : 1;
		const vx = (side === 'left' ? 1 : -1) * (speed / 1000) * speedMul; // px/ms
		const vy = (rand(-12, 12) / 1000) * speedMul; // px/ms
		const x = side === 'left' ? -r * 2 : width + r * 2;
		// 10% szans na gołębia z bombą
		const isBomb = Math.random() < 0.1;
		// Zwykłe spawnowanie: bez złotych (złoty jest planowany osobno raz na rundę)
		pigeons.push({ x, y, vx, vy, r, hit: false, age: 0, isBomb, isGolden: false, isSilver: false, flashMs: 0 });
	}

	function spawnGoldenPigeon() {
		// Tworzy dwa złote gołębie jednocześnie
		for (let i = 0; i < 2; i++) {
			const side = Math.random() < 0.5 ? 'left' : 'right';
			const y = rand(height * 0.15, height * 0.75);
			let baseRadius = rand(18, 26);
			const sizeMul = level >= 2 ? 0.25 : 0.5;
			const r = Math.max(8, baseRadius * sizeMul);
			const base = 65 + Math.min(45, elapsed * 0.006);
			const variance = rand(-15, 40);
			const speed = Math.max(35, base + variance);
			const speedMul = level >= 2 ? 2 : 1;
			const vx = (side === 'left' ? 1 : -1) * (speed / 1000) * speedMul;
			const vy = (rand(-10, 10) / 1000) * speedMul;
			const x = side === 'left' ? -r * 2 : width + r * 2;
			pigeons.push({ x, y, vx, vy, r, hit: false, age: 0, isBomb: false, isGolden: true, isSilver: false, flashMs: 0 });
		}
	}

	function spawnSilverPigeon() {
		const side = Math.random() < 0.5 ? 'left' : 'right';
		const y = rand(height * 0.2, height * 0.7);
		const baseRadius = rand(18, 26);
		const r = Math.max(6, baseRadius * 0.5);
		const baseSpeed = 70 + Math.min(40, elapsed * 0.005);
		const variance = rand(-10, 35);
		const speed = Math.max(40, baseSpeed + variance);
		const vx = (side === 'left' ? 1 : -1) * (speed / 1000);
		const vy = (rand(-8, 8) / 1000);
		const x = side === 'left' ? -r * 2 : width + r * 2;
		pigeons.push({ x, y, vx, vy, r, hit: false, age: 0, isBomb: false, isGolden: false, isSilver: true, flashMs: 0 });
	}

	function addHitParticles(x, y, radius) {
		const n = 10;
		for (let i = 0; i < n; i++) {
			particles.push({
				x,
				y,
				age: 0,
				ttl: 400 + Math.random() * 300,
				r: rand(1.5, 3)
			});
		}
	}

	// ===== Sky & Clouds =====
	let clouds = [];
	// ===== Airplane (decorative) =====
	let airplane = null;
	let airplaneSpawnAccumulator = 0;
	let airplaneSpawnInterval = 30000; // 30 sekund

	function spawnAirplane() {
		const side = Math.random() < 0.5 ? 'left' : 'right';
		const y = rand(height * 0.08, height * 0.25); // wysoko w tle
		const x = side === 'left' ? -160 : width + 160;
		const speed = 0.12 + Math.random() * 0.08; // px/ms
		const vx = (side === 'left' ? 1 : -1) * speed;
		airplane = { x, y, vx, age: 0 };
	}

	function drawAirplane() {
		if (!airplane) return;
		ctx.save();
		ctx.translate(airplane.x, airplane.y);
		ctx.scale(airplane.vx < 0 ? -1 : 1, 1); // odwróć jeśli leci w lewo
		// Kadłub
		ctx.fillStyle = 'rgba(200,200,200,0.6)';
		ctx.beginPath();
		ctx.ellipse(0, 0, 80, 16, 0, 0, Math.PI * 2);
		ctx.fill();
		// Skrzydła
		ctx.fillStyle = 'rgba(180,180,180,0.5)';
		ctx.beginPath();
		ctx.ellipse(-30, 0, 50, 8, 0, 0, Math.PI * 2);
		ctx.ellipse(30, 0, 50, 8, 0, 0, Math.PI * 2);
		ctx.fill();
		// Kabina
		ctx.fillStyle = 'rgba(150,150,150,0.4)';
		ctx.beginPath();
		ctx.ellipse(0, -12, 24, 12, 0, 0, Math.PI * 2);
		ctx.fill();
		// Silniki
		ctx.fillStyle = 'rgba(160,160,160,0.5)';
		ctx.beginPath();
		ctx.ellipse(-50, 0, 12, 8, 0, 0, Math.PI * 2);
		ctx.ellipse(50, 0, 12, 8, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

	function initClouds() {
		clouds = [];
		const count = Math.max(6, Math.floor(width / 260));
		for (let i = 0; i < count; i++) {
			clouds.push({
				x: Math.random() * width,
				y: Math.random() * height * 0.45,
				r: 30 + Math.random() * 60,
				speed: 0.02 + Math.random() * 0.06
			});
		}
	}

	function drawBackground() {
		// Sky gradient (daytime)
		const g = ctx.createLinearGradient(0, 0, 0, height);
		g.addColorStop(0, '#87ceeb');
		g.addColorStop(1, '#bde0ff');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, width, height);

		// Soft clouds
		for (const c of clouds) {
			const alpha = 0.75;
			ctx.fillStyle = `rgba(255,255,255,${alpha})`;
			// draw cloud as few overlapping ellipses
			ctx.beginPath();
			ctx.ellipse(c.x, c.y, c.r * 1.1, c.r * 0.65, 0, 0, Math.PI * 2);
			ctx.ellipse(c.x - c.r * 0.8, c.y + c.r * 0.05, c.r * 0.9, c.r * 0.55, 0, 0, Math.PI * 2);
			ctx.ellipse(c.x + c.r * 0.85, c.y + c.r * 0.1, c.r * 0.95, c.r * 0.6, 0, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	function spawnFireworkBurst() {
		const x = rand(width * 0.1, width * 0.9);
		const y = rand(height * 0.1, height * 0.5);
		const colors = ['#ff7675','#ffe066','#74c0fc','#63e6be','#b197fc'];
		const color = colors[Math.floor(Math.random()*colors.length)];
		const count = 50 + Math.floor(Math.random()*40);
		for (let i = 0; i < count; i++) {
			const angle = Math.random() * Math.PI * 2;
			const speed = 0.08 + Math.random() * 0.25; // px/ms
			fireworks.push({
				x,
				y,
				vx: Math.cos(angle) * speed,
				vy: Math.sin(angle) * speed,
				age: 0,
				ttl: 1200 + Math.random() * 800,
				r: rand(1.2, 2.2),
				color
			});
		}
	}

	function updateFireworks(dt) {
		const next = [];
		for (const f of fireworks) {
			f.age += dt;
			if (f.age >= f.ttl) continue;
			// gravity and fade
			f.vy += 0.00025 * dt;
			f.x += f.vx * dt;
			f.y += f.vy * dt;
			next.push(f);
		}
		fireworks = next;
	}

	function drawFireworks() {
		for (const f of fireworks) {
			const life = f.age / f.ttl;
			ctx.globalAlpha = Math.max(0, 1 - life);
			ctx.fillStyle = f.color;
			ctx.beginPath();
			ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}

	function spawnPowerup(type) {
		const side = Math.random() < 0.5 ? 'left' : 'right';
		const y = rand(height * 0.15, height * 0.6);
		const x = side === 'left' ? -20 : width + 20;
		const vx = (side === 'left' ? 1 : -1) * (0.18 + Math.random() * 0.12); // px/ms
		powerups.push({ x, y, vx, r: 14, age: 0, type });
	}

	function updatePowerups(dt) {
		// Rewolwer power-up
		powerupRevolverAcc += dt;
		if (powerupRevolverAcc >= powerupRevolverIntervalMs) {
			powerupRevolverAcc = 0;
			powerupRevolverIntervalMs = 18000 + Math.floor(Math.random() * 12000);
			spawnPowerup('revolver');
		}
		// Bazooka power-up
		powerupBazookaAcc += dt;
		if (powerupBazookaAcc >= powerupBazookaIntervalMs) {
			powerupBazookaAcc = 0;
			powerupBazookaIntervalMs = 24000 + Math.floor(Math.random() * 14000);
			spawnPowerup('bazooka');
		}
		const next = [];
		for (const u of powerups) {
			u.age += dt;
			u.x += u.vx * dt;
			if (u.x < -40 || u.x > width + 40) continue;
			next.push(u);
		}
		powerups = next;
	}

	function drawPowerups() {
		for (const u of powerups) {
			// świecący pocisk
			ctx.save();
			ctx.translate(u.x, u.y);
			const col = u.type === 'bazooka' ? '#7bd88f' : '#ffd166';
			ctx.fillStyle = col;
			ctx.shadowColor = col;
			ctx.shadowBlur = 12;
			ctx.beginPath();
			ctx.ellipse(0, 0, u.r, u.r * 0.45, 0.2, 0, Math.PI * 2);
			ctx.fill();
			ctx.fillStyle = '#fffcf0';
			ctx.shadowBlur = 0;
			ctx.beginPath();
			ctx.ellipse(u.r * 0.3, -u.r * 0.08, u.r * 0.35, u.r * 0.15, 0.2, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
	}

	function drawPigeon(p) {
		ctx.save();
		ctx.translate(p.x, p.y);
		ctx.rotate(Math.atan2(p.vy, p.vx));
		if (level >= 2) ctx.globalAlpha = 0.28; // ledwo widoczne
		// Body
		const bodyRadius = p.isGolden ? (level >= 2 ? p.r * 0.5 : p.r) : p.r;
		const bodyBaseColor = p.isGolden ? '#ffe082' : (p.isSilver ? '#dfe4ec' : '#c2c7d3');
		const headBaseColor = p.isGolden ? '#fff0b3' : (p.isSilver ? '#f5f7fa' : '#e1e4eb');
		const wingBaseColor = p.isGolden ? '#ffd54f' : (p.isSilver ? '#c6ccd6' : '#a8aebd');
		const hitColor = 'rgba(255,107,107,0.9)';
		// Miganie czerwone tylko na początku (pierwsze 50ms)
		const isFlashing = p.hit && p.flashMs !== undefined && p.flashMs > 130;
		ctx.fillStyle = isFlashing ? hitColor : bodyBaseColor;
		ctx.beginPath();
		ctx.ellipse(0, 0, bodyRadius, bodyRadius * 0.65, 0, 0, Math.PI * 2);
		ctx.fill();
		// Head
		ctx.fillStyle = isFlashing ? hitColor : headBaseColor;
		const headOffset = p.isGolden ? bodyRadius * 0.9 : p.r * 0.9;
		const headRadius = p.isGolden ? bodyRadius * 0.35 : p.r * 0.35;
		ctx.beginPath();
		ctx.arc(headOffset, -bodyRadius * 0.2, headRadius, 0, Math.PI * 2);
		ctx.fill();
		// Eye
		ctx.fillStyle = '#0b0e1a';
		ctx.beginPath();
		ctx.arc(headOffset * 1.1, -bodyRadius * 0.25, headRadius * 0.25, 0, Math.PI * 2);
		ctx.fill();
		// Wing (flap)
		const flap = Math.sin(p.age * 0.02) * 0.5 + 0.5;
		ctx.fillStyle = isFlashing ? hitColor : wingBaseColor;
		ctx.beginPath();
		const wingRadiusX = p.isGolden ? bodyRadius * 0.85 : p.r * 0.9;
		const wingRadiusY = p.isGolden ? bodyRadius * (0.4 + 0.2 * flap) : p.r * (0.4 + 0.2 * flap);
		ctx.ellipse(0, -bodyRadius * 0.3, wingRadiusX, wingRadiusY, Math.PI * 0.15, 0, Math.PI * 2);
		ctx.fill();
		// Golden halo
		if (p.isGolden) {
			ctx.strokeStyle = 'rgba(255,215,64,0.8)';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc(0, 0, bodyRadius * 1.2, 0, Math.PI * 2);
			ctx.stroke();
		}

		// Bomb indicator (bigger, directly under pigeon)
		if (p.isBomb) {
			const bombX = -p.r * 0.1; // under body center
			const bombY = p.r * 0.5; // directly below body
			// bomb body (bigger)
			const br = p.r * 0.38;
			ctx.fillStyle = '#1c1c22';
			ctx.beginPath();
			ctx.arc(bombX, bombY, br, 0, Math.PI * 2);
			ctx.fill();
			// cap and fuse
			ctx.fillStyle = '#2a2a30';
			ctx.beginPath();
			ctx.ellipse(bombX, bombY - br * 0.55, br * 0.55, br * 0.22, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.strokeStyle = '#ffce73';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(bombX, bombY - br * 0.75);
			ctx.quadraticCurveTo(bombX + 6, bombY - br * 1.2, bombX + 2, bombY - br * 1.5);
			ctx.stroke();
			// red marking
			ctx.strokeStyle = '#ff6b6b';
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(bombX - br * 0.6, bombY);
			ctx.lineTo(bombX + br * 0.6, bombY);
			ctx.stroke();
		}
		ctx.restore();
	}

	function drawParticles(dt) {
		const next = [];
		for (const part of particles) {
			part.age += dt;
			const life = part.age / part.ttl;
			if (life >= 1) continue;
			const speed = 120;
			const angle = (part.seed || (part.seed = Math.random() * Math.PI * 2));
			const vx = Math.cos(angle) * speed / 60;
			const vy = Math.sin(angle) * speed / 60 + life * 0.8;
			part.x += vx * dt;
			part.y += vy * dt;
			ctx.globalAlpha = 1 - life;
			ctx.fillStyle = '#ffefef';
			ctx.beginPath();
			ctx.arc(part.x, part.y, part.r, 0, Math.PI * 2);
			ctx.fill();
			ctx.globalAlpha = 1;
			next.push(part);
		}
		particles = next;
	}

	function drawCrosshair() {
		if (!mouse.visible) return;
		// Crosshair drawn on canvas to respect DPI scaling
		ctx.save();
		const isSpecial = specialReady === true;
		ctx.strokeStyle = isSpecial ? 'rgba(255,209,102,0.95)' : 'rgba(255,255,255,0.8)';
		ctx.lineWidth = isSpecial ? 3 : 2;
		ctx.beginPath();
		const r = isSpecial ? 13 : 9;
		const arm = isSpecial ? 18 : 14;
		ctx.arc(mouse.x, mouse.y, r, 0, Math.PI * 2);
		ctx.moveTo(mouse.x - arm, mouse.y);
		ctx.lineTo(mouse.x + arm, mouse.y);
		ctx.moveTo(mouse.x, mouse.y - arm);
		ctx.lineTo(mouse.x, mouse.y + arm);
		ctx.stroke();
		ctx.restore();
	}

	function update(dt) {
		// Spawn pigeons over time
		spawnAccumulator += dt;
		// Fewer pigeons overall; slight acceleration over time
		const spawnEvery = Math.max(900, 1800 - elapsed * 0.2);
		while (spawnAccumulator >= spawnEvery) {
			spawnAccumulator -= spawnEvery;
			spawnPigeon();
		}

		// Zaplanowane pojawienie złotego gołębia (dokładnie raz na rundę)
		if (!goldenSpawned && elapsed >= goldenSpawnAtMs && !hasGoldenPigeon()) {
			spawnGoldenPigeon();
			goldenSpawned = true;
		}
		if (!silverSpawned && elapsed >= silverSpawnAtMs && !hasSilverPigeon()) {
			spawnSilverPigeon();
			silverSpawned = true;
		}

		// Move pigeons
		const next = [];
		for (const p of pigeons) {
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.age += dt;
			if (p.falling) {
				if (p.flashMs !== undefined && p.flashMs > 0) {
					p.flashMs = Math.max(0, p.flashMs - dt);
					if (p.flashMs === 0) {
						p.hit = false;
					}
				}
				// Spadające gołębie: delikatna grawitacja z ograniczeniem prędkości
				p.vy = Math.min(p.vy + FALL_GRAVITY * dt, FALL_TERMINAL_VY);
				// Usuń gdy spadnie poza ekran
				if (p.y > height + p.r * 3) continue;
			} else {
				// gentle vertical drift
				p.vy += Math.sin(p.age * 0.003) * 0.0015;
				// keep within vertical bounds
				if (p.y < height * 0.08) p.vy = Math.abs(p.vy);
				if (p.y > height * 0.9) p.vy = -Math.abs(p.vy);
			}
			// off screen?
			if (p.x < -p.r * 3 || p.x > width + p.r * 3) continue;
			next.push(p);
		}
		pigeons = next;

		// Move clouds
		for (const c of clouds) {
			c.x += c.speed * dt * (width / 1000);
			if (c.x - c.r * 1.5 > width) {
				c.x = -c.r * 1.5;
				c.y = Math.random() * height * 0.45;
			}
		}

		// Fireworks update
		updateFireworks(dt);

		// Powerups update
		updatePowerups(dt);

		// Samolot: spawnowanie i ruch
		airplaneSpawnAccumulator += dt;
		if (airplaneSpawnAccumulator >= airplaneSpawnInterval) {
			airplaneSpawnAccumulator = 0;
			airplaneSpawnInterval = 25000 + Math.floor(Math.random() * 20000); // 25-45 sekund
			if (!airplane) {
				spawnAirplane();
			}
		}
		if (airplane) {
			airplane.x += airplane.vx * dt;
			airplane.age += dt;
			// Usuń gdy wyjdzie poza ekran
			if ((airplane.vx < 0 && airplane.x < -100) || (airplane.vx > 0 && airplane.x > width + 100)) {
				airplane = null;
			}
		}

		// Karabin maszynowy: automatyczne strzelanie przy przytrzymaniu przycisku myszy
		if (currentWeapon === 'machinegun' && mouseDown && running && machinegunAmmo > 0) {
			const now = Date.now();
			if (now - machinegunLastShot >= machinegunFireRate) {
				machinegunLastShot = now;
				// symuluj kliknięcie myszy w aktualnej pozycji kursora
				const fakeEvent = { clientX: mouse.x, clientY: mouse.y };
				shoot(fakeEvent);
			}
		}

		// Level-up when reaching 500 points
		if (!levelUpTriggered && score >= 500) {
			levelUpTriggered = true;
			level = 2;
			// Make current pigeons faster immediately
			for (const p of pigeons) {
				p.vx *= 2;
				p.vy *= 2;
			}
			// Launch fireworks bursts over a few seconds
			let bursts = 0;
			const maxBursts = 6;
			const interval = setInterval(() => {
				spawnFireworkBurst();
				bursts++;
				if (bursts >= maxBursts) clearInterval(interval);
			}, 450);
			if (levelLabelEl) levelLabelEl.textContent = '2-poziom';
		}
	}

	function render(dt) {
		drawBackground();
		drawAirplane(); // samolot w tle
		drawFireworks(); // fajerwerki za gołębiami
		drawPowerups();
		for (const p of pigeons) drawPigeon(p);
		drawParticles(dt);
		drawCrosshair();
		// Update timer text
		if (timerEl) {
			const remaining = Math.max(0, GAME_DURATION_MS - elapsed);
			timerEl.textContent = formatMs(remaining);
			// Visual warning last 3 seconds
			if (remaining <= 3000 && running) {
				timerEl.classList.add('timer--warning');
			} else {
				timerEl.classList.remove('timer--warning');
			}
			// Audio countdown beeps at 3,2,1 seconds
			const secLeft = Math.ceil(remaining / 1000);
			if (running && remaining > 0 && secLeft <= 3 && secLeft !== lastBeepSecond) {
				lastBeepSecond = secLeft;
				beep(secLeft);
			}
		}
		// Update ammo display
		updateAmmoDisplay();
	}

	function loop(ts) {
		if (!running) return;
		if (!lastTime) lastTime = ts;
		const dt = Math.min(50, ts - lastTime);
		lastTime = ts;
		elapsed += dt;

		update(dt);
		render(dt);
		// End after duration
		if (elapsed >= GAME_DURATION_MS) {
			endGame('time');
			return;
		}
		requestAnimationFrame(loop);
	}

	function start() {
		if (running) return;
		// wymagany rewolwer do rozpoczęcia
		if (weaponSelectEl && weaponSelectEl.value !== 'pistol') {
			if (weaponHintEl) weaponHintEl.style.display = '';
			return;
		}
		running = true;
		lastTime = 0;
		elapsed = 0;
		spawnAccumulator = 0;
		score = 0;
		misses = 0;
		lastBeepSecond = null;
		hitStreak = 0;
		specialReady = false;
		goldenSpawned = false;
		goldenSpawnAtMs = Math.floor(rand(8000, 50000));
		silverSpawned = false;
		silverSpawnAtMs = Math.floor(rand(12000, 55000));
		level = 1;
		levelUpTriggered = false;
		fireworks = [];
		pigeons = [];
		particles = [];
		initClouds();
		airplane = null;
		airplaneSpawnAccumulator = 0;
		airplaneSpawnInterval = 30000;
		scoreEl.textContent = String(score);
		missesEl.textContent = String(misses);
		if (timerEl) timerEl.textContent = formatMs(GAME_DURATION_MS);
		if (timerEl) timerEl.classList.remove('timer--warning');
		if (levelLabelEl) levelLabelEl.textContent = '1-poziom';
		overlay.classList.add('hidden');
		overlayStart.textContent = 'Graj';
		if (finalScoreEl) {
			finalScoreEl.style.display = 'none';
			finalScoreEl.textContent = '';
		}
		if (introTextEl) {
			introTextEl.style.display = '';
		}
		if (instructionsEl) {
			instructionsEl.style.display = '';
		}
		startBtn.disabled = true;
		resetBtn.disabled = false;
		playBackgroundMusic();
		requestAnimationFrame(loop);
		// wybór broni z overlay (jeśli dostępny)
		if (weaponSelectEl && weaponSelectEl.value) {
			currentWeapon = weaponSelectEl.value;
		}
		updateWeaponIcon();
		if (weaponIconEl) weaponIconEl.style.display = '';
		pistolShotsFired = 0;
		pistolReloadUntil = 0;
		pistolMagazineSize = 7;
		pistolExtendedActive = false;
		bazookaReloadUntil = 0;
		machinegunAmmo = 100;
		machinegunLastShot = 0;
		mouseDown = false;
		shotgunAmmo = 7;
		shotgunShotsFired = 0;
		shotgunReloadUntil = 0;
		shotgunLastShot = 0;
		updateAmmoDisplay();
		powerups = [];
		powerupRevolverAcc = 0;
		powerupRevolverIntervalMs = 18000 + Math.floor(Math.random() * 12000);
		powerupBazookaAcc = 0;
		powerupBazookaIntervalMs = 24000 + Math.floor(Math.random() * 14000);
		if (weaponHintEl) {
			weaponHintEl.style.display = (weaponSelectEl.value === 'pistol') ? 'none' : '';
		}
	}

	function reset() {
		running = false;
		pigeons = [];
		particles = [];
		drawBackground();
		drawCrosshair();
		initClouds();
		airplane = null;
		airplaneSpawnAccumulator = 0;
		airplaneSpawnInterval = 30000;
		score = 0;
		misses = 0;
		lastBeepSecond = null;
		hitStreak = 0;
		specialReady = false;
		goldenSpawned = false;
		goldenSpawnAtMs = Math.floor(rand(8000, 50000));
		silverSpawned = false;
		silverSpawnAtMs = Math.floor(rand(12000, 55000));
		level = 1;
		levelUpTriggered = false;
		fireworks = [];
		pistolShotsFired = 0;
		pistolReloadUntil = 0;
		pistolMagazineSize = 7;
		pistolExtendedActive = false;
		bazookaReloadUntil = 0;
		machinegunAmmo = 100;
		machinegunLastShot = 0;
		mouseDown = false;
		shotgunAmmo = 7;
		shotgunShotsFired = 0;
		shotgunReloadUntil = 0;
		shotgunLastShot = 0;
		powerups = [];
		powerupRevolverAcc = 0;
		powerupRevolverIntervalMs = 18000 + Math.floor(Math.random() * 12000);
		powerupBazookaAcc = 0;
		powerupBazookaIntervalMs = 24000 + Math.floor(Math.random() * 14000);
		scoreEl.textContent = '0';
		missesEl.textContent = '0';
		if (timerEl) timerEl.textContent = formatMs(GAME_DURATION_MS);
		if (timerEl) timerEl.classList.remove('timer--warning');
		if (levelLabelEl) levelLabelEl.textContent = '1-poziom';
		startBtn.disabled = false;
		resetBtn.disabled = true;
		overlay.classList.remove('hidden');
		overlayStart.textContent = 'Graj';
		if (finalScoreEl) {
			finalScoreEl.style.display = 'none';
			finalScoreEl.textContent = '';
		}
		if (introTextEl) {
			introTextEl.style.display = '';
		}
		if (instructionsEl) {
			instructionsEl.style.display = '';
		}
		if (weaponIconEl) weaponIconEl.style.display = 'none';
		stopBackgroundMusic();
		updateAmmoDisplay();
	}

	function endGame(reason = 'time') {
		running = false;
		startBtn.disabled = false;
		resetBtn.disabled = true;
		overlay.classList.remove('hidden');
		overlayStart.textContent = 'Zagraj ponownie';
		if (introTextEl) {
			introTextEl.style.display = 'none';
		}
		if (instructionsEl) {
			instructionsEl.style.display = 'none';
		}
		if (finalScoreEl) {
			const prefix = reason === 'misses' ? 'Za dużo pudłowań!' : 'Koniec czasu!';
			finalScoreEl.textContent = `${prefix} Wynik: ${score}  •  Pudła: ${misses}`;
			finalScoreEl.style.display = '';
		}
		if (timerEl) timerEl.classList.remove('timer--warning');
		stopBackgroundMusic();
		if (weaponIconEl) weaponIconEl.style.display = 'none';
		updateAmmoDisplay();
	}

	function formatMs(ms) {
		const total = Math.ceil(ms / 1000);
		const m = Math.floor(total / 60);
		const s = total % 60;
		return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
	}

	function beep(secLeft) {
		try {
			if (!audioCtx) {
				audioCtx = new (window.AudioContext || window.webkitAudioContext)();
			}
			// Slightly higher pitch as it gets closer to 0
			const base = 680;
			const freq = base + (4 - secLeft) * 140; // 3s->820, 2s->960, 1s->1100
			const duration = 0.12; // seconds
			const now = audioCtx.currentTime;

			const osc = audioCtx.createOscillator();
			osc.type = 'sine';
			osc.frequency.setValueAtTime(freq, now);

			const gain = audioCtx.createGain();
			gain.gain.setValueAtTime(0.001, now);
			gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

			osc.connect(gain).connect(audioCtx.destination);
			osc.start(now);
			osc.stop(now + duration);
		} catch (e) {
			// ignore audio errors (e.g., autoplay policies)
		}
	}

	function toCanvasCoords(evt) {
		// Jeśli evt ma już x i y (fakeEvent dla karabinu maszynowego), użyj ich
		if (evt.x !== undefined && evt.y !== undefined) {
			return { x: evt.x, y: evt.y };
		}
		const rect = canvas.getBoundingClientRect();
		const x = (evt.clientX - rect.left);
		const y = (evt.clientY - rect.top);
		return { x, y };
	}

	function shoot(evt) {
		if (!running) return;
		const { x, y } = toCanvasCoords(evt);
		// efekt błysku
		const flash = document.createElement('div');
		flash.className = 'flash';
		flash.style.setProperty('--x', x + 'px');
		flash.style.setProperty('--y', y + 'px');
		document.body.appendChild(flash);
		setTimeout(() => flash.remove(), 180);
		// dźwięk strzału
		playShot();

		// Trafienie power-upa? (kliknięcie w pocisk)
		for (let i = 0; i < powerups.length; i++) {
			const u = powerups[i];
			const dx = u.x - x;
			const dy = u.y - y;
			if (Math.hypot(dx, dy) < u.r) {
				if (u.type === 'revolver') {
					// aktywuj rozszerzony magazynek
					pistolMagazineSize = 12;
					pistolShotsFired = 0;
					pistolExtendedActive = true;
					playPowerup();
				} else if (u.type === 'bazooka') {
					// natychmiast gotowa bazuka (anuluje reload)
					bazookaReloadUntil = 0;
					playPowerupBazooka();
					updateAmmoDisplay();
				}
				powerups.splice(i, 1);
				break;
			}
		}

		// Karabin maszynowy: strzela bardzo szybko, 100 strzałów
		if (currentWeapon === 'machinegun') {
			if (machinegunAmmo <= 0) return; // brak amunicji
			machinegunAmmo -= 1;
			updateAmmoDisplay();
			// dalsza logika trafienia jak rewolwer (poniżej)
		}

		// Strzelba: strzela wolno, 7 pocisków, przeładowanie 7s
		if (currentWeapon === 'shotgun') {
			const now = Date.now();
			if (shotgunReloadUntil && now < shotgunReloadUntil) {
				return; // w trakcie przeładowania, strzał zablokowany
			}
			// Sprawdź czy minęło wystarczająco czasu od ostatniego strzału (wolne strzelanie)
			if (now - shotgunLastShot < shotgunFireRate) {
				return; // zbyt szybko, strzał zablokowany
			}
			shotgunLastShot = now;
			shotgunShotsFired += 1;
			updateAmmoDisplay();
			if (shotgunShotsFired >= shotgunAmmo) {
				shotgunShotsFired = 0;
				shotgunReloadUntil = now + 7000; // 7 sekund przeładowania
				try {
					if (reloadAudioEl) {
						reloadAudioEl.currentTime = 0;
						reloadAudioEl.volume = 0.9;
						reloadAudioEl.play().catch(() => {});
					}
				} catch {}
				updateAmmoDisplay();
			}
			// dalsza logika trafienia jak rewolwer (poniżej)
		}

		// Przeładowanie rewolweru po N strzałach: blokada na 3s
		if (currentWeapon === 'pistol') {
			const now = Date.now();
			if (pistolReloadUntil && now < pistolReloadUntil) {
				return; // w trakcie przeładowania, strzał zablokowany
			}
			pistolShotsFired += 1;
			updateAmmoDisplay();
			if (pistolShotsFired >= pistolMagazineSize) {
				pistolShotsFired = 0;
				pistolReloadUntil = now + 3000;
				try {
					if (reloadAudioEl) {
						reloadAudioEl.currentTime = 0;
						reloadAudioEl.volume = 0.9;
						reloadAudioEl.play().catch(() => {});
					}
				} catch {}
				// po przeładowaniu wracamy do standardowych 7 jeśli było rozszerzenie
				if (pistolExtendedActive) {
					pistolExtendedActive = false;
					pistolMagazineSize = 7;
				}
				updateAmmoDisplay();
			}
		}

		let hitAny = false;
		if (currentWeapon === 'bazooka') {
			const now = Date.now();
			if (bazookaReloadUntil && now < bazookaReloadUntil) {
				return; // bazuka przeładowuje się
			}
			// Bazuka: zabija do pięciu najbliższych w zasięgu
			const candidates = [];
			for (let i = 0; i < pigeons.length; i++) {
				const p = pigeons[i];
				const dx = p.x - x;
				const dy = p.y - y;
				const dist = Math.hypot(dx, dy);
				const radiusMultiplier = 1.2; // nieco większy zasięg
				if (dist < p.r * radiusMultiplier) {
					candidates.push({ index: i, dist });
				}
			}
			candidates.sort((a,b) => a.dist - b.dist);
			const toKill = candidates.slice(0, 5);
			let bombHit = false;
			for (const target of toKill) {
				const p = pigeons[target.index];
				if (!p || p.falling) continue;
				if (p.isBomb) bombHit = true;
				else score += getPigeonPoints(p);
				addHitParticles(p.x, p.y, p.r);
				// Ustaw gołębia na spadanie zamiast natychmiastowego usuwania
				p.falling = true;
				p.hit = true;
				p.flashMs = 180;
				p.vx *= 0.3; // zmniejsz prędkość poziomą
				p.vy = -0.15; // mały skok w górę po trafieniu
				hitAny = true;
			}
			if (hitAny) {
				if (bombHit) {
					score = 0;
					scoreEl.textContent = '0';
					playBombPenalty();
				} else {
					scoreEl.textContent = String(score);
				}
				playExplosion();
			}
			// Bazuka nie wpływa na serię specjalną
			if (!hitAny) {
				misses += 1;
				missesEl.textContent = String(misses);
				if (misses >= MAX_MISSES) {
					endGame('misses');
					return;
				}
			}
			// bazuka przeładowuje się po każdym strzale (trafionym lub nie)
			bazookaReloadUntil = Date.now() + 3000;
			updateAmmoDisplay();
			return;
		}

		const usingSpecial = specialReady === true;
		const radiusMultiplier = usingSpecial ? 1.8 : 0.9;
		// znajdź najbliższego gołębia (dla zwykłego strzału)
		let bestIndex = -1;
		let bestDist = Infinity;
		for (let i = 0; i < pigeons.length; i++) {
			const p = pigeons[i];
			if (!usingSpecial && p.isSilver) continue; // srebrnego trafia tylko bazooka
			const dx = p.x - x;
			const dy = p.y - y;
			const dist = Math.hypot(dx, dy);
			if (dist < p.r * radiusMultiplier && dist < bestDist) {
				bestDist = dist;
				bestIndex = i;
			}
		}
		if (usingSpecial) {
			// Wybuch w promieniu
			specialReady = false;
			const blastRadius = 120;
			let bombHit = false;
			for (let i = 0; i < pigeons.length; i++) {
				const p = pigeons[i];
				if (p.falling) continue; // pomiń już spadające
				if (p.isSilver) continue; // srebrny odporność na wybuch specjalny
				const dx = p.x - x;
				const dy = p.y - y;
				const d = Math.hypot(dx, dy);
				if (d <= blastRadius) {
					addHitParticles(p.x, p.y, p.r);
					if (p.isBomb) {
						bombHit = true;
					} else {
						score += getPigeonPoints(p);
					}
					// Ustaw gołębia na spadanie zamiast natychmiastowego usuwania
					p.falling = true;
					p.hit = true;
					p.flashMs = 180;
					p.vx *= 0.3;
					p.vy = -0.15; // mały skok w górę po trafieniu
					hitAny = true;
				}
			}
			if (hitAny) playHitSample();
			if (bombHit) {
				// kara: utrata wszystkich punktów
				score = 0;
				scoreEl.textContent = '0';
				playBombPenalty();
			} else if (hitAny) {
				scoreEl.textContent = String(score);
			}
			addExplosionParticles(x, y, blastRadius);
			playExplosion();
		} else if (bestIndex !== -1) {
			const p = pigeons[bestIndex];
			if (!p.falling) {
				p.hit = true;
				p.flashMs = 180;
				addHitParticles(p.x, p.y, p.r);
				// Ustaw gołębia na spadanie zamiast natychmiastowego usuwania
				p.falling = true;
				p.vx *= 0.3; // zmniejsz prędkość poziomą
				p.vy = -0.15; // mały skok w górę po trafieniu
				if (p.isBomb) {
					// kara: utrata wszystkich punktów
					score = 0;
					scoreEl.textContent = '0';
					playBombPenalty();
				} else {
					const points = getPigeonPoints(p);
					score += points;
					scoreEl.textContent = String(score);
					// seria trafień i specjalny nabój
					hitStreak += 1;
					if (hitStreak >= 5) {
						specialReady = true;
						hitStreak = 0;
					}
				}
				playHitSample();
				hitAny = true;
			}
		}
		if (!hitAny && !usingSpecial) {
			misses += 1;
			missesEl.textContent = String(misses);
			hitStreak = 0;
			if (misses >= MAX_MISSES) {
				endGame('misses');
				return;
			}
		}
	}

	function playShot() {
		try {
			if (!audioCtx) {
				audioCtx = new (window.AudioContext || window.webkitAudioContext)();
			}
			const now = audioCtx.currentTime;
			// White noise burst + triangle click
			const duration = 0.09;
			const sampleRate = audioCtx.sampleRate;
			const bufferSize = Math.floor(sampleRate * duration);
			const noiseBuffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
			const data = noiseBuffer.getChannelData(0);
			for (let i = 0; i < bufferSize; i++) {
				const t = i / bufferSize;
				data[i] = (Math.random() * 2 - 1) * (1 - t);
			}
			const noise = audioCtx.createBufferSource();
			noise.buffer = noiseBuffer;
			const hp = audioCtx.createBiquadFilter();
			hp.type = 'highpass';
			hp.frequency.value = 1000;
			const bp = audioCtx.createBiquadFilter();
			bp.type = 'bandpass';
			bp.frequency.value = 1800;
			bp.Q.value = 0.9;
			const gain = audioCtx.createGain();
			gain.gain.setValueAtTime(0.0001, now);
			gain.gain.linearRampToValueAtTime(0.28, now + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
			noise.connect(hp).connect(bp).connect(gain).connect(audioCtx.destination);
			noise.start(now);
			noise.stop(now + duration);
			const osc = audioCtx.createOscillator();
			osc.type = 'triangle';
			osc.frequency.setValueAtTime(1500, now);
			osc.frequency.exponentialRampToValueAtTime(500, now + 0.07);
			const oscGain = audioCtx.createGain();
			oscGain.gain.setValueAtTime(0.0001, now);
			oscGain.gain.linearRampToValueAtTime(0.1, now + 0.004);
			oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
			osc.connect(oscGain).connect(audioCtx.destination);
			osc.start(now);
			osc.stop(now + 0.08);
		} catch (e) {}
	}

	function addExplosionParticles(x, y, radius) {
		const n = 50;
		for (let i = 0; i < n; i++) {
			particles.push({
				x,
				y,
				age: 0,
				ttl: 500 + Math.random() * 500,
				r: rand(2, 4.5),
				seed: Math.random() * Math.PI * 2
			});
		}
	}

	function playExplosion() {
		try {
			if (!audioCtx) {
				audioCtx = new (window.AudioContext || window.webkitAudioContext)();
			}
			const now = audioCtx.currentTime;
			// Krótsza, miękka eksplozja: noise + lowpass sweep
			const duration = 0.35;
			const sampleRate = audioCtx.sampleRate;
			const bufferSize = Math.floor(sampleRate * duration);
			const noiseBuffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
			const data = noiseBuffer.getChannelData(0);
			for (let i = 0; i < bufferSize; i++) {
				const t = i / bufferSize;
				data[i] = (Math.random() * 2 - 1) * (1 - t);
			}
			const noise = audioCtx.createBufferSource();
			noise.buffer = noiseBuffer;
			const lp = audioCtx.createBiquadFilter();
			lp.type = 'lowpass';
			lp.frequency.setValueAtTime(800, now);
			lp.frequency.exponentialRampToValueAtTime(200, now + duration);
			const gain = audioCtx.createGain();
			gain.gain.setValueAtTime(0.0001, now);
			gain.gain.linearRampToValueAtTime(0.5, now + 0.03);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
			noise.connect(lp).connect(gain).connect(audioCtx.destination);
			noise.start(now);
			noise.stop(now + duration);
		} catch (e) {}
	}

	function playBombPenalty() {
		try {
			if (!audioCtx) {
				audioCtx = new (window.AudioContext || window.webkitAudioContext)();
			}
			const now = audioCtx.currentTime;
			const osc = audioCtx.createOscillator();
			osc.type = 'sawtooth';
			osc.frequency.setValueAtTime(500, now);
			osc.frequency.exponentialRampToValueAtTime(160, now + 0.25);
			const gain = audioCtx.createGain();
			gain.gain.setValueAtTime(0.0001, now);
			gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
			gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
			osc.connect(gain).connect(audioCtx.destination);
			osc.start(now);
			osc.stop(now + 0.3);
		} catch (e) {}
	}

	function playHitSample() {
		try {
			if (shotAudioEl) {
				shotAudioEl.currentTime = 0;
				shotAudioEl.volume = 0.9;
				shotAudioEl.play().catch(() => {
					// fallback to synth if autoplay blocks
					playShot();
				});
			} else {
				playShot();
			}
		} catch { playShot(); }
	}

	function playPowerup() {
		try {
			if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
			const now = audioCtx.currentTime;
			const o1 = audioCtx.createOscillator();
			const g1 = audioCtx.createGain();
			o1.type = 'sine';
			o1.frequency.setValueAtTime(660, now);
			o1.frequency.exponentialRampToValueAtTime(990, now + 0.18);
			g1.gain.setValueAtTime(0.0001, now);
			g1.gain.linearRampToValueAtTime(0.18, now + 0.02);
			g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
			o1.connect(g1).connect(audioCtx.destination);
			o1.start(now);
			o1.stop(now + 0.25);
		} catch {}
	}

	function playPowerupBazooka() {
		try {
			if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
			const now = audioCtx.currentTime;
			const o1 = audioCtx.createOscillator();
			const g1 = audioCtx.createGain();
			o1.type = 'square';
			o1.frequency.setValueAtTime(420, now);
			o1.frequency.exponentialRampToValueAtTime(620, now + 0.16);
			g1.gain.setValueAtTime(0.0001, now);
			g1.gain.linearRampToValueAtTime(0.16, now + 0.02);
			g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
			o1.connect(g1).connect(audioCtx.destination);
			o1.start(now);
			o1.stop(now + 0.22);
		} catch {}
	}

	// ====== Leaderboard (localStorage) ======
	function loadLeaderboard() {
		try {
			const raw = localStorage.getItem('ps_leaderboard');
			if (!raw) return [];
			const arr = JSON.parse(raw);
			return Array.isArray(arr) ? arr : [];
		} catch { return []; }
	}

	function saveLeaderboard(items) {
		try {
			localStorage.setItem('ps_leaderboard', JSON.stringify(items));
		} catch {}
	}

	function addScoreToLeaderboard() {
		const name = prompt('Podaj nick do rankingu:', 'Gracz') || 'Gracz';
		const entry = { name: String(name).slice(0, 24), score, misses, date: Date.now() };
		const items = loadLeaderboard();
		items.push(entry);
		items.sort((a, b) => b.score - a.score || a.misses - b.misses || a.date - b.date);
		const top10 = items.slice(0, 10);
		saveLeaderboard(top10);
	}

	function renderLeaderboard() {
		if (!leaderboardListEl) return;
		const items = loadLeaderboard();
		leaderboardListEl.innerHTML = '';
		for (const it of items) {
			const li = document.createElement('li');
			li.textContent = `${it.name} — ${it.score} pkt`;
			leaderboardListEl.appendChild(li);
		}
	}

	function playBackgroundMusic() {
		if (!bgMusicEl) return;
		bgMusicEl.volume = 0.2;
		bgMusicEl.currentTime = 0;
		bgMusicEl.play().catch(() => {
			// Autoplay blocked: ignore silently
		});
	}

	function stopBackgroundMusic() {
		if (!bgMusicEl) return;
		try {
			bgMusicEl.pause();
		} catch {}
	}

	// Events
	window.addEventListener('resize', resize);
	resize();
	initClouds();
	drawBackground();
	if (weaponIconEl) weaponIconEl.style.display = 'none';

	// Klawiatura: przełączanie broni (1 = pistolet)
	window.addEventListener('keydown', (e) => {
		if (e.key === '1') {
			currentWeapon = 'pistol';
			if (weaponSelectEl) weaponSelectEl.value = 'pistol';
			updateWeaponIcon();
			updateAmmoDisplay();
		}
		if (e.key === '2') {
			currentWeapon = 'bazooka';
			if (weaponSelectEl) weaponSelectEl.value = 'bazooka';
			updateWeaponIcon();
			updateAmmoDisplay();
		}
		if (e.key === '3') {
			currentWeapon = 'machinegun';
			if (weaponSelectEl) weaponSelectEl.value = 'machinegun';
			updateWeaponIcon();
			updateAmmoDisplay();
		}
		if (e.key === '4') {
			currentWeapon = 'shotgun';
			if (weaponSelectEl) weaponSelectEl.value = 'shotgun';
			updateWeaponIcon();
			updateAmmoDisplay();
		}
	});

	if (weaponSelectEl) {
		weaponSelectEl.addEventListener('change', () => {
			if (weaponSelectEl && weaponSelectEl.value) {
				currentWeapon = weaponSelectEl.value;
				updateWeaponIcon();
				updateAmmoDisplay();
				if (weaponHintEl) {
					weaponHintEl.style.display = (weaponSelectEl.value === 'pistol') ? 'none' : '';
				}
			}
		});
	}

	canvas.addEventListener('mousemove', (e) => {
		const { x, y } = toCanvasCoords(e);
		mouse.x = x;
		mouse.y = y;
		mouse.visible = true;
	});
	canvas.addEventListener('mouseleave', () => {
		mouse.visible = false;
	});
	canvas.addEventListener('mousedown', (e) => {
		e.preventDefault();
		if (currentWeapon === 'machinegun') {
			mouseDown = true;
			machinegunLastShot = 0; // pozwól na natychmiastowy pierwszy strzał
		} else {
			shoot(e);
		}
	});
	canvas.addEventListener('mouseup', () => {
		mouseDown = false;
	});
	canvas.addEventListener('mouseleave', () => {
		mouse.visible = false;
		mouseDown = false;
	});

	startBtn.addEventListener('click', start);
	resetBtn.addEventListener('click', reset);
	overlayStart.addEventListener('click', start);

})();


