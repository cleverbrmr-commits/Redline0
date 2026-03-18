const { makeEmbed } = require('../utils/embeds');

function buildAvatarEmbed(user) {
  const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 4096, forceStatic: false });

  return makeEmbed({
    title: `Avatar • ${user.tag || user.username}`,
    description: [
      `${user}`,
      `User ID: \`${user.id}\``,
      `[Open avatar in browser](${avatarUrl})`,
    ].join('\n'),
    image: avatarUrl,
    thumbnail: avatarUrl,
    footer: 'REDLINE • Public avatar viewer',
  });
}

module.exports = {
  buildAvatarEmbed,
};
