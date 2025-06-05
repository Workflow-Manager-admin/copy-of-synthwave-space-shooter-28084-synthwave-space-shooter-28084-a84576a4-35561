import React, { useRef, useEffect, useState, useCallback } from "react";
import "./App.css";
// Supabase integration via CDN workaround utility
import {
  getLeaderboard as getSupabaseLeaderboard
} from "./supabaseClient";

// Example: Save a player's score (provided API as per subtask)
// Uses the connected Supabase client to insert a row into the "scores" table
async function saveScore(playerName, score) {
  const { data, error } = await window.supabase
    .from('scores')
    .insert([
      { player_name: playerName, score: score }
    ]);
  if (error) console.error(error)
  else console.log('Score saved!', data)
}

/**
 * --- Synthwave Space Shooter ---
 * Main Container, all-in-one for game logic, UI, and effects.
 * All game state and screens exist here for simplicity.
 * Uses HTML5 Canvas for effects and animations.
 */

// COLORS (Synthwave palette)
const COLORS = {
  primary: "#594592",
  secondary: "#0f3460",
  accent: "#e94560",
  white: "#fff",
  neon: "#00fff7"
};

const GAME_WIDTH = 420;
const GAME_HEIGHT = 600;

// Sprite and game meta settings
const PLAYER_W = 46, PLAYER_H = 34, PLAYER_SPEED = 6;
const ENEMY_W = 32, ENEMY_H = 32;
const BULLET_W = 4, BULLET_H = 16, BULLET_SPEED = 10;
const ENEMY_TYPES = [
  { speed: 2, points: 100, color: "#e94560", size: 1, meme: "🐶" }, // Normal
  { speed: 3, points: 200, color: "#fff057", size: 0.6, meme: "👽" }, // Small/fast
  { speed: 1.4, points: 350, color: "#40ddff", size: 1.5, meme: "🤖" } // Large/slow
];
const ENEMY_SPAWN_INTERVAL = 900;
const ENEMY_SPEED_INCREMENT = 0.25; // Increases every 22s

// Power-Up meta
const POWER_UPS = [
  { type: "double", color: "#12fcbf", desc: "Double Laser" },
  { type: "shield", color: "#ffe062", desc: "Shield" },
  { type: "slow", color: "#a476ff", desc: "Slow Dawgs" }
];

// Meme overlay messages
const MEME_MESSAGES = [
  "Do a barrel roll!", "NOT EVEN CLOSE BABY!", "He can't keep getting away with this.",
  "Did you really try your best?", "That was... totally dawg.", "You have been out-synthwaved."
];

