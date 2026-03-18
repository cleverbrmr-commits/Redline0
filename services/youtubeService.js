const { loadYoutubeState, saveYoutubeState } = require('../storage/youtubeStore');
const { makeEmbed, makeInfoEmbed, makeSuccessEmbed, makeWarningEmbed } = require('../utils/embeds');
const { trimText } = require('../utils/helpers');

const YOUTUBE_POLL_INTERVAL_MS = Math.max(60_000, Number(process.env.YOUTUBE_POLL_INTERVAL_MS) || 300_000);
const CHANNEL_ID_PATTERN = /channel\/([A-Za-z0-9_-]{20,})/i;
const HANDLE_PATTERN = /youtube\.com\/@([A-Za-z0-9._-]+)/i;
let youtubePollTimer = null;
let youtubePollRunning = false;

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Redline Discord Bot',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`YouTube request failed (${response.status}): ${trimText(text, 180)}`);
  }

  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Redline Discord Bot',
      Accept: 'text/html,application/xml,text/xml;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`YouTube request failed (${response.status}).`);
  }

  return response.text();
}

function parseFeedEntries(xml) {
  const entries = [...String(xml || '').matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => match[1]);
  return entries.map((entry) => ({
    videoId: entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/i)?.[1] || null,
    channelId: entry.match(/<yt:channelId>([^<]+)<\/yt:channelId>/i)?.[1] || null,
    title: entry.match(/<title>([^<]+)<\/title>/i)?.[1] || 'Untitled upload',
    link: entry.match(/<link[^>]+href="([^"]+)"/i)?.[1] || null,
    publishedAt: entry.match(/<published>([^<]+)<\/published>/i)?.[1] || null,
    author: entry.match(/<name>([^<]+)<\/name>/i)?.[1] || 'Unknown channel',
  }));
}

async function fetchLatestChannelUpload(channelId) {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
  const [latest] = parseFeedEntries(xml);
  return latest || null;
}

async function resolveYoutubeChannel(link) {
  const raw = String(link || '').trim();
  if (!raw) {
    throw new Error('Provide a YouTube channel URL.');
  }

  const channelId = raw.match(CHANNEL_ID_PATTERN)?.[1];
  if (channelId) {
    const latest = await fetchLatestChannelUpload(channelId).catch(() => null);
    return {
      channelId,
      channelTitle: latest?.author || raw,
      channelUrl: `https://www.youtube.com/channel/${channelId}`,
      lastVideoId: latest?.videoId || null,
    };
  }

  const handle = raw.match(HANDLE_PATTERN)?.[1];
  const html = await fetchText(raw.startsWith('http') ? raw : `https://${raw.replace(/^\/+/, '')}`);
  const resolvedChannelId = html.match(/(?:channelId|externalId)":"(UC[^"]+)"/)?.[1] || html.match(/itemprop="identifier" content="(UC[^"]+)"/i)?.[1];
  const resolvedTitle = html.match(/<meta property="og:title" content="([^"]+)"/i)?.[1] || handle || 'YouTube channel';

  if (!resolvedChannelId) {
    throw new Error('Could not resolve that YouTube channel URL. Use a channel URL or public handle URL.');
  }

  const latest = await fetchLatestChannelUpload(resolvedChannelId).catch(() => null);
  return {
    channelId: resolvedChannelId,
    channelTitle: latest?.author || resolvedTitle,
    channelUrl: `https://www.youtube.com/channel/${resolvedChannelId}`,
    lastVideoId: latest?.videoId || null,
  };
}

async function searchYouTubeVideos(query) {
  if (!process.env.YOUTUBE_API_KEY) {
    throw new Error('YOUTUBE_API_KEY is not configured, so YouTube search is unavailable.');
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '5');
  url.searchParams.set('safeSearch', 'moderate');
  url.searchParams.set('key', process.env.YOUTUBE_API_KEY);

  const payload = await fetchJson(url.toString());
  return (payload.items || []).map((item) => ({
    id: item.id?.videoId,
    title: item.snippet?.title || 'Untitled video',
    channelTitle: item.snippet?.channelTitle || 'Unknown channel',
    publishedAt: item.snippet?.publishedAt || null,
    url: item.id?.videoId ? `https://www.youtube.com/watch?v=${item.id.videoId}` : null,
  })).filter((item) => item.id && item.url);
}

async function addYoutubeSubscription({ guildId, youtubeChannelLink, discordChannelId, pingEveryone }) {
  const state = await loadYoutubeState();
  const resolved = await resolveYoutubeChannel(youtubeChannelLink);

  const duplicate = state.subscriptions.find((entry) =>
    entry.guildId === guildId &&
    entry.youtubeChannelId === resolved.channelId &&
    entry.discordChannelId === discordChannelId
  );

  if (duplicate) {
    throw new Error('That YouTube channel is already subscribed for this Discord channel.');
  }

  state.subscriptions.push({
    guildId,
    youtubeChannelId: resolved.channelId,
    youtubeChannelTitle: resolved.channelTitle,
    youtubeChannelUrl: resolved.channelUrl,
    discordChannelId,
    pingEveryone: Boolean(pingEveryone),
    lastVideoId: resolved.lastVideoId,
    createdAt: new Date().toISOString(),
  });

  await saveYoutubeState(state);
  return state.subscriptions[state.subscriptions.length - 1];
}

