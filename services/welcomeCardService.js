const { AttachmentBuilder } = require('discord.js');
const { trimText } = require('../utils/helpers');

const CARD_WIDTH = 1100;
const CARD_HEIGHT = 420;

const WELCOME_CARD_THEMES = {
  'dark-clean': {
    label: 'Dark Clean',
    background: ['#121826', '#1e293b'],
    accent: '#8b5cf6',
    accentSoft: '#312e81',
    text: '#f8fafc',
    subtext: '#cbd5e1',
    chip: '#1f2937',
  },
  'blue-premium': {
    label: 'Blue Premium',
    background: ['#0f172a', '#1d4ed8'],
    accent: '#60a5fa',
    accentSoft: '#1e3a8a',
    text: '#eff6ff',
    subtext: '#dbeafe',
    chip: '#172554',
  },
  minimal: {
    label: 'Minimal',
    background: ['#111827', '#374151'],
    accent: '#f9fafb',
    accentSoft: '#1f2937',
    text: '#ffffff',
    subtext: '#e5e7eb',
    chip: '#111827',
  },
  'neon-dark': {
    label: 'Neon Dark',
    background: ['#09090b', '#111827'],
    accent: '#22d3ee',
    accentSoft: '#164e63',
    text: '#ecfeff',
    subtext: '#a5f3fc',
    chip: '#082f49',
  },
};

function getWelcomeCardTheme(style) {
  return WELCOME_CARD_THEMES[String(style || '').toLowerCase()] || WELCOME_CARD_THEMES['blue-premium'];
}

function escapeXml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function normalizeHexColor(input, fallback) {
  const raw = String(input || '').trim();
  if (!raw) return fallback;
  const normalized = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9A-Fa-f]{6}$/.test(normalized) ? normalized : fallback;
}

function renderCardPlaceholders(template, member, settings) {
  const displayName = member.displayName || member.user.globalName || member.user.username;
  const channelMention = settings.highlightChannelId ? `<#${settings.highlightChannelId}>` : 'the important channels';
  return String(template || '')
    .replaceAll('{user}', `${member}`)
    .replaceAll('{server}', trimText(member.guild.name || 'this server', 80))
    .replaceAll('{count}', String(member.guild.memberCount || 0))
    .replaceAll('{member}', trimText(displayName, 40))
    .replaceAll('{channel}', channelMention);
}