// --- Main App ---
function App() {
  const [screen, setScreen] = useState("home"); // home, game, gameover
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [leaderboard, setLeaderboard] = useState([]);
  const [memeMsg, setMemeMsg] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Game state refs for Canvas logic
  const animationRef = useRef();
  const canvasRef = useRef();

  // Option to use Supabase for all leaderboard operations (default: true)
  const useSupabase = true;

  // Main game vars
  const stateRef = useRef(null);

  // Load leaderboard from Supabase or fallback to localStorage
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (useSupabase) {
        try {
          const lb = await getSupabaseLeaderboard(10);
          if (mounted) setLeaderboard(lb);
        } catch {
          // Fallback to localStorage on error (Supabase misconfigured)
          if (mounted) setLeaderboard(loadLeaderboard());
        }
      } else {
        setLeaderboard(loadLeaderboard());
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  // PUBLIC_INTERFACE
  function startGame() {
    setScreen("game");
    setScore(0);
    setLives(3);
    // Instantly start game without any confirmation or delay
    runGame();
  }

  // PUBLIC_INTERFACE
  function quitGameToHome() {
    setScreen("home");
  }

  // PUBLIC_INTERFACE
  function showBoard() {
    setShowLeaderboard(true);
  }
  function hideBoard() {
    setShowLeaderboard(false);
  }

  // PUBLIC_INTERFACE
  function handleGameOver(newScore) {
    // (Async) Update leaderboard via Supabase, fallback to localStorage if error
    const doPost = async () => {
      let prevHighScore = leaderboard.length > 0 ? leaderboard[0].points : 0;
      let name = playerName || promptName();
      if (newScore > 0 && useSupabase) {
        try {
          await saveScore(name, newScore); // CHANGED: use provided saveScore for Supabase
          // Optionally, you may refetch the leaderboard if your in-app code expects to show the user their ranking.
          const lb = await getSupabaseLeaderboard(10);
          setLeaderboard(lb);
          saveLeaderboard(lb);
          prevHighScore = lb.length > 0 ? lb[0].points : 0;
        } catch {
          // Fallback: update locally if Supabase fails
          let highScores = insertLeaderboard(loadLeaderboard(), name, newScore, 10);
          setLeaderboard(highScores);
          saveLeaderboard(highScores);
          prevHighScore = highScores.length > 0 ? highScores[0].points : 0;
        }
      } else if (newScore > 0) {
        let highScores = insertLeaderboard(loadLeaderboard(), name, newScore, 10);
        setLeaderboard(highScores);
        saveLeaderboard(highScores);
        prevHighScore = highScores.length > 0 ? highScores[0].points : 0;
      }

      // Set game over meme message
      if (newScore > prevHighScore) {
        setMemeMsg("Amazing Dawg! keep it up!");
      } else if (newScore < prevHighScore && newScore < 200) {
        setMemeMsg("Yo yo what kinda score is this");
      } else if (newScore < prevHighScore && newScore >= 200) {
        setMemeMsg("No Comments simply waste");
      } else {
        setMemeMsg(MEME_MESSAGES[Math.floor(Math.random() * MEME_MESSAGES.length)]);
      }
      setScreen("gameover");
    };

    doPost();
  }

  // --- Core Game Loop Logic ---
  const runGame = useCallback(() => {
    // All state kept in normal js objects/arrays for perf & ease (canvas uses them)
    let frame = 0, lastSpawn = 0, lastPowerUp = 0, speedUpEvery = 1320, activePower = null;
    // Game state
    let player = {
      x: GAME_WIDTH / 2 - PLAYER_W / 2,
      y: GAME_HEIGHT - PLAYER_H - 8,
      width: PLAYER_W, height: PLAYER_H,
      doubleBullet: false,
      shield: false
    };
    let enemies = [];
    let bullets = [];
    let explosions = [];
    let powerups = [];
    let powerTimer = 0;
    let currentLives = 3;
    let currentScore = 0;
    let enemySpeed = 1;
    let holdingLeft = false, holdingRight = false, firing = false, lastFire = 0;

    // Keyboard controls
    function onKeyDown(e) {
      if (screen !== "game") return;
      if (e.repeat) return;
      if (e.key === "ArrowLeft") holdingLeft = true;
      if (e.key === "ArrowRight") holdingRight = true;
      if (e.key === " " || e.key === "Spacebar") firing = true;
      if (e.key === "Escape") quitGameToHome();
    }
    function onKeyUp(e) {
      if (e.key === "ArrowLeft") holdingLeft = false;
      if (e.key === "ArrowRight") holdingRight = false;
      if (e.key === " " || e.key === "Spacebar") firing = false;
    }

    // Core Game Animate Loop
    function animate() {
      if (screen !== "game") {
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("keyup", onKeyUp);
        cancelAnimationFrame(animationRef.current);
        return;
      }

      // --- UPDATE LOGIC ---
      const ctx = canvasRef.current.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

      // Background: parallax synthwave stripes + stars
      drawBackground(ctx, frame);

      // Move & draw player
      if (holdingLeft) player.x = Math.max(0, player.x - PLAYER_SPEED);
      if (holdingRight)
        player.x = Math.min(GAME_WIDTH - PLAYER_W, player.x + PLAYER_SPEED);
      drawPlayer(ctx, player, activePower);

      // Firing
      if (firing && frame - lastFire > (player.doubleBullet ? 7 : 13)) {
        if (player.doubleBullet) {
          bullets.push({
            x: player.x + 7,
            y: player.y - 10,
            dx: -1,
            dy: -BULLET_SPEED,
            color: COLORS.accent
          });
          bullets.push({
            x: player.x + PLAYER_W - 11,
            y: player.y - 10,
            dx: 1,
            dy: -BULLET_SPEED,
            color: COLORS.accent
          });
        } else {
          bullets.push({
            x: player.x + PLAYER_W / 2 - BULLET_W / 2,
            y: player.y - 10,
            dx: 0,
            dy: -BULLET_SPEED,
            color: COLORS.neon
          });
        }
        lastFire = frame;
      }

      // Move bullets
      bullets.forEach((b) => {
        b.x += b.dx * 3;
        b.y += b.dy;
      });
      // Remove out-of-bounds
      for (let i = bullets.length - 1; i >= 0; i--) {
        if (bullets[i].y < -BULLET_H) bullets.splice(i, 1);
      }

      // Spawn Enemies
      if (frame - lastSpawn > ENEMY_SPAWN_INTERVAL / (1 + enemySpeed * 0.22)) {
        const t = ENEMY_TYPES[Math.floor(Math.random() * ENEMY_TYPES.length)];
        enemies.push({
          x: Math.random() * (GAME_WIDTH - ENEMY_W * t.size),
          y: -ENEMY_H * t.size - 10,
          ...t
        });
        lastSpawn = frame;
      }

      // Power-up spawn
      if (
        frame - lastPowerUp > 430 + Math.random() * 400 &&
        Math.random() > 0.8
      ) {
        const pu = POWER_UPS[Math.floor(Math.random() * POWER_UPS.length)];
        powerups.push({
          x: Math.random() * (GAME_WIDTH - 28),
          y: -32,
          ...pu
        });
        lastPowerUp = frame;
      }

      // Move enemies
      enemies.forEach((en) => {
        en.y += en.speed + enemySpeed;
      });

      // Move powerups
      powerups.forEach((pu) => {
        pu.y += 2;
      });

      // Bullet-enemy collision
      bulletsLoop: for (let b = bullets.length - 1; b >= 0; b--) {
        for (let e = enemies.length - 1; e >= 0; e--) {
          const enemy = enemies[e];
          if (
            checkCollision(
              bullets[b],
              ENEMY_W * enemy.size,
              ENEMY_H * enemy.size,
              enemy
            )
          ) {
            // Explosion, add score
            explosions.push({
              x:
                enemy.x +
                (ENEMY_W * enemy.size) / 2 +
                (Math.random() - 0.5) * 8,
              y: enemy.y + (ENEMY_H * enemy.size) / 2,
              r: enemy.size * 30,
              c: enemy.color,
              fade: 20
            });

            currentScore += enemy.points;
            setScore(currentScore);

            // Remove
            bullets.splice(b, 1);
            enemies.splice(e, 1);
            continue bulletsLoop;
          }
        }
      }

      // Player-enemy collision/loss
      for (let e = enemies.length - 1; e >= 0; e--) {
        const enemy = enemies[e];
        if (enemy.y > GAME_HEIGHT - 2 - ENEMY_H * enemy.size) {
          // Bottom hit
          enemies.splice(e, 1);

          if (!player.shield) {
            // Lose a life, shield protects
            currentLives--;
            setLives(currentLives);
            if (currentLives <= 0) {
              handleGameOver(currentScore);
              return;
            }
          } else {
            player.shield = false;
          }
        } else if (
          checkCollision(player, PLAYER_W, PLAYER_H, enemy, ENEMY_W * enemy.size, ENEMY_H * enemy.size)
        ) {
          // Hit player
          explosions.push({
            x: player.x + PLAYER_W / 2,
            y: player.y + PLAYER_H / 2,
            r: 36,
            c: COLORS.accent,
            fade: 22
          });
          enemies.splice(e, 1);
          if (!player.shield) {
            currentLives--;
            setLives(currentLives);
            if (currentLives <= 0) {
              handleGameOver(currentScore);
              return;
            }
          } else {
            player.shield = false;
          }
        }
      }

      // Power-up collection
      for (let i = powerups.length - 1; i >= 0; i--) {
        const pu = powerups[i];
        if (
          checkCollision(player, PLAYER_W, PLAYER_H, pu, 28, 28)
        ) {
          activePower = pu.type;
          powerTimer = 0;
          if (pu.type === "double") player.doubleBullet = true;
          if (pu.type === "shield") player.shield = true;
          if (pu.type === "slow") enemySpeed = Math.max(enemySpeed - 1.4, 0.15);
          powerups.splice(i, 1);
        }
      }
      // Power-up timer decay
      if (activePower) {
        powerTimer++;
        if (powerTimer > 340) {
          // 6 seconds
          if (activePower === "double") player.doubleBullet = false;
          if (activePower === "slow") enemySpeed = Math.min(enemySpeed + 1.4, 5.7);
          activePower = null;
        }
      }

      // Draw everything
      enemies.forEach((en) => drawEnemy(ctx, en, frame));
      bullets.forEach((b) => drawBullet(ctx, b));
      powerups.forEach((pu) => drawPowerup(ctx, pu, frame));
      drawHud(ctx, currentScore, currentLives, activePower);

      // Explosions
      for (let i = explosions.length - 1; i >= 0; i--) {
        let ex = explosions[i];
        ctx.save();
        ctx.globalAlpha = ex.fade / 20;
        ctx.beginPath();
        ctx.arc(ex.x, ex.y, ex.r * (Math.random() * 0.6 + 0.6), 0, 2 * Math.PI);
        ctx.fillStyle = ex.c;
        ctx.shadowColor = ex.c;
        ctx.shadowBlur = 18;
        ctx.fill();
        ctx.restore();
        ex.fade--;
        if (ex.fade < 0) explosions.splice(i, 1);
      }

      // Difficulty ramps
      if (frame % speedUpEvery === 0 && enemySpeed < 8) {
        enemySpeed += ENEMY_SPEED_INCREMENT;
      }

      frame++;
      animationRef.current = requestAnimationFrame(animate);
    }

    // Cleanup on leave
    function cleanup() {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      cancelAnimationFrame(animationRef.current);
    }

    // Setup
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    animate();
    // Store state for potential pausing/extensions later
    stateRef.current = {
      player,
      enemies,
      bullets,
      powerups,
      explosions
    };

    // Cleanup
    return cleanup;
    // eslint-disable-next-line
  }, [screen]);

  // React lifecycle for Canvas logic setup
  useEffect(() => {
    if (screen === "game") {
      // Stretch canvas to parent in CSS, but use fixed logic coords inside.
      const canvas = canvasRef.current;
      canvas.width = GAME_WIDTH;
      canvas.height = GAME_HEIGHT;
      // Start game loop
      runGame();
    }
  }, [screen, runGame]);

  // ---- UI & Presentation ----

  // Home Screen
  if (screen === "home") {
    return (
      <div className="sws-root synthwave-bg">
        <SWSParallax />
        <div className="home-menu">
          <h1 className="sws-title neon-glow">Synthwave Space Shooter</h1>
          <div className="home-btn-wrap">
            <button
              className="bold-btn"
              onClick={startGame}
              tabIndex={0}
            >
              SHOOT DAWGS
            </button>
            <button className="tiny-ghost-btn" onClick={showBoard}>
              🏆 Leaderboard
            </button>
          </div>
        </div>
        {showLeaderboard && (
          <LeaderboardOverlay
            scores={leaderboard}
            onClose={hideBoard}
            meme={null}
          />
        )}
        <div className="attribution">
          <span>Retro vibes powered by Synthwave • Coded 2024</span>
        </div>
      </div>
    );
  }

  // Game Over Screen
  if (screen === "gameover") {
    return (
      <div className="sws-root synthwave-bg">
        <SWSParallax />
        <div className="gameover-menu">
          <h2 className="sws-title neon-glow">Game Over</h2>
          <div className="big-score">Your Score: {score}</div>
          <div className="meme-motivation">{memeMsg}</div>
          <input
            className="player-input"
            style={{ marginTop: 12 }}
            placeholder="Enter your glory name"
            type="text"
            value={playerName}
            maxLength={16}
            onChange={e => setPlayerName(e.target.value)}
            onBlur={async () => {
              // Save name and leaderboard on blur
              if (score > 0 && useSupabase) {
                try {
                  await postSupabaseScore(playerName, score);
                  const lb = await getSupabaseLeaderboard(10);
                  setLeaderboard(lb);
                  saveLeaderboard(lb);
                } catch {
                  const highScores = insertLeaderboard(loadLeaderboard(), playerName, score, 10);
                  setLeaderboard(highScores);
                  saveLeaderboard(highScores);
                }
              } else if (score > 0) {
                const highScores = insertLeaderboard(loadLeaderboard(), playerName, score, 10);
                setLeaderboard(highScores);
                saveLeaderboard(highScores);
              }
            }}
          />
          <div className="home-btn-wrap">
            <button className="bold-btn" onClick={startGame}>
              Restart
            </button>
            <button className="tiny-ghost-btn" onClick={showBoard}>
              🏆 Leaderboard
            </button>
            <button className="tiny-ghost-btn" onClick={quitGameToHome}>
              Quit
            </button>
          </div>
          {showLeaderboard && (
            <LeaderboardOverlay
              scores={leaderboard}
              onClose={hideBoard}
              meme={memeMsg}
            />
          )}
        </div>
      </div>
    );
  }

  // Game Screen (Canvas rendered gameplay)
  return (
    <div className="sws-root game-bg">
      <SWSParallax small />
      <div className="game-header neon-border">
        <span>
          <span className="score-label">Score:</span> {score}
        </span>
        <span>
          <span className="lives-label">Lives:</span> {lives}
        </span>
      </div>
      <div className="gameplay-wrap">
        <canvas
          ref={canvasRef}
          className="game-canvas"
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          tabIndex={0}
        ></canvas>
      </div>
      <div className="game-footer">
        <button className="tiny-ghost-btn" onClick={quitGameToHome}>
          ⬅ Home
        </button>
        <button className="tiny-ghost-btn" onClick={showBoard}>
          🏆
        </button>
      </div>
      {showLeaderboard && (
        <LeaderboardOverlay scores={leaderboard} onClose={hideBoard} meme={null} />
      )}
      <div className="attribution" style={{marginBottom: 14, marginTop: 26}}>
        <span style={{display: "block"}}>Retro vibes powered by Synthwave • Coded 2024</span>
      </div>
    </div>
  );
}

// --------- Canvas UI helpers ---------
function drawPlayer(ctx, player, activePower) {
  // Neon spaceship: colored triangle w glow/shadow
  ctx.save();
  ctx.shadowColor = COLORS.accent;
  ctx.shadowBlur = 17;
  ctx.beginPath();
  ctx.moveTo(player.x + player.width / 2, player.y);
  ctx.lineTo(player.x + player.width - 6, player.y + player.height);
  ctx.lineTo(player.x + 6, player.y + player.height);
  ctx.closePath();
  ctx.fillStyle = COLORS.primary;
  ctx.fill();
  ctx.restore();

  // Neon cockpit
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(
    player.x + player.width / 2,
    player.y + player.height / 2,
    7,
    0, 2 * Math.PI
  );
  ctx.fillStyle = COLORS.neon;
  ctx.shadowColor = COLORS.neon;
  ctx.shadowBlur = 11;
  ctx.fill();
  ctx.restore();

  // Glow/double shots
  if (activePower === "double") {
    ctx.save();
    ctx.strokeStyle = "#fff";
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      player.x + player.width / 2,
      player.y + player.height / 2,
      18, 0, 2 * Math.PI
    );
    ctx.stroke();
    ctx.restore();
  }
  // Shield effect
  if (player.shield) {
    ctx.save();
    ctx.globalAlpha = 0.2 + (Math.sin(Date.now() / 180) + 1) / 4;
    ctx.beginPath();
    ctx.arc(
      player.x + player.width / 2,
      player.y + player.height / 2,
      24, 0, 2 * Math.PI
    );
    ctx.strokeStyle = "#ffe062";
    ctx.lineWidth = 7;
    ctx.shadowColor = "#ffe062";
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();
  }
}

