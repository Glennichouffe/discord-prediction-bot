const { pool } = require('./db');

async function getPoints(userId, guildId) {
  const [rows] = await pool.query(
    `INSERT INTO users (user_id, guild_id, points, last_seen)
     VALUES (?, ?, 100, NOW())
     ON DUPLICATE KEY UPDATE last_seen = NOW()`,
    [userId, guildId]
  );

  const [users] = await pool.query(
    `SELECT points FROM users WHERE user_id = ? AND guild_id = ?`,
    [userId, guildId]
  );

  return users[0].points;
}

async function addPoints(userId, guildId, amount) {
  await pool.query(
    `INSERT INTO users (user_id, guild_id, points, last_seen)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE points = points + ?, last_seen = NOW()`,
    [userId, guildId, amount, amount]
  );
}

async function deductPoints(userId, guildId, amount) {
  const current = await getPoints(userId, guildId);
  if (current < amount) return false;

  await pool.query(
    `UPDATE users SET points = points - ?, last_seen = NOW()
     WHERE user_id = ? AND guild_id = ?`,
    [amount, userId, guildId]
  );

  return true;
}

async function getLeaderboard(guildId, limit = 10) {
  const [rows] = await pool.query(
    `SELECT user_id, points
     FROM users
     WHERE guild_id = ?
     ORDER BY points DESC
     LIMIT ?`,
    [guildId, limit]
  );

  return rows;
}

module.exports = { getPoints, addPoints, deductPoints, getLeaderboard };