async function fetchAsDataUrl(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

function getInitials(name) {
  return String(name || 'S')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase() || 'S';
}

function buildBackgroundSvg(theme, backgroundImageDataUrl) {
  if (backgroundImageDataUrl) {
    return `
      <image href="${backgroundImageDataUrl}" x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" preserveAspectRatio="xMidYMid slice" />
      <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="url(#overlayGradient)" />
    `;
  }

  return `
    <rect x="0" y="0" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" rx="36" fill="url(#bgGradient)" />
    <circle cx="920" cy="70" r="180" fill="${theme.accentSoft}" opacity="0.42" />
    <circle cx="120" cy="390" r="150" fill="${theme.accent}" opacity="0.14" />
    <circle cx="1020" cy="360" r="90" fill="#ffffff" opacity="0.06" />
  `;
}

function buildAvatarSvg({ avatarDataUrl, displayName, theme, settings }) {
  if (settings.showAvatar === false) return '';
  const fallbackInitials = escapeXml(getInitials(displayName));

  if (!avatarDataUrl) {
    return `
      <circle cx="210" cy="210" r="84" fill="${theme.accent}" opacity="0.92" />
      <circle cx="210" cy="210" r="92" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="8" />
      <text x="210" y="226" text-anchor="middle" fill="#ffffff" font-size="58" font-weight="700" font-family="Inter, Arial, sans-serif">${fallbackInitials}</text>
    `;
  }

  return `
    <defs>
      <clipPath id="avatarClip">
        <circle cx="210" cy="210" r="84" />
      </clipPath>
    </defs>
    <circle cx="210" cy="210" r="92" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="8" />
    <image href="${avatarDataUrl}" x="126" y="126" width="168" height="168" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice" />
  `;
}

function buildWelcomeCardSvg(member, settings, assets = {}) {
  const theme = getWelcomeCardTheme(settings.style);
  const textColor = normalizeHexColor(settings.textColor, theme.text);
  const subtextColor = theme.subtext;
  const displayName = trimText(member.displayName || member.user.globalName || member.user.username, 26);
  const username = trimText(member.user.username, 26);
  const joinLine = settings.showJoinText === false
    ? trimText(member.guild.name, 40)
    : `${trimText(username, 30)} just joined the server`;
  const memberCountLine = settings.showMemberCount === false
    ? trimText(member.guild.name, 40)
    : `Member #${member.guild.memberCount || 0}`;
  const avatarBlock = buildAvatarSvg({ avatarDataUrl: assets.avatarDataUrl, displayName, theme, settings });
  const backgroundSvg = buildBackgroundSvg(theme, assets.backgroundImageDataUrl);
  const nameX = settings.showAvatar === false ? 550 : 400;
  const textAnchor = settings.showAvatar === false ? 'middle' : 'start';

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_WIDTH}" height="${CARD_HEIGHT}" viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}">
    <defs>
      <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${theme.background[0]}" />
        <stop offset="100%" stop-color="${theme.background[1]}" />
      </linearGradient>
      <linearGradient id="overlayGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="rgba(15,23,42,0.78)" />
        <stop offset="100%" stop-color="rgba(30,41,59,0.72)" />
      </linearGradient>
      <filter id="panelShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000000" flood-opacity="0.28" />
      </filter>
    </defs>

    <rect x="20" y="20" width="${CARD_WIDTH - 40}" height="${CARD_HEIGHT - 40}" rx="36" fill="#0f172a" opacity="0.16" />
    <g filter="url(#panelShadow)">
      <rect x="30" y="30" width="${CARD_WIDTH - 60}" height="${CARD_HEIGHT - 60}" rx="36" fill="#0b1120" fill-opacity="0.12" stroke="#ffffff" stroke-opacity="0.08" />
      ${backgroundSvg}
    </g>

    <rect x="${settings.showAvatar === false ? 220 : 330}" y="110" width="${settings.showAvatar === false ? 660 : 640}" height="200" rx="30" fill="#0f172a" fill-opacity="0.34" stroke="#ffffff" stroke-opacity="0.08" />
    ${avatarBlock}

    <text x="${nameX}" y="165" text-anchor="${textAnchor}" fill="${theme.accent}" font-size="24" font-weight="600" font-family="Inter, Arial, sans-serif">WELCOME TO ${escapeXml(trimText(member.guild.name || 'SERVER', 28).toUpperCase())}</text>
    <text x="${nameX}" y="225" text-anchor="${textAnchor}" fill="${textColor}" font-size="52" font-weight="800" font-family="Inter, Arial, sans-serif">${escapeXml(displayName)}</text>
    <text x="${nameX}" y="268" text-anchor="${textAnchor}" fill="${subtextColor}" font-size="26" font-weight="500" font-family="Inter, Arial, sans-serif">${escapeXml(joinLine)}</text>

    <rect x="${settings.showAvatar === false ? 370 : 400}" y="292" width="210" height="44" rx="22" fill="${theme.chip}" fill-opacity="0.92" />
    <text x="${settings.showAvatar === false ? 475 : 505}" y="320" text-anchor="middle" fill="${textColor}" font-size="22" font-weight="700" font-family="Inter, Arial, sans-serif">${escapeXml(memberCountLine)}</text>

    <rect x="${settings.showAvatar === false ? 620 : 630}" y="292" width="210" height="44" rx="22" fill="#ffffff" fill-opacity="0.10" />
    <text x="${settings.showAvatar === false ? 725 : 735}" y="320" text-anchor="middle" fill="${subtextColor}" font-size="20" font-weight="600" font-family="Inter, Arial, sans-serif">${escapeXml(getWelcomeCardTheme(settings.style).label)}</text>
  </svg>`;
}

async function createWelcomeCardAttachment(member, settings) {
  const avatarUrl = member.displayAvatarURL({ extension: 'png', size: 512, forceStatic: false });
  const avatarDataUrl = settings.showAvatar === false ? null : await fetchAsDataUrl(avatarUrl);
  const backgroundImageDataUrl = settings.backgroundImageUrl ? await fetchAsDataUrl(settings.backgroundImageUrl) : null;
  const svg = buildWelcomeCardSvg(member, settings, { avatarDataUrl, backgroundImageDataUrl });
  return new AttachmentBuilder(Buffer.from(svg, 'utf8'), { name: 'serenity-welcome-card.svg' });
}

module.exports = {
  WELCOME_CARD_THEMES,
  buildWelcomeCardSvg,
  createWelcomeCardAttachment,
  getWelcomeCardTheme,
  normalizeHexColor,
  renderCardPlaceholders,
};
