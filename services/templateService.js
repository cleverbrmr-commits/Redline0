const { Colors } = require('discord.js');
const { trimText } = require('../utils/helpers');

const TEMPLATE_SCHEMAS = {
  welcome: {
    key: 'welcome',
    label: 'Welcome Messages',
    description: 'Warm onboarding cards and goodbye-ready copy blocks for new members.',
    styles: {
      minimal: {
        title: 'Welcome to {server}',
        subtitle: 'We are glad you are here, {user}.',
        body: 'Take a look around, check the key channels, and enjoy the community.',
        footer: 'SERENITY • Welcome suite',
        accent: Colors.Blurple,
      },
      premium: {
        title: 'Welcome to {server}',
        subtitle: 'Your spot is ready, {user}.',
        body: 'Read the important channels, meet the community, and settle in with confidence. You are member **#{count}**.',
        footer: 'SERENITY • Premium onboarding',
        accent: Colors.Gold,
      },
      onboarding: {
        title: 'You made it into {server}',
        subtitle: 'Start here and get connected.',
        body: 'Introduce yourself, review the starter channels, and pick up any community roles you need to begin.',
        footer: 'SERENITY • Member journey',
        accent: Colors.Green,
      },
    },
  },
  announcement: {
    key: 'announcement',
    label: 'Announcements',
    description: 'Public broadcast cards for updates, alerts, events, and changelogs.',
    styles: {
      broadcast: {
        titlePrefix: 'Broadcast',
        footer: 'SERENITY • Broadcast center',
        accent: Colors.Blurple,
      },
      update: {
        titlePrefix: 'Update',
        footer: 'SERENITY • Changelog stream',
        accent: Colors.Green,
      },
      alert: {
        titlePrefix: 'Alert',
        footer: 'SERENITY • Priority notice',
        accent: Colors.Red,
      },
      community: {
        titlePrefix: 'Community',
        footer: 'SERENITY • Community board',
        accent: Colors.Gold,
      },
    },
  },
  embed: {
    key: 'embed',
    label: 'Embeds',
    description: 'Reusable card structures for information, status, and public-facing panels.',
    styles: {
      premium: { footer: 'SERENITY • Premium card', accent: Colors.Blurple },
      minimal: { footer: 'SERENITY • Minimal card', accent: Colors.Grey },
      alert: { footer: 'SERENITY • Alert card', accent: Colors.Red },
      community: { footer: 'SERENITY • Community card', accent: Colors.Green },
      branded: { footer: 'SERENITY • Branded card', accent: Colors.Gold },
    },
  },
  ticket: {
    key: 'ticket',
    label: 'Ticket Panels',
    description: 'Support entry cards and starter messages for routed ticket workflows.',
    styles: {
      support: { panelTitle: 'Support Desk', panelBody: 'Open a private support ticket to talk with staff.', footer: 'SERENITY • Support desk', accent: Colors.Blurple },
      purchase: { panelTitle: 'Purchase Support', panelBody: 'Open a purchase-focused ticket for account, order, or premium questions.', footer: 'SERENITY • Commerce support', accent: Colors.Gold },
      report: { panelTitle: 'Report Center', panelBody: 'Create a confidential report ticket for moderation or safety concerns.', footer: 'SERENITY • Report intake', accent: Colors.Red },
      application: { panelTitle: 'Application Desk', panelBody: 'Open an application ticket for recruitment or review workflows.', footer: 'SERENITY • Application review', accent: Colors.Green },
    },
  },
  poll: {
    key: 'poll',
    label: 'Polls',
    description: 'Structured voting cards with styles for community prompts and urgent decisions.',
    styles: {
      minimal: { footer: 'SERENITY • Polls', accent: Colors.Blurple },
      premium: { footer: 'SERENITY • Community pulse', accent: Colors.Gold },
      alert: { footer: 'SERENITY • Priority vote', accent: Colors.Red },
      update: { footer: 'SERENITY • Release feedback', accent: Colors.Green },
    },
  },
  autoresponder: {
    key: 'autoresponder',
    label: 'Auto Responders',
    description: 'Reusable automated message styles for FAQ, support, and reminder responses.',
    styles: {
      minimal: { footer: 'SERENITY • Auto response', accent: Colors.Blurple },
      support: { footer: 'SERENITY • Support automation', accent: Colors.Green },
      alert: { footer: 'SERENITY • Alert automation', accent: Colors.Red },
      community: { footer: 'SERENITY • Community automation', accent: Colors.Gold },
    },
  },
};

function listTemplateFamilies() {
  return Object.values(TEMPLATE_SCHEMAS);
}

function getTemplateFamily(key) {
  return TEMPLATE_SCHEMAS[String(key || '').toLowerCase()] || null;
}

function getTemplateStyle(familyKey, styleKey) {
  const family = getTemplateFamily(familyKey);
  if (!family) return null;
  const normalizedStyle = String(styleKey || '').toLowerCase();
  return family.styles[normalizedStyle] || family.styles.premium || Object.values(family.styles)[0] || null;
}

function listTemplateStyles(familyKey) {
  const family = getTemplateFamily(familyKey);
  if (!family) return [];
  return Object.entries(family.styles).map(([key, value]) => ({ key, ...value }));
}

function describeTemplateFamily(key) {
  const family = getTemplateFamily(key);
  if (!family) return 'Unknown template family.';
  const styles = Object.keys(family.styles).map((style) => `\`${style}\``).join(', ');
  return `${family.description} Available styles: ${styles}.`;
}

function buildTemplatePreviewFields(familyKey) {
  const family = getTemplateFamily(familyKey);
  if (!family) return [];
  return Object.entries(family.styles).map(([styleKey, style]) => ({
    name: `${styleKey}`,
    value: trimText(style.body || style.panelBody || style.footer || style.titlePrefix || 'Template preset', 180),
    inline: true,
  })).slice(0, 12);
}

module.exports = {
  TEMPLATE_SCHEMAS,
  buildTemplatePreviewFields,
  describeTemplateFamily,
  getTemplateFamily,
  getTemplateStyle,
  listTemplateFamilies,
  listTemplateStyles,
};
