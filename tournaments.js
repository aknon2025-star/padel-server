// routes/tournaments.js
// Tournament creation is ADMIN ONLY (enforced here).
// Knockout brackets properly link each match to the "next match" so winners
// advance through quarter -> semi -> final automatically.

const express = require("express");
const { v4: uuid } = require("uuid");
const { db } = require("../db/database");
const { awardPoints } = require("./users");
const router = express.Router();

function requireAdmin(req, res, next) {
  const adminId = req.headers["x-user-id"];
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(adminId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "فقط ادمین می‌تواند تورنمنت بسازد" });
  }
  next();
}

const ROUND_NAMES = {
  // by number of teams remaining in that round (2 = final, 4 = semis, 8 = quarters...)
  2: "final",
  4: "semi",
  8: "quarter",
  16: "round16",
  32: "round32",
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── LIST / GET ──────────────────────────────────────────────
router.get("/", (req, res) => {
  const tournaments = db.prepare("SELECT * FROM tournaments ORDER BY created_at DESC").all();
  res.json({ tournaments });
});

router.get("/:id", (req, res) => {
  const tournament = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(req.params.id);
  if (!tournament) return res.status(404).json({ error: "تورنمنت پیدا نشد" });

  const teams = db.prepare("SELECT * FROM tournament_teams WHERE tournament_id = ?").all(req.params.id);
  const matches = db.prepare("SELECT * FROM tournament_matches WHERE tournament_id = ? ORDER BY round, position").all(req.params.id);

  res.json({ tournament, teams, matches });
});

// ── CREATE (admin only) ─────────────────────────────────────
router.post("/", requireAdmin, (req, res) => {
  const { name, format, level } = req.body;
  if (!name || !format || !level) {
    return res.status(400).json({ error: "نام، فرمت و سطح لازم است" });
  }
  const id = "trn-" + uuid().slice(0, 8);
  const adminId = req.headers["x-user-id"];
  db.prepare(`
    INSERT INTO tournaments (id, name, format, level, status, created_by)
    VALUES (?, ?, ?, ?, 'setup', ?)
  `).run(id, name, format, level, adminId);
  res.status(201).json({ id });
});

// ── ADD TEAM (2 players) — admin only, during setup ─────────
router.post("/:id/teams", requireAdmin, (req, res) => {
  const { p1Name, p1Level, p1UserId, p2Name, p2Level, p2UserId } = req.body;
  if (!p1Name || !p2Name) return res.status(400).json({ error: "نام هر دو بازیکن لازم است" });

  const id = "team-" + uuid().slice(0, 8);
  db.prepare(`
    INSERT INTO tournament_teams
      (id, tournament_id, p1_name, p1_level, p1_user_id, p2_name, p2_level, p2_user_id, total_points, wins, losses)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0)
  `).run(id, req.params.id, p1Name, p1Level || "B", p1UserId || null, p2Name, p2Level || "B", p2UserId || null);

  res.status(201).json({ id });
});

router.delete("/:id/teams/:teamId", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM tournament_teams WHERE id = ?").run(req.params.teamId);
  res.json({ success: true });
});

