import { applyChannelEnvFallback, type ChannelName, type UserConfig } from '../core/config/user-config.js';

export function hasConfiguredChannelToken(
  rawConfig: Partial<UserConfig>,
  channel: ChannelName,
  tokenOverride?: string | null,
): boolean {
  const config = applyChannelEnvFallback(rawConfig);
  switch (channel) {
    case 'telegram':
      return !!(config.telegramBotToken || tokenOverride);
    case 'feishu':
      return !!((config.feishuAppId && config.feishuAppSecret) || tokenOverride);
  }
}

export function resolveConfiguredChannels(opts: {
  explicitChannels?: string | null;
  config: Partial<UserConfig>;
  tokenOverride?: string | null;
}): ChannelName[] {
  const rawChannels = String(opts.explicitChannels || '').trim();
  if (rawChannels) {
    return rawChannels.split(',').map(channel => channel.trim().toLowerCase()).filter(Boolean) as ChannelName[];
  }
  if (opts.config.channels?.length) {
    return opts.config.channels.filter(channel => hasConfiguredChannelToken(opts.config, channel, opts.tokenOverride));
  }

  const detected: ChannelName[] = [];
  if (hasConfiguredChannelToken(opts.config, 'feishu', opts.tokenOverride)) detected.push('feishu');
  if (hasConfiguredChannelToken(opts.config, 'telegram', opts.tokenOverride)) detected.push('telegram');
  return detected;
}
