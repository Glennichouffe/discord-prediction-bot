require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

const { initDB }              = require('./src/db');
const { startActivityTracker } = require('./src/activityTracker');
const { handlePoints, handleLeaderboard }         = require('./src/handlers/pointsHandler');
const { handlePredict, handleBet, handleResolve, handleCancel, handleButtonBet, handleModalBet } = require('./src/handlers/predictionHandler');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await initDB();
  startActivityTracker(client);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith('pred_bet:')) {
      return await handleButtonBet(interaction);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('pred_modal:')) {
      return await handleModalBet(interaction);
    }

    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {
      case 'bières':      return await handlePoints(interaction);
      case 'classement':  return await handleLeaderboard(interaction);
      case 'prédiction':  return await handlePredict(interaction);
      case 'parier':      return await handleBet(interaction);
      case 'résoudre':    return await handleResolve(interaction);
      case 'annuler':     return await handleCancel(interaction);
    }
  } catch (err) {
    console.error('[interactionCreate]', err);
    const errMsg = { content: '❌ Une erreur est survenue. Veuillez réessayer.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errMsg);
    } else {
      await interaction.reply(errMsg);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
