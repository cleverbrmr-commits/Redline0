const { makeEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');

function buildAvatarEmbed(user) {
  const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 4096, forceStatic: false });

  return makeEmbed({
    title: `Avatar • ${trimText(user.tag || user.username, 120)}`,
    description: [
      `${user}`,
      `User ID • \`${user.id}\``,
      `[Open original avatar](${avatarUrl})`,
    ].join('\n'),
    author: {
      name: 'Redline Profile Card',
      iconURL: avatarUrl,
    },
    image: avatarUrl,
    thumbnail: avatarUrl,
    footer: 'REDLINE • Public avatar viewer',
  });
}

module.exports = {
  buildAvatarEmbed,
};