function drawEnemy(ctx, enemy, frame) {
  ctx.save();
  ctx.shadowColor = enemy.color;
  ctx.shadowBlur = 14;
  ctx.globalAlpha = 0.86;
  if (enemy.size > 1) ctx.globalAlpha = 0.7;
  if (enemy.size < 1) ctx.globalAlpha = 0.98;

  // Wobble/move fun
  const yBob = Math.sin(frame / 7 + enemy.x) * 5;

  // Neon Shape with meme emoji
  ctx.beginPath();
  ctx.arc(
    enemy.x + (ENEMY_W * enemy.size) / 2,
    enemy.y + (ENEMY_H * enemy.size) / 2 + yBob,
    (ENEMY_W * enemy.size) / 2.2,
    0,
    2 * Math.PI
  );
  ctx.fillStyle = enemy.color;
  ctx.fill();

  // Meme emoji/face
  ctx.save();
  ctx.font = `${Math.max(21, 24 * enemy.size)}px serif`;
  ctx.globalAlpha = 1.0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.strokeText(
    enemy.meme,
    enemy.x + (ENEMY_W * enemy.size) / 2,
    enemy.y + (ENEMY_H * enemy.size) / 2 + yBob + 2
  );
  ctx.fillStyle = "#fff";
  ctx.fillText(
    enemy.meme,
    enemy.x + (ENEMY_W * enemy.size) / 2,
    enemy.y + (ENEMY_H * enemy.size) / 2 + yBob + 2
  );
  ctx.restore();

  ctx.restore();
}

