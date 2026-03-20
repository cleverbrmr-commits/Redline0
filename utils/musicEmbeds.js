const { makeEmbed, makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('./embeds');
const { trimText } = require('./helpers');

const QUEUE_PAGE_SIZE = 10;

function formatDuration(durationMs) {
  const duration = Number(durationMs) || 0;
  if (duration <= 0) return 'Live / unknown';

  const totalSeconds = Math.floor(duration / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return [hours, minutes, seconds].map((value, index) => String(value).padStart(index === 0 ? 1 : 2, '0')).join(':');
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatRequester(user) {
  if (!user) return 'Unknown requester';
  if (typeof user.toString === 'function' && /^<@/.test(String(user))) return String(user);
  return user.toString ? user.toString() : `**${trimText(user.username || user.tag || 'Unknown requester', 80)}**`;
}

function inferProvider(uri = '', sourceName = '') {
  const value = `${uri} ${sourceName}`.toLowerCase();
  if (value.includes('spotify')) return 'Spotify metadata';
  if (value.includes('soundcloud')) return 'SoundCloud';
  if (value.includes('ytmsearch') || value.includes('music.youtube')) return 'YouTube Music';
  if (value.includes('youtu')) return 'YouTube';
  if (value.includes('http')) return 'Direct / external';
  return 'Search';
}

function deriveThumbnail(track) {
  const uri = track?.info?.uri || '';
  const artwork = track?.info?.artworkUrl || track?.info?.thumbnail || track?.thumbnail || null;
  if (artwork) return artwork;

  if (uri.includes('youtube.com/watch')) {
    const videoId = new URL(uri).searchParams.get('v');
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
  }

  if (uri.includes('youtu.be/')) {
    const videoId = uri.split('youtu.be/')[1]?.split(/[?&]/)[0];
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
  }

  return null;
}

function createTrackCardData(track, { requestedBy = null, queuePosition = null } = {}) {
  const info = track?.info || track || {};
  return {
    id: track?.encoded || track?.identifier || info.identifier || info.uri || info.title,
    title: info.title || 'Unknown track',
    url: info.uri || track?.url || null,
    durationMs: Number(info.length || track?.durationMs || 0),
    thumbnail: deriveThumbnail(track),
    requestedBy,
    sourceLabel: inferProvider(info.uri, info.sourceName),
    provider: inferProvider(info.uri, info.sourceName),
    artist: info.author || info.artist || 'Unknown artist',
    queuePosition,
  };
}

function buildTrackFields(track, extraFields = []) {
  return [
    { name: 'Artist / Uploader', value: trimText(track.artist || 'Unknown artist', 100), inline: true },
    { name: 'Duration', value: formatDuration(track.durationMs), inline: true },
    { name: 'Source', value: track.sourceLabel || 'Unknown', inline: true },
    { name: 'Requested By', value: formatRequester(track.requestedBy), inline: true },
    ...(track.queuePosition ? [{ name: 'Queue Position', value: String(track.queuePosition), inline: true }] : []),
    ...extraFields,
  ];
}

function buildPlayEmbed({ track, queueLength, addedCount, started, contextLabel }) {
  return makeSuccessEmbed({
    title: started ? 'Now Playing' : addedCount > 1 ? 'Playlist Queued' : 'Track Queued',
    description: track?.url ? `[${trimText(track.title, 140)}](${track.url})` : trimText(track?.title || 'Unknown track', 140),
    thumbnail: track?.thumbnail || null,
    fields: buildTrackFields(track, [
      { name: 'Status', value: started ? 'Playback started' : 'Added to queue', inline: true },
      { name: 'Queue Size', value: `${queueLength} track${queueLength === 1 ? '' : 's'}`, inline: true },
      { name: 'Request Summary', value: contextLabel || (addedCount > 1 ? `${addedCount} tracks added.` : 'One track added.'), inline: false },
    ]),
    footer: 'REDLINE • Serenity Music',
  });
}

function buildNowPlayingEmbed({ currentTrack, upcomingTracks = [], loopMode = 'off', volume = 100, startedAt = null, queue = [] }) {
  const nextTracks = upcomingTracks.length ? upcomingTracks : queue;

  if (!currentTrack && nextTracks.length) {
    const pendingTrack = nextTracks[0];
    return makeInfoEmbed({
      title: 'Playback is starting',
      description: pendingTrack.url ? `[${trimText(pendingTrack.title, 140)}](${pendingTrack.url})` : trimText(pendingTrack.title, 140),
      thumbnail: pendingTrack.thumbnail || null,
      fields: buildTrackFields(pendingTrack, [
        { name: 'Status', value: 'Queued and waiting for Lavalink to begin playback', inline: false },
        { name: 'Volume', value: `${volume}%`, inline: true },
        { name: 'Loop', value: String(loopMode || 'off').toUpperCase(), inline: true },
      ]),
      footer: 'REDLINE • Serenity Music',
    });
  }

  if (!currentTrack) {
    return makeInfoEmbed({
      title: 'Nothing is playing',
      description: 'Use `/play` or `Serenity play <query>` to start a queue.',
      footer: 'REDLINE • Serenity Music',
    });
  }

  const elapsed = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
  return makeEmbed({
    title: 'Now Playing',
    description: currentTrack.url ? `[${trimText(currentTrack.title, 140)}](${currentTrack.url})` : trimText(currentTrack.title, 140),
    thumbnail: currentTrack.thumbnail || null,
    fields: buildTrackFields(currentTrack, [
      { name: 'Elapsed', value: formatDuration(elapsed), inline: true },
      { name: 'Loop', value: String(loopMode || 'off').toUpperCase(), inline: true },
      { name: 'Volume', value: `${volume}%`, inline: true },
      {
        name: 'Up Next',
        value: nextTracks.length
          ? nextTracks.slice(0, 3).map((track, index) => `**${index + 2}.** ${trimText(track.title, 70)} • \`${formatDuration(track.durationMs)}\``).join('\n')
          : 'Queue ends after this track.',
        inline: false,
      },
    ]),
    footer: 'REDLINE • Premium playback status',
  });
}

function buildQueueEmbed({ currentTrack, queue = [], loopMode = 'off', volume = 100 }, page = 1, guildName = 'Current Server') {
  if (!currentTrack && !queue.length) {
    return makeInfoEmbed({
      title: 'Queue is empty',
      description: 'There are no queued tracks right now. Use `/play` to add something premium-worthy.',
      footer: 'REDLINE • Serenity Music',
    });
  }

  const totalPages = Math.max(1, Math.ceil(queue.length / QUEUE_PAGE_SIZE));
  const safePage = Math.min(totalPages, Math.max(1, Number(page) || 1));
  const startIndex = (safePage - 1) * QUEUE_PAGE_SIZE;
  const visibleTracks = queue.slice(startIndex, startIndex + QUEUE_PAGE_SIZE);

  const lines = [
    currentTrack
      ? `**Now:** [${trimText(currentTrack.title, 90)}](${currentTrack.url}) • \`${formatDuration(currentTrack.durationMs)}\` • ${formatRequester(currentTrack.requestedBy)}`
      : '**Now:** Nothing playing',
    '',
    visibleTracks.length
      ? visibleTracks.map((track, index) => `**${startIndex + index + 2}.** [${trimText(track.title, 75)}](${track.url}) • \`${formatDuration(track.durationMs)}\` • ${trimText(track.artist, 36)} • ${formatRequester(track.requestedBy)}`).join('\n')
      : '*No additional tracks on this page.*',
  ];

  return makeEmbed({
    title: `Queue • ${guildName}`,
    description: lines.join('\n'),
    thumbnail: currentTrack?.thumbnail || null,
    fields: [
      { name: 'Tracks', value: `${queue.length + (currentTrack ? 1 : 0)}`, inline: true },
      { name: 'Loop', value: String(loopMode || 'off').toUpperCase(), inline: true },
      { name: 'Volume', value: `${volume}%`, inline: true },
    ],
    footer: `REDLINE • Queue page ${safePage}/${totalPages}`,
  });
}

function buildStateEmbed(title, description, tone = 'info', track = null) {
  const factory = tone === 'success' ? makeSuccessEmbed : tone === 'warning' ? makeWarningEmbed : makeInfoEmbed;
  return factory({
    title,
    description,
    thumbnail: track?.thumbnail || null,
    fields: track ? buildTrackFields(track) : [],
    footer: 'REDLINE • Serenity Music Controls',
  });
}

function buildRemovedEmbed(track, position) {
  return makeSuccessEmbed({
    title: 'Removed from queue',
    description: track?.url
      ? `Removed **#${position}** • [${trimText(track.title, 120)}](${track.url})`
      : `Removed **#${position}** • ${trimText(track?.title || 'Unknown track', 120)}`,
    thumbnail: track?.thumbnail || null,
    fields: buildTrackFields(track),
    footer: 'REDLINE • Serenity Music',
  });
}

function buildQueueEndedEmbed() {
  return makeInfoEmbed({
    title: 'Queue ended',
    description: 'The queue finished and Serenity has left the voice channel.',
    footer: 'REDLINE • Serenity Music',
  });
}

module.exports = {
  QUEUE_PAGE_SIZE,
  buildNowPlayingEmbed,
  buildPlayEmbed,
  buildQueueEmbed,
  buildQueueEndedEmbed,
  buildRemovedEmbed,
  buildStateEmbed,
  createTrackCardData,
  formatDuration,
};
