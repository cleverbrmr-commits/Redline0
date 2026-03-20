const {
  DEFAULT_VOLUME,
  LOOP_MODES,
  getLoopMode,
  getPlayerVolume,
} = require('./queueService');
const {
  MusicError,
  clearPlayerQueue,
  createOrReusePlayer,
  destroyMusicSubsystem,
  enqueueResolvedTracks,
  ensureMusicSubsystem,
  getGuildState,
  getPlayer,
  pausePlayer,
  removePlayerTrack,
  requireControllablePlayer,
  requirePlayer,
  resolveTracks,
  resumePlayer,
  setPlayerLoop,
  shufflePlayerQueue,
  skipPlayer,
  snapshotPlayer,
  startPlaybackIfIdle,
  stopAndDestroyPlayer,
  updatePlayerVolume,
} = require('./playerService');
const {
  buildNowPlayingEmbed,
  buildPlayEmbed,
  buildQueueEmbed,
  buildRemovedEmbed,
  buildStateEmbed,
  createTrackCardData,
} = require('../utils/musicEmbeds');

function ensureGuildContext(source) {
  if (!source?.guild) {
    throw new MusicError('Music commands can only be used inside a server.');
  }
}

function getMemberFromSource(source) {
  return source.member || null;
}

function getActorFromSource(source) {
  return source.user || source.author || null;
}

async function toTrackCard(source, track, queuePosition = null) {
  return createTrackCardData(track, {
    requestedBy: getRequesterEntity(source, track),
    queuePosition,
  });
}

function getRequesterEntity(source, track) {
  const requesterId = track?.info?.requester;
  if (!requesterId) return getActorFromSource(source);
  return source.guild?.members?.cache?.get(requesterId)?.user || getActorFromSource(source);
}

async function buildSnapshotCards(source, player) {
  const snapshot = snapshotPlayer(player);
  const state = getGuildState(source.guild.id);
  const currentTrack = snapshot.currentTrack ? await toTrackCard(source, snapshot.currentTrack, 1) : null;
  const queue = await Promise.all(snapshot.queue.map((track, index) => toTrackCard(source, track, index + 2)));

  return {
    currentTrack,
    queue,
    queueLength: snapshot.queueLength,
    loopMode: getLoopMode(player),
    volume: getPlayerVolume(player),
    startedAt: state?.currentTrackStartedAt || null,
  };
}

async function playCommand(source, query) {
  ensureGuildContext(source);
  const member = getMemberFromSource(source);
  const actor = getActorFromSource(source);
  const { player } = await createOrReusePlayer({
    guild: source.guild,
    member,
    textChannelId: source.channel?.id || source.channelId || null,
  });

  const resolved = await resolveTracks({
    guildId: source.guild.id,
    query,
    requesterId: actor?.id || null,
  });

  const queueBefore = snapshotPlayer(player).queueLength;
  const addedTracks = await enqueueResolvedTracks(player, resolved, actor?.id || null);
  const started = await startPlaybackIfIdle(player);
  const focusTrack = started ? player.current || addedTracks[0] : addedTracks[0];
  const focusCard = await toTrackCard(source, focusTrack, started ? 1 : queueBefore + 1);

  const loadType = String(resolved.loadType || '').toLowerCase();
  const contextLabel = loadType === 'playlist'
    ? `Queued **${addedTracks.length} tracks** from **${resolved.playlistInfo?.name || 'playlist'}**.`
    : started
      ? 'Playback started immediately.'
      : 'Added to the active queue.';

  return {
    embeds: [buildPlayEmbed({
      track: focusCard,
      queueLength: queueBefore + addedTracks.length,
      addedCount: addedTracks.length,
      started,
      contextLabel,
    })],
  };
}

function requireExistingPlayerForGuild(source) {
  ensureGuildContext(source);
  return requirePlayer(source.guild.id);
}

function requireControllablePlayerForGuild(source) {
  ensureGuildContext(source);
  return requireControllablePlayer(source.guild.id, getMemberFromSource(source));
}

async function pauseCommand(source) {
  const player = requireControllablePlayerForGuild(source);
  if (!player.current) {
    throw new MusicError('Nothing is currently playing.');
  }

  pausePlayer(player);
  const card = await toTrackCard(source, player.current, 1);
  return { embeds: [buildStateEmbed('Playback paused', `Paused **${card.title}**.`, 'success', card)] };
}

