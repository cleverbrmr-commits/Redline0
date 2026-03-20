const { makeEmbed, makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('./embeds');
const { trimText } = require('./helpers');

const QUEUE_PAGE_SIZE = 10;

function formatDuration(durationMs) {
  if (!durationMs || durationMs <= 0) return 'Live / unknown';
  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? [hours, minutes, seconds].map((value, index) => String(value).padStart(index === 0 ? 1 : 2, '0')).join(':')
    : [minutes, seconds].map((value, index) => String(value).padStart(index === 0 ? 1 : 2, '0')).join(':');
}

function formatRequester(user) {
  if (!user) return 'Unknown requester';
  return user.toString ? user.toString() : `**${trimText(user.username || 'Unknown requester', 80)}**`;
}

function formatArtist(track) {
  return trimText(track.artist || 'Unknown artist / uploader', 80);
}

function formatTrackLine(track, index) {
  return `**${index}.** [${trimText(track.title, 70)}](${track.url})\n┗ ${formatArtist(track)} • \`${formatDuration(track.durationMs)}\` • ${trimText(track.sourceLabel || 'Unknown', 24)} • ${formatRequester(track.requestedBy)}`;
}

function buildTrackFields(track, extraFields = []) {
  return [
    { name: 'Artist / Uploader', value: formatArtist(track), inline: true },
    { name: 'Duration', value: formatDuration(track.durationMs), inline: true },
    { name: 'Requested By', value: formatRequester(track.requestedBy), inline: true },
    { name: 'Source', value: track.sourceLabel || 'Unknown', inline: true },
    ...(track.positionText ? [{ name: 'Queue Position', value: track.positionText, inline: true }] : []),
    ...extraFields,
  ];
}

function buildPlayEmbed({ track, queueLength, addedCount, started }) {
  const title = started ? 'Now Playing' : addedCount > 1 ? 'Playlist Queued' : 'Track Queued';
  const description = started
    ? `[${trimText(track.title, 120)}](${track.url})`
    : addedCount > 1
      ? `Added **${addedCount} tracks** to the queue.`
      : `[${trimText(track.title, 120)}](${track.url})`;

  return makeSuccessEmbed({
    title,
    description,
    thumbnail: track.thumbnail || null,
    fields: buildTrackFields({
      ...track,
      positionText: started ? 'Playing now' : `${queueLength}`,
    }, [
      { name: 'Queue Size', value: `${queueLength} track${queueLength === 1 ? '' : 's'}`, inline: true },
      { name: 'Provider', value: track.provider || track.sourceLabel || 'Unknown', inline: true },
    ]),
    footer: 'REDLINE • Music transport online',
  });
}

function buildNowPlayingEmbed(queue) {
  const track = queue?.currentTrack;
  if (!track) {
    return makeInfoEmbed({
      title: 'Nothing is playing',
      description: 'Use `/play` or `Serenity play <query>` to start a queue.',
    });
  }

  const elapsedMs = queue.nowPlayingStartedAt ? Math.max(0, Date.now() - queue.nowPlayingStartedAt) : 0;
  return makeEmbed({
    title: 'Now Playing',
    description: `[${trimText(track.title, 140)}](${track.url})`,
    thumbnail: track.thumbnail || null,
    fields: buildTrackFields(track, [
      { name: 'Elapsed', value: formatDuration(elapsedMs), inline: true },
      { name: 'Loop', value: String(queue.loopMode || 'off').toUpperCase(), inline: true },
      { name: 'Volume', value: `${queue.volume}%`, inline: true },
      { name: 'Up Next', value: queue.tracks[0] ? trimText(queue.tracks[0].title, 100) : 'Queue ends after this track', inline: false },
    ]),
    footer: 'REDLINE • Premium playback status',
  });
}

function buildQueueEmbed(queue, page = 1) {
  if (!queue?.currentTrack && !queue?.tracks?.length) {
    return makeInfoEmbed({
      title: 'Queue is empty',
      description: 'There are no queued tracks right now.',
    });
  }

  const totalPages = Math.max(1, Math.ceil(queue.tracks.length / QUEUE_PAGE_SIZE));
  const safePage = Math.min(totalPages, Math.max(1, Number(page) || 1));
  const startIndex = (safePage - 1) * QUEUE_PAGE_SIZE;
  const visibleTracks = queue.tracks.slice(startIndex, startIndex + QUEUE_PAGE_SIZE);

  const description = [
    queue.currentTrack
      ? `**Now:** [${trimText(queue.currentTrack.title, 90)}](${queue.currentTrack.url})\n┗ ${formatArtist(queue.currentTrack)} • \`${formatDuration(queue.currentTrack.durationMs)}\` • ${formatRequester(queue.currentTrack.requestedBy)}`
      : '**Now:** Nothing playing',
    '',
    visibleTracks.length
      ? visibleTracks.map((track, index) => formatTrackLine(track, startIndex + index + 2)).join('\n\n')
      : '*No additional tracks on this page.*',
  ].join('\n');

  return makeEmbed({
    title: `Queue • ${queue.guildName || 'Current Server'}`,
    description,
    thumbnail: queue.currentTrack?.thumbnail || null,
    fields: [
      { name: 'Tracks', value: `${queue.currentTrack ? queue.tracks.length + 1 : queue.tracks.length}`, inline: true },
      { name: 'Loop', value: String(queue.loopMode || 'off').toUpperCase(), inline: true },
      { name: 'Volume', value: `${queue.volume}%`, inline: true },
    ],
    footer: `REDLINE • Queue page ${safePage}/${totalPages}`,
  });
}

function buildStateEmbed(title, description, tone = 'info') {
  const factory = tone === 'success' ? makeSuccessEmbed : tone === 'warning' ? makeWarningEmbed : makeInfoEmbed;
  return factory({ title, description, footer: 'REDLINE • Music controls' });
}

function buildRemovedEmbed(track, position) {
  return makeSuccessEmbed({
    title: 'Removed from queue',
    description: `Removed **#${position}** • [${trimText(track.title, 120)}](${track.url})`,
    thumbnail: track.thumbnail || null,
    fields: buildTrackFields(track),
  });
}

module.exports = {
  QUEUE_PAGE_SIZE,
  buildNowPlayingEmbed,
  buildPlayEmbed,
  buildQueueEmbed,
  buildRemovedEmbed,
  buildStateEmbed,
  formatDuration,
};
