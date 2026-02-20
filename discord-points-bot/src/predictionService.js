const { pool } = require('./db');
const { deductPoints, addPoints } = require('./pointsService');
const { randomBeer } = require('./beerWord');

async function createPrediction(guildId, channelId, question, optionA, optionB, durationSeconds, createdBy) {
  const [result] = await pool.query(
    `INSERT INTO predictions (guild_id, channel_id, question, option_a, option_b, ends_at, created_by)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND), ?)`,
    [guildId, channelId, question, optionA, optionB, durationSeconds, createdBy]
  );
  return result.insertId;
}

async function getPrediction(predictionId) {
  const [rows] = await pool.query(
    `SELECT * FROM predictions WHERE id = ?`,
    [predictionId]
  );
  return rows[0] ?? null;
}

async function getActivePrediction(guildId) {
  const [rows] = await pool.query(
    `SELECT * FROM predictions
     WHERE guild_id = ? AND status IN ('open', 'locked')
     LIMIT 1`,
    [guildId]
  );
  return rows[0] ?? null;
}

async function placeBet(predictionId, userId, guildId, option, amount) {
  const prediction = await getPrediction(predictionId);
  if (!prediction) return 'Prédiction introuvable.';
  if (prediction.status !== 'open') return 'Les paris sont fermés pour cette prédiction.';

  const deducted = await deductPoints(userId, guildId, amount);
  if (!deducted) return `Vous n'avez pas assez de ${randomBeer()} 🍺.`;

  try {
    await pool.query(
      `INSERT INTO bets (prediction_id, user_id, guild_id, \`option\`, amount)
       VALUES (?, ?, ?, ?, ?)`,
      [predictionId, userId, guildId, option, amount]
    );
  } catch (err) {
    // Always refund if the INSERT failed for any reason
    await addPoints(userId, guildId, amount);
    if (err.code === 'ER_DUP_ENTRY') return 'Vous avez déjà placé un pari sur cette prédiction.';
    throw err;
  }

  return true;
}

async function lockPrediction(predictionId) {
  await pool.query(
    `UPDATE predictions SET status = 'locked' WHERE id = ? AND status = 'open'`,
    [predictionId]
  );
}

const MIN_ODDS = 1.3;

async function resolvePrediction(predictionId, winningOption) {
  await pool.query(
    `UPDATE predictions SET status = 'resolved', winning_option = ? WHERE id = ?`,
    [winningOption, predictionId]
  );

  const [bets] = await pool.query(
    `SELECT * FROM bets WHERE prediction_id = ?`,
    [predictionId]
  );

  if (bets.length === 0) return { winnerCount: 0, totalDistributed: 0, topWinners: [], topLosers: [] };

  const totalPot = bets.reduce((sum, b) => sum + b.amount, 0);
  const winningBets = bets.filter((b) => b.option === winningOption);
  const losingBets  = bets.filter((b) => b.option !== winningOption);
  const totalWinningSide = winningBets.reduce((sum, b) => sum + b.amount, 0);

  if (winningBets.length === 0) return { winnerCount: 0, totalDistributed: 0, topWinners: [], topLosers: [] };

  let totalDistributed = 0;
  const winnersData = [];
  for (const bet of winningBets) {
    const naturalPayout = Math.floor((bet.amount / totalWinningSide) * totalPot);
    const minPayout     = Math.floor(bet.amount * MIN_ODDS);
    const payout        = Math.max(naturalPayout, minPayout);
    await addPoints(bet.user_id, bet.guild_id, payout);
    totalDistributed += payout;
    winnersData.push({ user_id: bet.user_id, bet: bet.amount, payout, profit: payout - bet.amount });
  }

  const topWinners = winnersData.sort((a, b) => b.profit - a.profit).slice(0, 5);
  const topLosers  = losingBets.sort((a, b) => b.amount - a.amount).slice(0, 5)
    .map((b) => ({ user_id: b.user_id, loss: b.amount }));

  return { winnerCount: winningBets.length, totalDistributed, topWinners, topLosers };
}

async function cancelPrediction(predictionId) {
  await pool.query(
    `UPDATE predictions SET status = 'cancelled' WHERE id = ?`,
    [predictionId]
  );

  const [bets] = await pool.query(
    `SELECT * FROM bets WHERE prediction_id = ?`,
    [predictionId]
  );

  for (const bet of bets) {
    await addPoints(bet.user_id, bet.guild_id, bet.amount);
  }
}

async function getBetSummary(predictionId) {
  const [rows] = await pool.query(
    `SELECT
       SUM(CASE WHEN \`option\` = 'a' THEN amount ELSE 0 END) AS totalA,
       SUM(CASE WHEN \`option\` = 'b' THEN amount ELSE 0 END) AS totalB,
       SUM(CASE WHEN \`option\` = 'a' THEN 1    ELSE 0 END) AS countA,
       SUM(CASE WHEN \`option\` = 'b' THEN 1    ELSE 0 END) AS countB
     FROM bets
     WHERE prediction_id = ?`,
    [predictionId]
  );

  const row = rows[0];
  return {
    totalA: Number(row.totalA ?? 0),
    totalB: Number(row.totalB ?? 0),
    countA: Number(row.countA ?? 0),
    countB: Number(row.countB ?? 0),
  };
}

module.exports = {
  createPrediction,
  getPrediction,
  getActivePrediction,
  placeBet,
  lockPrediction,
  resolvePrediction,
  cancelPrediction,
  getBetSummary,
};
