const {
  PermissionFlagsBits,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { pool } = require('../db');
const {
  createPrediction,
  getPrediction,
  getActivePrediction,
  placeBet,
  lockPrediction,
  resolvePrediction,
  cancelPrediction,
  getBetSummary,
} = require('../predictionService');
const { getPoints } = require('../pointsService');
const { randomBeer } = require('../beerWord');
const { buildPredictionEmbed, buildResultEmbed, buildPalmaresEmbed, buildPredictionComponents } = require('../embedBuilder');

// Keyed by predictionId — lets resolve/cancel clear the timer before it fires.
const lockTimers = new Map();

function clearLockTimer(predictionId) {
  const timer = lockTimers.get(predictionId);
  if (timer) {
    clearTimeout(timer);
    lockTimers.delete(predictionId);
  }
}

// Fetches the live prediction embed message and edits it with fresh data.
async function refreshEmbed(client, prediction) {
  const betSummary = await getBetSummary(prediction.id);
  const embed = buildPredictionEmbed(prediction, betSummary);
  const components = buildPredictionComponents(prediction);
  try {
    const channel = await client.channels.fetch(prediction.channel_id);
    const message = await channel.messages.fetch(prediction.message_id);
    await message.edit({ embeds: [embed], components });
  } catch (err) {
    console.error('[predictionHandler] Failed to refresh embed:', err);
  }
}

function requireManageGuild(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    interaction.reply({
      content: '❌ Vous avez besoin de la permission **Gérer le serveur** pour utiliser cette commande.',
      ephemeral: true,
    });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------

async function handlePredict(interaction) {
  const guildId = interaction.guildId;

  const existing = await getActivePrediction(guildId);
  if (existing) {
    await interaction.reply({
      content: '❌ Une prédiction est déjà en cours. Résolvez-la ou annulez-la d\'abord.',
      ephemeral: true,
    });
    return;
  }

  const question = interaction.options.getString('question');
  const optionA  = interaction.options.getString('option_a');
  const optionB  = interaction.options.getString('option_b');
  const duration = interaction.options.getInteger('duration');

  if (duration < 1 || duration > 60) {
    await interaction.reply({
      content: '❌ La durée doit être comprise entre **1** et **60** minutes.',
      ephemeral: true,
    });
    return;
  }

  const predictionId = await createPrediction(
    guildId,
    interaction.channelId,
    question,
    optionA,
    optionB,
    duration * 60,
    interaction.user.id
  );

  const prediction = await getPrediction(predictionId);
  const betSummary = await getBetSummary(predictionId);

  const message = await interaction.reply({
    embeds: [buildPredictionEmbed(prediction, betSummary)],
    components: buildPredictionComponents(prediction),
    fetchReply: true,
  });

  // Persist message_id and channel_id so other commands can edit the embed
  await pool.query(
    `UPDATE predictions SET message_id = ?, channel_id = ? WHERE id = ?`,
    [message.id, message.channelId, predictionId]
  );

  // Schedule auto-lock; store the timer so resolve/cancel can clear it
  const timer = setTimeout(async () => {
    lockTimers.delete(predictionId);

    await lockPrediction(predictionId);
    const locked = await getPrediction(predictionId);

    // If a mod already resolved/cancelled before the timer fired, do nothing
    if (locked.status !== 'locked') return;

    const summary = await getBetSummary(predictionId);
    try {
      const channel = await interaction.client.channels.fetch(locked.channel_id);
      const msg     = await channel.messages.fetch(locked.message_id);
      await msg.edit({ embeds: [buildPredictionEmbed(locked, summary)], components: [] });
      await channel.send('🔒 Les paris sont fermés ! En attente du résultat...');
    } catch (err) {
      console.error('[predictionHandler] Auto-lock failed:', err);
    }
  }, duration * 60 * 1000);

  lockTimers.set(predictionId, timer);
}

async function handleBet(interaction) {
  const guildId = interaction.guildId;

  const prediction = await getActivePrediction(guildId);
  if (!prediction) {
    await interaction.reply({ content: '❌ Il n\'y a aucune prédiction active sur laquelle parier.', ephemeral: true });
    return;
  }

  const option = interaction.options.getString('option');
  const amount = interaction.options.getInteger('amount');

  if (amount < 1) {
    await interaction.reply({ content: `❌ La mise doit être d'au moins 🍺 **1** ${randomBeer()}.`, ephemeral: true });
    return;
  }

  const balance = await getPoints(interaction.user.id, guildId);
  if (balance < amount) {
    await interaction.reply({
      content: `❌ Vous n'avez pas assez de ${randomBeer()} 🍺. Solde : **${balance}**, mise : **${amount}**.`,
      ephemeral: true,
    });
    return;
  }

  const result = await placeBet(prediction.id, interaction.user.id, guildId, option, amount);

  if (result !== true) {
    await interaction.reply({ content: `❌ ${result}`, ephemeral: true });
    return;
  }

  const optionLabel = option === 'a' ? prediction.option_a : prediction.option_b;
  await interaction.reply({
    content: `✅ Vous avez misé 🍺 **${amount}** ${randomBeer()} sur **${optionLabel}** !`,
    ephemeral: true,
  });

  await refreshEmbed(interaction.client, prediction);
}

async function handleResolve(interaction) {
  if (!requireManageGuild(interaction)) return;

  const guildId = interaction.guildId;

  const prediction = await getActivePrediction(guildId);
  if (!prediction) {
    await interaction.reply({ content: '❌ Il n\'y a aucune prédiction active à résoudre.', ephemeral: true });
    return;
  }

  // Cancel the auto-lock timer — the prediction is being handled manually
  clearLockTimer(prediction.id);

  const winningOption = interaction.options.getString('winner');
  const { winnerCount, totalDistributed, topWinners, topLosers } = await resolvePrediction(prediction.id, winningOption);

  const resolved    = await getPrediction(prediction.id);
  const betSummary  = await getBetSummary(prediction.id);
  const resultEmbed = buildResultEmbed(resolved, betSummary, winnerCount, totalDistributed);

  try {
    const channel = await interaction.client.channels.fetch(prediction.channel_id);
    const msg     = await channel.messages.fetch(prediction.message_id);
    await msg.edit({ embeds: [resultEmbed], components: [] });
  } catch (err) {
    console.error('[predictionHandler] Failed to update resolve embed:', err);
  }

  const winnerLabel = winningOption === 'a' ? prediction.option_a : prediction.option_b;
  const palmaresEmbed = buildPalmaresEmbed(topWinners, topLosers);

  await interaction.reply({
    content: [
      `✅ Prédiction résolue ! **${winnerLabel}** a gagné.`,
      `**${winnerCount}** gagnant(s) se sont partagé 🍺 **${totalDistributed}** ${randomBeer()}.`,
    ].join('\n'),
    embeds: [palmaresEmbed],
  });
}

async function handleCancel(interaction) {
  if (!requireManageGuild(interaction)) return;

  const guildId = interaction.guildId;

  const prediction = await getActivePrediction(guildId);
  if (!prediction) {
    await interaction.reply({ content: '❌ Il n\'y a aucune prédiction active à annuler.', ephemeral: true });
    return;
  }

  // Cancel the auto-lock timer — no point locking a cancelled prediction
  clearLockTimer(prediction.id);

  await cancelPrediction(prediction.id);

  const cancelled  = await getPrediction(prediction.id);
  const betSummary = await getBetSummary(prediction.id);

  try {
    const channel = await interaction.client.channels.fetch(prediction.channel_id);
    const msg     = await channel.messages.fetch(prediction.message_id);
    await msg.edit({ embeds: [buildPredictionEmbed(cancelled, betSummary)], components: [] });
  } catch (err) {
    console.error('[predictionHandler] Failed to update cancel embed:', err);
  }

  await interaction.reply({ content: '✅ Prédiction annulée. Toutes les mises ont été remboursées.' });
}

// Shared bet logic used by both the slash command and the buttons/modal.
async function processBet(interaction, option, amount) {
  const guildId = interaction.guildId;

  const prediction = await getActivePrediction(guildId);
  if (!prediction) {
    await interaction.reply({ content: '❌ Il n\'y a aucune prédiction active sur laquelle parier.', ephemeral: true });
    return;
  }

  if (isNaN(amount) || amount < 1) {
    await interaction.reply({ content: `❌ La mise doit être d'au moins 🍺 **1** ${randomBeer()}.`, ephemeral: true });
    return;
  }

  const balance = await getPoints(interaction.user.id, guildId);
  if (balance < amount) {
    await interaction.reply({
      content: `❌ Vous n'avez pas assez de ${randomBeer()} 🍺. Solde : **${balance}**, mise : **${amount}**.`,
      ephemeral: true,
    });
    return;
  }

  const result = await placeBet(prediction.id, interaction.user.id, guildId, option, amount);
  if (result !== true) {
    await interaction.reply({ content: `❌ ${result}`, ephemeral: true });
    return;
  }

  const optionLabel = option === 'a' ? prediction.option_a : prediction.option_b;
  await interaction.reply({
    content: `✅ Vous avez misé 🍺 **${amount}** ${randomBeer()} sur **${optionLabel}** !`,
    ephemeral: true,
  });

  await refreshEmbed(interaction.client, prediction);
}

// Handles button clicks — customId format: "pred_bet:<option>:<amount|custom>"
async function handleButtonBet(interaction) {
  const [, option, amountStr] = interaction.customId.split(':');

  if (amountStr === 'custom') {
    const optionLabel = option === 'a' ? '🅰️ Option A' : '🅱️ Option B';
    const modal = new ModalBuilder()
      .setCustomId(`pred_modal:${option}`)
      .setTitle(`Mise sur ${optionLabel}`);

    const amountInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel('Nombre de bières à miser 🍺')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('ex: 250')
      .setMinLength(1)
      .setMaxLength(7)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
    await interaction.showModal(modal);
    return;
  }

  await processBet(interaction, option, parseInt(amountStr, 10));
}

// Handles modal submission — customId format: "pred_modal:<option>"
async function handleModalBet(interaction) {
  const [, option] = interaction.customId.split(':');
  const amountStr = interaction.fields.getTextInputValue('amount');
  const amount = parseInt(amountStr, 10);
  await processBet(interaction, option, amount);
}

module.exports = { handlePredict, handleBet, handleResolve, handleCancel, handleButtonBet, handleModalBet };
