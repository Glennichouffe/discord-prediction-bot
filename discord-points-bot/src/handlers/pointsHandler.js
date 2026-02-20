const { EmbedBuilder } = require('discord.js');
const { getPoints, getLeaderboard } = require('../pointsService');
const { randomBeer } = require('../beerWord');

async function handlePoints(interaction) {
  const targetUser = interaction.options.getUser('user') ?? interaction.user;
  const points = await getPoints(targetUser.id, interaction.guildId);

  const isSelf = targetUser.id === interaction.user.id;
  const title  = isSelf ? 'Vos Bières 🍺' : `Bières de ${targetUser.displayName} 🍺`;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`🍺 **${points}** ${randomBeer()}`)
    .setColor(0x3498db)
    .setThumbnail(targetUser.displayAvatarURL());

  await interaction.reply({ embeds: [embed] });
}

async function handleLeaderboard(interaction) {
  const rows = await getLeaderboard(interaction.guildId, 10);

  if (rows.length === 0) {
    await interaction.reply({ content: `Personne n'a encore de ${randomBeer()} ! 🍺`, ephemeral: true });
    return;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const lines = rows.map((row, i) => {
    const prefix = medals[i] ?? `**${i + 1}.**`;
    return `${prefix} <@${row.user_id}> — 🍺 **${row.points}** ${randomBeer()}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('🏆 Classement des Bières 🍺')
    .setDescription(lines.join('\n'))
    .setColor(0xf1c40f)
    .setFooter({ text: `Top ${rows.length} membres` });

  await interaction.reply({ embeds: [embed] });
}

module.exports = { handlePoints, handleLeaderboard };