async function removeYoutubeSubscription({ guildId, youtubeChannelLink }) {
  const state = await loadYoutubeState();
  const resolved = await resolveYoutubeChannel(youtubeChannelLink);
  const before = state.subscriptions.length;
  state.subscriptions = state.subscriptions.filter((entry) => !(entry.guildId === guildId && entry.youtubeChannelId === resolved.channelId));
  await saveYoutubeState(state);
  return { removed: before - state.subscriptions.length, channelId: resolved.channelId, channelTitle: resolved.channelTitle };
}

async function listYoutubeSubscriptions(guildId) {
  const state = await loadYoutubeState();
  return state.subscriptions.filter((entry) => entry.guildId === guildId);
}

async function pollYoutubeSubscriptions(client) {
  if (youtubePollRunning) return;
  youtubePollRunning = true;

  try {
    const state = await loadYoutubeState();
    let changed = false;

    for (const subscription of state.subscriptions) {
      try {
        const latest = await fetchLatestChannelUpload(subscription.youtubeChannelId);
        if (!latest?.videoId || latest.videoId === subscription.lastVideoId) {
          continue;
        }

        subscription.lastVideoId = latest.videoId;
        subscription.youtubeChannelTitle = latest.author || subscription.youtubeChannelTitle;
        subscription.youtubeChannelUrl = subscription.youtubeChannelUrl || `https://www.youtube.com/channel/${subscription.youtubeChannelId}`;
        changed = true;

        const channel = await client.channels.fetch(subscription.discordChannelId).catch(() => null);
        if (!channel || typeof channel.send !== 'function') {
          continue;
        }

        const embed = makeEmbed({
          title: 'New YouTube Upload',
          description: `**${trimText(latest.author || subscription.youtubeChannelTitle, 120)}** uploaded a new video.`,
          fields: [
            { name: 'Video', value: `[${trimText(latest.title, 200)}](${latest.link || `https://www.youtube.com/watch?v=${latest.videoId}`})` },
            { name: 'Published', value: latest.publishedAt ? `<t:${Math.floor(new Date(latest.publishedAt).getTime() / 1000)}:R>` : 'Unknown', inline: true },
            { name: 'Target Channel', value: `<#${subscription.discordChannelId}>`, inline: true },
          ],
        });

        await channel.send({
          content: subscription.pingEveryone ? '@everyone' : undefined,
          embeds: [embed],
        });
      } catch (error) {
        console.error('YouTube poll failed for subscription', subscription.youtubeChannelId, error);
      }
    }

    if (changed) {
      await saveYoutubeState(state);
    }
  } finally {
    youtubePollRunning = false;
  }
}

function startYoutubePolling(client) {
  if (youtubePollTimer) return youtubePollTimer;
  pollYoutubeSubscriptions(client).catch((error) => console.error('Initial YouTube poll failed:', error));
  youtubePollTimer = setInterval(() => {
    pollYoutubeSubscriptions(client).catch((error) => console.error('Scheduled YouTube poll failed:', error));
  }, YOUTUBE_POLL_INTERVAL_MS);
  return youtubePollTimer;
}

function buildYoutubeSearchEmbed(query, results) {
  if (!results.length) {
    return makeInfoEmbed({
      title: 'YouTube Search',
      description: `No results found for **${trimText(query, 100)}**.`,
    });
  }

  return makeEmbed({
    title: `YouTube Search • ${trimText(query, 80)}`,
    description: results
      .map((result, index) => `${index + 1}. [${trimText(result.title, 90)}](${result.url})\n   Channel: **${trimText(result.channelTitle, 70)}** • Published: ${result.publishedAt ? `<t:${Math.floor(new Date(result.publishedAt).getTime() / 1000)}:R>` : 'Unknown'}`)
      .join('\n\n'),
  });
}

function buildYoutubeSubscriptionEmbed(subscription) {
  return makeSuccessEmbed({
    title: 'YouTube notifications enabled',
    description: `Uploads from **${trimText(subscription.youtubeChannelTitle, 120)}** will be posted in <#${subscription.discordChannelId}>.`,
    fields: [
      { name: 'YouTube Channel', value: subscription.youtubeChannelUrl },
      { name: 'Ping @everyone', value: subscription.pingEveryone ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Last Seen Upload', value: subscription.lastVideoId || 'Will detect on next poll', inline: true },
    ],
  });
}

function buildYoutubeSubscriptionListEmbed(subscriptions) {
  if (!subscriptions.length) {
    return makeInfoEmbed({
      title: 'YouTube subscriptions',
      description: 'No YouTube upload notifications are configured for this server.',
    });
  }

  return makeEmbed({
    title: 'YouTube subscriptions',
    description: subscriptions.map((entry, index) => `${index + 1}. **${trimText(entry.youtubeChannelTitle || entry.youtubeChannelId, 80)}**\n   ${entry.youtubeChannelUrl}\n   Discord: <#${entry.discordChannelId}> • Ping: ${entry.pingEveryone ? 'Yes' : 'No'}`).join('\n\n'),
  });
}

module.exports = {
  YOUTUBE_POLL_INTERVAL_MS,
  addYoutubeSubscription,
  buildYoutubeSearchEmbed,
  buildYoutubeSubscriptionEmbed,
  buildYoutubeSubscriptionListEmbed,
  listYoutubeSubscriptions,
  pollYoutubeSubscriptions,
  removeYoutubeSubscription,
  resolveYoutubeChannel,
  searchYouTubeVideos,
  startYoutubePolling,
};