function drawBullet(ctx, bullet) {
  ctx.save();
  ctx.shadowColor = bullet.color;
  ctx.shadowBlur = 13;
  ctx.beginPath();
  ctx.rect(bullet.x, bullet.y, BULLET_W, BULLET_H);
  ctx.fillStyle = bullet.color;
  ctx.fill();
  ctx.restore();
}

function drawPowerup(ctx, pu, frame) {
  // Animate w spin and glow
  ctx.save();
  ctx.translate(pu.x + 14, pu.y + 14);
  ctx.rotate((frame / 23) % (2 * Math.PI));
  ctx.globalAlpha = 0.93;
  ctx.beginPath();
  ctx.arc(0, 0, 13.5, 0, 2 * Math.PI);
  ctx.fillStyle = pu.color;
  ctx.shadowColor = pu.color;
  ctx.shadowBlur = 15;
  ctx.fill();
  ctx.font = "16px Arial Black";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#333";
  ctx.fillText(pu.desc[0], 1, 0);
  ctx.restore();
}

function drawHud(ctx, score, lives, activePower) {
  // Top bar: Score, lives, powerup
  ctx.save();
  ctx.globalAlpha = 0.97;
  ctx.font = "bold 18px 'Orbitron', Arial, sans-serif";
  ctx.fillStyle = COLORS.white;
  ctx.fillText(`Score: ${score}`, 19, 25);
  ctx.fillStyle = COLORS.accent;
  ctx.fillText(`Lives:`, GAME_WIDTH - 110, 25);
  for (let i = 0; i < lives; i++) {
    ctx.save();
    ctx.globalAlpha = 0.84;
    ctx.beginPath();
    ctx.arc(GAME_WIDTH - 60 + i * 21, 22, 11, 0, 2 * Math.PI);
    ctx.fillStyle = COLORS.neon;
    ctx.shadowColor = COLORS.accent;
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.restore();
  }
  // Power-up active
  if (activePower) {
    ctx.font = "bold 13px 'Orbitron', Arial";
    ctx.fillStyle = "#ffe062";
    ctx.fillText(`POWER: ${activePower.toUpperCase()}`, GAME_WIDTH / 2 - 60, 25);
  }
  ctx.restore();
}

