const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { randomBeer } = require('./beerWord');

const STATUS_COLORS = {
  open:      0x3498db, // blue
  locked:    0xf1c40f, // yellow
  resolved:  0x2ecc71, // green
  cancelled: 0xe74c3c, // red
};

// Returns "2h 30m remaining", "45m remaining", "< 1m remaining", or "Ended"
function formatTimeRemaining(endsAt) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return 'Terminé';

  const totalSeconds = Math.floor(diff / 1000);
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) return `${hours}h ${minutes}m restant`;
  if (minutes > 0) return `${minutes}m restant`;
  return '< 1m restant';
}

const MIN_ODDS = 1.3;

// Returns e.g. "1.25x" or null if the side has no bets
function calcOdds(sideTotals, totalPot) {
  if (totalPot === 0 || sideTotals === 0) return null;
  const raw = totalPot / sideTotals;
  return `${Math.max(raw, MIN_ODDS).toFixed(2)}x`;
}

function buildOptionField(label, optionName, total, count, odds, isEmptySide) {
  const bettorLine = count > 0
    ? `🍺 **${total}** ${randomBeer()} misées par **${count}** parieur(s)`
    : 'Aucun pari pour l\'instant';

  const oddsLine = isEmptySide
    ? 'Cote : 🎯 **Premier parieur !** *(varie selon votre mise)*'
    : `Cote : **${odds ?? 'N/A'}**`;

  return {
    name: `${label}  ${optionName}`,
    value: `${bettorLine}\n${oddsLine}`,
    inline: true,
  };
}

function buildPredictionEmbed(prediction, betSummary) {
  const { totalA, totalB, countA, countB } = betSummary;
  const totalPot = totalA + totalB;

  const oddsA = calcOdds(totalA, totalPot);
  const oddsB = calcOdds(totalB, totalPot);

  const STATUS_LABELS = { open: 'Ouvert', locked: 'Fermé', resolved: 'Résolu', cancelled: 'Annulé' };
  const statusLabel = STATUS_LABELS[prediction.status] ?? prediction.status;
  const footer = prediction.status === 'open'
    ? `${statusLabel} · ${formatTimeRemaining(prediction.ends_at)} · Les cotes évoluent en temps réel`
    : `Statut : ${statusLabel}`;

  return new EmbedBuilder()
    .setTitle(prediction.question)
    .setColor(STATUS_COLORS[prediction.status] ?? 0x95a5a6)
    .addFields(
      buildOptionField('🅰️', prediction.option_a, totalA, countA, oddsA, totalA === 0 && totalPot > 0),
      buildOptionField('🅱️', prediction.option_b, totalB, countB, oddsB, totalB === 0 && totalPot > 0),
    )
    .setFooter({ text: footer });
}

function buildResultEmbed(prediction, betSummary, winnersCount, totalDistributed) {
  const { totalA, totalB, countA, countB } = betSummary;
  const totalPot = totalA + totalB;

  const winnerLabel = prediction.winning_option === 'a' ? prediction.option_a : prediction.option_b;
  const loserLabel  = prediction.winning_option === 'a' ? prediction.option_b : prediction.option_a;

  const payoutText = winnersCount > 0
    ? `**${winnersCount}** gagnant(s) se sont partagé 🍺 **${totalDistributed}** ${randomBeer()} d'une cagnotte de **${totalPot}**`
    : `Personne n'a parié sur **${winnerLabel}** — aucune ${randomBeer()} n'a été distribuée.`;

  return new EmbedBuilder()
    .setTitle(prediction.question)
    .setColor(STATUS_COLORS.resolved)
    .setDescription(`🏆 **${winnerLabel}** a gagné !\n❌ **${loserLabel}** a perdu.`)
    .addFields(
      {
        name: '💰 Gains',
        value: payoutText,
      },
      {
        name: `🅰️ ${prediction.option_a}`,
        value: `🍺 ${totalA} · ${countA} parieur(s)`,
        inline: true,
      },
      {
        name: `🅱️ ${prediction.option_b}`,
        value: `🍺 ${totalB} · ${countB} parieur(s)`,
        inline: true,
      },
    )
    .setFooter({ text: 'Prédiction résolue' });
}

function buildPalmaresEmbed(topWinners, topLosers) {
  const winnerMedals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

  const winnersText = topWinners.length === 0
    ? '*Aucun gagnant*'
    : topWinners.map((w, i) =>
        `${winnerMedals[i]} <@${w.user_id}> — 🍺 **+${w.profit}** *(misé ${w.bet}, reçu ${w.payout})*`
      ).join('\n');

  const losersText = topLosers.length === 0
    ? '*Aucun perdant*'
    : topLosers.map((l, i) =>
        `**${i + 1}.** <@${l.user_id}> — 🍺 **-${l.loss}**`
      ).join('\n');

  return new EmbedBuilder()
    .setTitle('📊 Palmarès de la prédiction')
    .addFields(
      { name: '🏆 Top gagnants', value: winnersText, inline: false },
      { name: '💀 Top perdants', value: losersText, inline: false },
    )
    .setColor(0x9b59b6);
}

const BET_PRESETS = [10, 50, 100];

// Returns the two ActionRows with bet buttons, or [] when betting is closed.
function buildPredictionComponents(prediction) {
  if (prediction.status !== 'open') return [];

  const rowA = new ActionRowBuilder().addComponents(
    ...BET_PRESETS.map((amount) =>
      new ButtonBuilder()
        .setCustomId(`pred_bet:a:${amount}`)
        .setLabel(`🅰️ ${amount} 🍺`)
        .setStyle(ButtonStyle.Primary)
    ),
    new ButtonBuilder()
      .setCustomId('pred_bet:a:custom')
      .setLabel('🅰️ Personnalisé')
      .setStyle(ButtonStyle.Secondary),
  );

  const rowB = new ActionRowBuilder().addComponents(
    ...BET_PRESETS.map((amount) =>
      new ButtonBuilder()
        .setCustomId(`pred_bet:b:${amount}`)
        .setLabel(`🅱️ ${amount} 🍺`)
        .setStyle(ButtonStyle.Danger)
    ),
    new ButtonBuilder()
      .setCustomId('pred_bet:b:custom')
      .setLabel('🅱️ Personnalisé')
      .setStyle(ButtonStyle.Secondary),
  );

  return [rowA, rowB];
}

module.exports = { buildPredictionEmbed, buildResultEmbed, buildPalmaresEmbed, buildPredictionComponents };