async function resumeCommand(source) {
  const player = requireControllablePlayerForGuild(source);
  if (!player.current) {
    throw new MusicError('Nothing is currently paused.');
  }

  resumePlayer(player);
  const card = await toTrackCard(source, player.current, 1);
  return { embeds: [buildStateEmbed('Playback resumed', `Resumed **${card.title}**.`, 'success', card)] };
}

async function skipCommand(source) {
  const player = requireControllablePlayerForGuild(source);
  if (!player.current) {
    throw new MusicError('Nothing is currently playing.');
  }

  const card = await toTrackCard(source, player.current, 1);
  skipPlayer(player);
  return { embeds: [buildStateEmbed('Track skipped', `Skipped **${card.title}**.`, 'success', card)] };
}

async function stopCommand(source) {
  const player = requireControllablePlayerForGuild(source);
  const queued = snapshotPlayer(player).queue.length;
  stopAndDestroyPlayer(player);
  return { embeds: [buildStateEmbed('Playback stopped', `Disconnected from voice and cleared **${queued}** queued track${queued === 1 ? '' : 's'}.`, 'success')] };
}

async function leaveCommand(source) {
  const player = requireControllablePlayerForGuild(source);
  const queued = snapshotPlayer(player).queue.length;
  stopAndDestroyPlayer(player);
  return { embeds: [buildStateEmbed('Left the voice channel', `Serenity disconnected and removed **${queued}** queued track${queued === 1 ? '' : 's'}.`, 'success')] };
}

async function queueCommand(source, page = 1) {
  const player = requireExistingPlayerForGuild(source);
  const cards = await buildSnapshotCards(source, player);
  return { embeds: [buildQueueEmbed(cards, page, source.guild.name)] };
}

async function nowPlayingCommand(source) {
  const player = requireExistingPlayerForGuild(source);
  const cards = await buildSnapshotCards(source, player);
  return {
    embeds: [buildNowPlayingEmbed({
      currentTrack: cards.currentTrack,
      upcomingTracks: cards.queue,
      loopMode: cards.loopMode,
      volume: cards.volume,
      startedAt: cards.startedAt,
    })],
  };
}

async function removeCommand(source, position) {
  const player = requireControllablePlayerForGuild(source);
  if (Number(position) === 1) {
    throw new MusicError('Use `/skip` if you want to remove the currently playing track.');
  }

  const removed = removePlayerTrack(player, position);
  if (!removed) {
    throw new MusicError('That queue position does not exist.');
  }

  const card = await toTrackCard(source, removed, position);
  return { embeds: [buildRemovedEmbed(card, position)] };
}

async function clearCommand(source) {
  const player = requireControllablePlayerForGuild(source);
  const removed = clearPlayerQueue(player);
  return { embeds: [buildStateEmbed('Queue cleared', `Removed **${removed}** upcoming track${removed === 1 ? '' : 's'}. The current track will keep playing.`, 'success')] };
}

async function shuffleCommand(source) {
  const player = requireControllablePlayerForGuild(source);
  const queueSize = snapshotPlayer(player).queue.length;
  if (queueSize < 2) {
    throw new MusicError('You need at least two upcoming tracks before shuffle can do anything useful.');
  }

  shufflePlayerQueue(player);
  return { embeds: [buildStateEmbed('Queue shuffled', `Shuffled **${queueSize}** queued track${queueSize === 1 ? '' : 's'}.`, 'success')] };
}

async function loopCommand(source, mode) {
  const player = requireControllablePlayerForGuild(source);
  const applied = setPlayerLoop(player, String(mode || LOOP_MODES.OFF).toLowerCase());
  return { embeds: [buildStateEmbed('Loop mode updated', `Loop mode is now **${applied.toUpperCase()}**.`, 'success')] };
}

async function volumeCommand(source, volume) {
  const player = requireControllablePlayerForGuild(source);
  const applied = updatePlayerVolume(player, volume);
  const description = applied === 0
    ? 'Volume is now **0%**. Playback stays connected but muted.'
    : `Volume is now **${applied}%**.`;
  return { embeds: [buildStateEmbed('Volume updated', description, 'success')] };
}

module.exports = {
  DEFAULT_VOLUME,
  LOOP_MODES,
  MusicError,
  clearCommand,
  destroyMusicSubsystem,
  ensureMusicSubsystem,
  leaveCommand,
  loopCommand,
  nowPlayingCommand,
  pauseCommand,
  playCommand,
  queueCommand,
  removeCommand,
  resumeCommand,
  shuffleCommand,
  skipCommand,
  stopCommand,
  volumeCommand,
};