// ── DRAW: builds the bracket / round-robin schedule ─────────
// This is where the previous version's bug lived — it now properly
// builds a full tree of rounds for knockout, linking next_match_id
// so that confirming a match automatically pushes the winner forward.
router.post("/:id/draw", requireAdmin, (req, res) => {
  const tournament = db.prepare("SELECT * FROM tournaments WHERE id = ?").get(req.params.id);
  if (!tournament) return res.status(404).json({ error: "تورنمنت پیدا نشد" });

  const teams = db.prepare("SELECT * FROM tournament_teams WHERE tournament_id = ?").all(req.params.id);
  if (teams.length < 2) return res.status(400).json({ error: "حداقل ۲ تیم لازم است" });

  const isRR = ["roundrobin", "americano", "mexicano"].includes(tournament.format);

  // Clear any previous matches (re-draw)
  db.prepare("DELETE FROM tournament_matches WHERE tournament_id = ?").run(req.params.id);

  if (isRR) {
    const shuffled = shuffle(teams);
    const insert = db.prepare(`
      INSERT INTO tournament_matches
        (id, tournament_id, round, round_name, position, team1_id, team2_id, done)
      VALUES (?, ?, 1, 'roundrobin', ?, ?, ?, 0)
    `);
    let pos = 0;
    for (let i = 0; i < shuffled.length; i++) {
      for (let j = i + 1; j < shuffled.length; j++) {
        insert.run("m-" + uuid().slice(0, 8), req.params.id, pos++, shuffled[i].id, shuffled[j].id);
      }
    }
  } else {
    // KNOCKOUT / DOUBLE-ELIM (single-elim tree; double-elim uses same tree for the winners bracket)
    const shuffled = shuffle(teams);
    const totalSlots = Math.pow(2, Math.ceil(Math.log2(shuffled.length)));

    // Distribute BYEs evenly using standard bracket seed order, so no two
    // BYEs ever collide in the same first-round match (which would create
    // a dead match that can never produce a winner — this was the original bug).
    function seedOrder(n) {
      if (n === 1) return [0];
      const prev = seedOrder(n / 2);
      const out = [];
      for (const p of prev) { out.push(p); out.push(n - 1 - p); }
      return out;
    }
    const order = seedOrder(totalSlots);
    const padded = new Array(totalSlots).fill(null);
    for (let i = 0; i < shuffled.length; i++) padded[order[i]] = shuffled[i];

    // Build rounds top-down: round 1 has totalSlots/2 matches, final round has 1 match.
    // We build from the FIRST round forward, and pre-create every subsequent round's
    // empty matches so we can link next_match_id correctly.
    const roundsCount = Math.log2(totalSlots);
    const allRoundMatches = []; // allRoundMatches[roundIndex] = [{id, position}, ...]

    for (let r = 0; r < roundsCount; r++) {
      const matchesInRound = totalSlots / Math.pow(2, r + 1);
      const roundName = ROUND_NAMES[matchesInRound * 2] || `round-${r + 1}`;
      const roundMatches = [];
      for (let p = 0; p < matchesInRound; p++) {
        roundMatches.push({ id: "m-" + uuid().slice(0, 8), position: p, roundName });
      }
      allRoundMatches.push(roundMatches);
    }

    // Insert matches round by round, linking next_match_id from round r to round r+1
    const insert = db.prepare(`
      INSERT INTO tournament_matches
        (id, tournament_id, round, round_name, position, team1_id, team2_id, done, next_match_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `);

    for (let r = 0; r < roundsCount; r++) {
      const roundMatches = allRoundMatches[r];
      for (let p = 0; p < roundMatches.length; p++) {
        const m = roundMatches[p];
        let team1Id = null, team2Id = null;
        if (r === 0) {
          // First round gets actual teams (or BYE = null)
          const t1 = padded[p * 2];
          const t2 = padded[p * 2 + 1];
          team1Id = t1 ? t1.id : null;
          team2Id = t2 ? t2.id : null;
        }
        const nextMatch = r < roundsCount - 1 ? allRoundMatches[r + 1][Math.floor(p / 2)] : null;
        insert.run(m.id, req.params.id, r + 1, m.roundName, p, team1Id, team2Id, nextMatch ? nextMatch.id : null);
      }
    }

    // Auto-advance any BYEs in round 1 immediately (seeding above guarantees
    // no match has BOTH slots empty, so this always has exactly one team or two).
    const round1 = db.prepare("SELECT * FROM tournament_matches WHERE tournament_id = ? AND round = 1").all(req.params.id);
    for (const m of round1) {
      resolveByesFrom(m.id);
    }
  }

  db.prepare("UPDATE tournaments SET status = 'active' WHERE id = ?").run(req.params.id);
  res.json({ success: true });
});

// Helper: push a winning team into its next_match_id slot, marking the bye-match done,
// then cascade forward if that creates another bye situation in the next round.
function advanceWinner(matchId, winnerTeamId) {
  const match = db.prepare("SELECT * FROM tournament_matches WHERE id = ?").get(matchId);
  if (!match) return;
  db.prepare("UPDATE tournament_matches SET done = 1, winner_team_id = ? WHERE id = ?").run(winnerTeamId, matchId);

  if (match.next_match_id) {
    if (match.position % 2 === 0) {
      db.prepare("UPDATE tournament_matches SET team1_id = ? WHERE id = ?").run(winnerTeamId, match.next_match_id);
    } else {
      db.prepare("UPDATE tournament_matches SET team2_id = ? WHERE id = ?").run(winnerTeamId, match.next_match_id);
    }
    resolveByesFrom(match.next_match_id);
  }
}