function drawBackground(ctx, frame) {
  // Simple parallax gradient + synthwave grid stripes & stars
  const grad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
  grad.addColorStop(0, COLORS.secondary);
  grad.addColorStop(
    0.4,
    "#0b1d47"
  );
  grad.addColorStop(0.85, "#100026");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Parallax horizontal neon stripes (synthwave)
  for (let i = 58; i < GAME_HEIGHT; i += 32) {
    ctx.save();
    ctx.globalAlpha = 0.17 + Math.sin(frame / 19 + i) * 0.12;
    ctx.beginPath();
    ctx.moveTo(0, i + (frame % 32));
    ctx.lineTo(GAME_WIDTH, i + (frame % 32));
    ctx.lineWidth = 2.7;
    ctx.strokeStyle = COLORS.neon;
    ctx.shadowBlur = 3;
    ctx.stroke();
    ctx.restore();
  }

  // Stars, sparkle randomly
  for (let s = 0; s < 21; s++) {
    ctx.save();
    ctx.globalAlpha = Math.random() * 0.26 + 0.14;
    ctx.beginPath();
    const ss = Math.sin(((frame / 4 + s * 40) % GAME_HEIGHT) / 21);
    ctx.arc(
      (s * 41 + 13 * Math.sin(frame / 60 + s * 3)) % GAME_WIDTH,
      (s * 88 + (frame * (0.73 + s * 0.08))) % GAME_HEIGHT,
      1.8 + ss * 1.2,
      0,
      2 * Math.PI
    );
    ctx.fillStyle = COLORS.neon;
    ctx.fill();
    ctx.restore();
  }
}

