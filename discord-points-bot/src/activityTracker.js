const { addPoints } = require('./pointsService');

const AWARD_AMOUNT = 5;
const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

async function tick(client) {
  for (const [guildId, guild] of client.guilds.cache) {
    const activeMembers = guild.members.cache.filter(
      (member) => !member.user.bot && member.voice.channel !== null
    );

    if (activeMembers.size === 0) continue;

    for (const [, member] of activeMembers) {
      await addPoints(member.id, guildId, AWARD_AMOUNT);
    }

    console.log(
      `[ActivityTracker] ${guild.name}: awarded ${AWARD_AMOUNT} pts to ${activeMembers.size} active user(s).`
    );
  }
}

function startActivityTracker(client) {
  console.log('[ActivityTracker] Started — awarding points every 10 minutes.');
  setInterval(() => tick(client).catch(console.error), INTERVAL_MS);
}

module.exports = { startActivityTracker };