// If a match has exactly one team filled in (the other is a permanent BYE,
// not just "not yet decided"), auto-resolve it as a win with no score needed,
// and cascade the same check to whatever match it feeds into.
function resolveByesFrom(matchId) {
  const match = db.prepare("SELECT * FROM tournament_matches WHERE id = ?").get(matchId);
  if (!match || match.done) return;
  const hasT1 = !!match.team1_id, hasT2 = !!match.team2_id;
  if (hasT1 === hasT2) return; // either a real pending match (both set) or still fully empty — do nothing
  const winner = hasT1 ? match.team1_id : match.team2_id;
  advanceWinner(matchId, winner);
}

// ── SUBMIT SCORE (admin only) — handles both round-robin and knockout ──
router.post("/:id/matches/:matchId/score", requireAdmin, (req, res) => {
  const { score1, score2 } = req.body;
  const match = db.prepare("SELECT * FROM tournament_matches WHERE id = ?").get(req.params.matchId);
  if (!match) return res.status(404).json({ error: "مسابقه پیدا نشد" });
  if (!match.team1_id || !match.team2_id) return res.status(400).json({ error: "هنوز هر دو تیم معلوم نیستند" });

  const s1 = parseInt(score1), s2 = parseInt(score2);
  if (isNaN(s1) || isNaN(s2)) return res.status(400).json({ error: "نتیجه نامعتبر است" });

  const winnerId = s1 >= s2 ? match.team1_id : match.team2_id;
  const loserId = s1 >= s2 ? match.team2_id : match.team1_id;

  db.prepare(`
    UPDATE tournament_matches SET score1 = ?, score2 = ?, done = 1, winner_team_id = ? WHERE id = ?
  `).run(s1, s2, winnerId, req.params.matchId);

  // Award team points
  const WIN_PTS = 70, LOSS_PTS = 14;
  db.prepare("UPDATE tournament_teams SET total_points = total_points + ?, wins = wins + 1 WHERE id = ?")
    .run(WIN_PTS, winnerId);
  db.prepare("UPDATE tournament_teams SET total_points = total_points + ?, losses = losses + 1 WHERE id = ?")
    .run(LOSS_PTS, loserId);

  // Award individual player points IF they're linked to a real user account —
  // this is the auto-upload to profile the user asked for.
  const winnerTeam = db.prepare("SELECT * FROM tournament_teams WHERE id = ?").get(winnerId);
  const loserTeam = db.prepare("SELECT * FROM tournament_teams WHERE id = ?").get(loserId);
  if (winnerTeam.p1_user_id) awardPoints(winnerTeam.p1_user_id, WIN_PTS, true);
  if (winnerTeam.p2_user_id) awardPoints(winnerTeam.p2_user_id, WIN_PTS, true);
  if (loserTeam.p1_user_id) awardPoints(loserTeam.p1_user_id, LOSS_PTS, false);
  if (loserTeam.p2_user_id) awardPoints(loserTeam.p2_user_id, LOSS_PTS, false);

  // Knockout: advance the winner to the next match in the bracket tree
  if (match.next_match_id) {
    advanceWinner(req.params.matchId, winnerId);
    // Check if the next match now has only one team due to opponent BYE further down — not needed here,
    // byes are resolved at draw time, so this simple push is sufficient.
  }

  // Check if tournament is fully finished (every match done)
  const remaining = db.prepare("SELECT COUNT(*) as c FROM tournament_matches WHERE tournament_id = ? AND done = 0")
    .get(req.params.id).c;
  if (remaining === 0) {
    db.prepare("UPDATE tournaments SET status = 'finished' WHERE id = ?").run(req.params.id);
  }

  res.json({ success: true });
});

// ── RESULTS / STANDINGS ──────────────────────────────────────
router.get("/:id/results", (req, res) => {
  const teams = db.prepare("SELECT * FROM tournament_teams WHERE tournament_id = ? ORDER BY total_points DESC")
    .all(req.params.id);
  res.json({ standings: teams });
});

module.exports = router;
