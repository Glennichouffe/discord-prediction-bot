require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./src/commands');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

const payload = commands.map((cmd) => cmd.toJSON());

// Register to a specific guild (instant) or globally (up to 1 hour to propagate).
// Set GUILD_ID in .env for guild-scoped registration during development.
const route = GUILD_ID
  ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
  : Routes.applicationCommands(CLIENT_ID);

const scope = GUILD_ID ? `guild ${GUILD_ID}` : 'all guilds (global)';

(async () => {
  try {
    console.log(`Registering ${payload.length} slash command(s) to ${scope}...`);
    const data = await rest.put(route, { body: payload });
    console.log(`Successfully registered ${data.length} command(s).`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
