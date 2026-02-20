const { SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('bières')
    .setDescription('Vérifiez votre solde de bières 🍺')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Vérifiez le solde d\'un autre utilisateur')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('classement')
    .setDescription('Voir le top 10 des meilleurs buveurs du serveur 🍺'),

  new SlashCommandBuilder()
    .setName('prédiction')
    .setDescription('Démarrer une nouvelle prédiction')
    .addStringOption((option) =>
      option
        .setName('question')
        .setDescription('La question de la prédiction')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('option_a')
        .setDescription('Première option')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('option_b')
        .setDescription('Deuxième option')
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('duration')
        .setDescription('Durée d\'ouverture des paris (en minutes, 1–60)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(60)
    ),

  new SlashCommandBuilder()
    .setName('parier')
    .setDescription('Placer un pari sur la prédiction active')
    .addStringOption((option) =>
      option
        .setName('option')
        .setDescription('Sur quelle option parier')
        .setRequired(true)
        .addChoices(
          { name: 'Option A', value: 'a' },
          { name: 'Option B', value: 'b' },
        )
    )
    .addIntegerOption((option) =>
      option
        .setName('amount')
        .setDescription('Nombre de bières à miser 🍺')
        .setRequired(true)
        .setMinValue(1)
    ),

  new SlashCommandBuilder()
    .setName('résoudre')
    .setDescription('Résoudre la prédiction active (modérateurs uniquement)')
    .addStringOption((option) =>
      option
        .setName('winner')
        .setDescription('L\'option gagnante')
        .setRequired(true)
        .addChoices(
          { name: 'Option A', value: 'a' },
          { name: 'Option B', value: 'b' },
        )
    ),

  new SlashCommandBuilder()
    .setName('annuler')
    .setDescription('Annuler la prédiction active et rembourser tous les paris (modérateurs uniquement)'),
];

module.exports = commands;
