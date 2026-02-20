require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id  VARCHAR(20) NOT NULL,
      guild_id VARCHAR(20) NOT NULL,
      points   INT         NOT NULL DEFAULT 100,
      last_seen DATETIME,
      PRIMARY KEY (user_id, guild_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS predictions (
      id             INT AUTO_INCREMENT PRIMARY KEY,
      guild_id       VARCHAR(20)                                    NOT NULL,
      question       TEXT                                           NOT NULL,
      option_a       VARCHAR(100)                                   NOT NULL,
      option_b       VARCHAR(100)                                   NOT NULL,
      status         ENUM('open', 'locked', 'resolved', 'cancelled') NOT NULL DEFAULT 'open',
      winning_option ENUM('a', 'b')                                DEFAULT NULL,
      created_by     VARCHAR(20)                                    NOT NULL,
      ends_at        DATETIME                                       NOT NULL,
      message_id     VARCHAR(20),
      channel_id     VARCHAR(20)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bets (
      id            INT AUTO_INCREMENT PRIMARY KEY,
      prediction_id INT                  NOT NULL,
      user_id       VARCHAR(20)          NOT NULL,
      guild_id      VARCHAR(20)          NOT NULL,
      \`option\`      ENUM('a', 'b')       NOT NULL,
      amount        INT                  NOT NULL,
      UNIQUE KEY uq_bet_per_user (prediction_id, user_id),
      FOREIGN KEY (prediction_id) REFERENCES predictions(id)
    )
  `);

  console.log('Database tables ready.');
}

module.exports = { pool, initDB };