/*
  Local fallback leaderboard utilities/UI (offline/dev mode)
  Supabase is used by default, but these remain as fallback in case Supabase
  is unavailable, misconfigured, or for local development.
*/
function loadLeaderboard() {
  try {
    const raw = window.localStorage.getItem("sws_leaderboard") || "[]";
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
function saveLeaderboard(lb) {
  window.localStorage.setItem("sws_leaderboard", JSON.stringify(lb));
}
function insertLeaderboard(ls, name, score, limit) {
  let lb = Array.isArray(ls) ? [...ls] : [];
  if (isNaN(score) || score <= 0) return lb;
  const idx = lb.findIndex((o) => name === o.name);
  if (idx !== -1 && score > lb[idx].points) lb[idx].points = score;
  else if (idx === -1) lb.push({ name, points: score });
  lb.sort((a, b) => b.points - a.points);
  if (lb.length > (limit || 8)) lb = lb.slice(0, limit || 8);
  return lb;
}
function promptName() {
  let name = window.prompt("Enter your glory name for the leaderboard (max 15 chars):", "");
  return name ? name.trim().slice(0, 15) : "Space Dawg";
}

/**
 * LeaderboardOverlay
 *
 * @param {*} {scores, onClose, meme?}
 */
function LeaderboardOverlay({ scores, onClose, meme }) {
  return (
    <div className="leaderboard-overlay">
      <div className="leaderboard-inner neon-border">
        <span className="close-lb-btn" onClick={onClose}>
          ✖
        </span>
        <h3 className="neon-glow">🏆 Dawgs of Fame</h3>
        <ol className="lb-list">
          {(scores?.length === 0) && (
            <li className="lb-entry">No glory yet. Be the space dawg!</li>
          )}
          {(scores || []).map((entry, idx) => (
            <li className="lb-entry" key={entry.name + entry.points}>
              <span className="lb-place">{idx + 1}.</span>
              <span className="lb-name">{entry.name}</span>
              <span className="lb-score">{entry.points}</span>
              <span className="lb-meme">{randomMemeEmoji(idx)}</span>
            </li>
          ))}
        </ol>
        {meme && <div className="meme-bottom">"{meme}"</div>}
      </div>
    </div>
  );
}
function randomMemeEmoji(idx) {
  const memes = ["🚀", "🤩", "🏴‍☠️", "🔥", "🤘", "🦄", "☄️", "😎"];
  return memes[idx % memes.length];
}

/**
 * Parallax synthwave background (SVG+CSS)
 */
function SWSParallax({ small }) {
  // Cheap CSS parallax bands, distant mountains/lines with animation.
  return (
    <div className={`parallax-bg${small ? " small" : ""}`}>
      <div className="band band1"></div>
      <div className="band band2"></div>
      <div className="band band3"></div>
      <div className="grid"></div>
    </div>
  );
}

// -------- Utility --------
function checkCollision(a, wA, hA, b, wB = ENEMY_W, hB = ENEMY_H) {
  // Axis-Aligned Bounding Box
  return (
    a.x < b.x + wB &&
    a.x + wA > b.x &&
    a.y < b.y + hB &&
    a.y + hA > b.y
  );
}

export default App;
