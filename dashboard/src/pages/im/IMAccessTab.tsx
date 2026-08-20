import { useMemo } from 'react';
import { isChannelValidationPending } from '../../channel-status';
import { type Locale } from '../../i18n';
import { useStore } from '../../store';
import { BrandIcon } from '../../components/BrandIcon';
import type { ChannelSetupState, UserConfig } from '../../types';
import { Button, Row, RowGroup, Spinner, StatusPill, type StatusState } from '../../components/ui';

type IMAccessTabProps = {
  onOpenTelegram: () => void;
  onOpenFeishu: () => void;
};

type ChannelKey = 'telegram' | 'feishu';

type ChannelRowMeta = {
  key: ChannelKey;
  title: string;
  subtitle: string;
  channel: ChannelSetupState | null;
  loading?: boolean;
  statusLabel: string;
  statusVariant: 'ok' | 'warn' | 'muted' | 'accent';
  statusDescription: string;
  summary: string;
  summaryLabel: string;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
};

type CopyPack = {
  status: string;
  summary: string;
  loading: string;
  chats: string;
  notConnected: string;
  configuring: string;
  connected: string;
  failed: string;
  configure: string;
  continueSetup: string;
  viewSettings: string;
  noTelegram: string;
  noFeishu: string;
  pendingValidation: string;
  connectedReady: string;
  validationFailed: string;
  tokenSaved: string;
  appCredentialsSaved: string;
  allowedChats: string;
  notConnectedDetail: string;
};

function getCopy(locale: Locale): CopyPack {
  if (locale === 'zh-CN') {
    return {
      status: '状态',
      summary: '接入摘要',
      loading: '加载中',
      chats: '个 chat',
      notConnected: '未接入',
      configuring: '配置中',
      connected: '已接入',
      failed: '配置异常',
      configure: '去配置',
      continueSetup: '继续配置',
      viewSettings: '查看设置',
      noTelegram: '未配置 Bot Token',
      noFeishu: '未配置 App ID 与应用凭证',
      pendingValidation: '凭证已保存，等待验证。',
      connectedReady: '机器人已可正常接收消息。',
      validationFailed: '校验失败，请检查凭证或网络。',
      tokenSaved: 'Token 已保存',
      appCredentialsSaved: '应用凭证已保存',
      allowedChats: '允许',
      notConnectedDetail: '尚未配置账号与接入凭证。',
    };
  }

  return {
    status: 'Status',
    summary: 'Summary',
    loading: 'Loading',
    chats: 'chats',
    notConnected: 'Not connected',
    configuring: 'Configuring',
    connected: 'Connected',
    failed: 'Needs attention',
    configure: 'Configure',
    continueSetup: 'Continue setup',
    viewSettings: 'View settings',
    noTelegram: 'Bot token not configured',
    noFeishu: 'App ID and credentials not configured',
    pendingValidation: 'Credentials are saved and waiting for validation.',
    connectedReady: 'This channel can receive messages.',
    validationFailed: 'Validation failed. Check credentials or network.',
    tokenSaved: 'Token saved',
    appCredentialsSaved: 'Credentials saved',
    allowedChats: 'Allows',
    notConnectedDetail: 'Account and access credentials have not been configured yet.',
  };
}

function maskValue(value: string, keepStart = 4, keepEnd = 4): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= keepStart + keepEnd + 3) return trimmed;
  return `${trimmed.slice(0, keepStart)}...${trimmed.slice(-keepEnd)}`;
}

function countList(raw: string | undefined | null): number {
  return String(raw || '')
    .split(/[\n,;]/)
    .map(item => item.trim())
    .filter(Boolean).length;
}

function getConfigValue(config: Partial<UserConfig> | undefined, key: keyof UserConfig): string {
  return String(config?.[key] || '').trim();
}

function buildChannelSummary(key: ChannelKey, config: Partial<UserConfig>, copy: CopyPack): string {
  if (key === 'telegram') {
    const token = getConfigValue(config, 'telegramBotToken');
    const chatCount = countList(getConfigValue(config, 'telegramAllowedChatIds'));
    if (!token) return copy.noTelegram;
    return chatCount > 0
      ? `${copy.tokenSaved} · ${copy.allowedChats} ${chatCount} ${copy.chats}`
      : copy.tokenSaved;
  }

  const appId = getConfigValue(config, 'feishuAppId');
  const appSecret = getConfigValue(config, 'feishuAppSecret');
  if (!appId || !appSecret) return copy.noFeishu;
  return `App ID ${maskValue(appId)} · ${copy.appCredentialsSaved}`;
}

function getStatusPresentation(
  channel: ChannelSetupState | null,
  copy: CopyPack,
): Pick<ChannelRowMeta, 'statusLabel' | 'statusVariant' | 'statusDescription' | 'actionLabel'> {
  if (!channel || !channel.configured) {
    return {
      statusLabel: copy.notConnected,
      statusVariant: 'muted',
      statusDescription: channel?.detail || copy.notConnectedDetail,
      actionLabel: copy.configure,
    };
  }

  if (channel.ready) {
    return {
      statusLabel: copy.connected,
      statusVariant: 'ok',
      statusDescription: channel.detail || copy.connectedReady,
      actionLabel: copy.viewSettings,
    };
  }

  if (isChannelValidationPending(channel)) {
    return {
      statusLabel: copy.configuring,
      statusVariant: 'accent',
      statusDescription: channel.detail || copy.pendingValidation,
      actionLabel: copy.continueSetup,
    };
  }

  return {
    statusLabel: copy.failed,
    statusVariant: 'warn',
    statusDescription: channel.detail || copy.validationFailed,
    actionLabel: copy.continueSetup,
  };
}

function statusToPillState(variant: ChannelRowMeta['statusVariant'], loading?: boolean): StatusState {
  if (loading) return 'running';
  switch (variant) {
    case 'ok': return 'ok';
    case 'warn': return 'warn';
    case 'accent': return 'info';
    case 'muted': default: return 'idle';
  }
}

function ChannelRow({ meta }: { meta: ChannelRowMeta }) {
  return (
    <Row>
      <Row.Lead
        icon={<BrandIcon brand={meta.key} size={32} className="rounded-md" />}
        iconWrap={false}
        title={meta.title}
        subtitle={meta.subtitle}
      />

      <Row.Status>
        <StatusPill
          state={statusToPillState(meta.statusVariant, meta.loading)}
          label={meta.statusLabel}
        />
      </Row.Status>

      <Row.Field>{meta.summary}</Row.Field>

      <Row.Action>
        <Button
          tone={meta.channel?.ready ? 'secondary' : 'primary'}
          size="sm"
          onClick={meta.onAction}
          disabled={meta.actionDisabled}
        >
          {meta.loading && <Spinner className="h-3 w-3" />}
          {meta.actionLabel}
        </Button>
      </Row.Action>

      {meta.statusDescription && meta.statusDescription !== meta.statusLabel && (
        <Row.Description>{meta.statusDescription}</Row.Description>
      )}
    </Row>
  );
}

const CHANNEL_DEFS: ReadonlyArray<{
  key: ChannelKey;
  titleZh: string;
  titleEn: string;
  subtitleZh: string;
  subtitleEn: string;
  actionProp: keyof Pick<IMAccessTabProps, 'onOpenTelegram' | 'onOpenFeishu'>;
}> = [
  { key: 'telegram', titleZh: 'Telegram', titleEn: 'Telegram', subtitleZh: 'Bot Token 与 chat allowlist', subtitleEn: 'Bot token and chat allowlist', actionProp: 'onOpenTelegram' },
  { key: 'feishu', titleZh: '飞书', titleEn: 'Lark / Feishu', subtitleZh: '应用凭证与机器人身份', subtitleEn: 'App credentials and bot identity', actionProp: 'onOpenFeishu' },
];

export function IMAccessTab(props: IMAccessTabProps) {
  const state = useStore(s => s.state);
  const locale = useStore(s => s.locale);
  const copy = getCopy(locale);
  const loading = !state;
  const channels = state?.setupState?.channels || [];
  const config = state?.config || {};

  const rows = useMemo<ChannelRowMeta[]>(() => {
    return CHANNEL_DEFS.map(def => {
      const setup = channels.find(channel => channel.channel === def.key) || null;
      const title = locale === 'zh-CN' ? def.titleZh : def.titleEn;
      const subtitle = locale === 'zh-CN' ? def.subtitleZh : def.subtitleEn;
      const onAction = props[def.actionProp];

      if (loading) {
        return {
          key: def.key,
          title,
          subtitle,
          channel: null,
          loading: true,
          summary: copy.loading,
          summaryLabel: copy.summary,
          statusLabel: copy.loading,
          statusVariant: 'muted',
          statusDescription: copy.loading,
          actionLabel: copy.loading,
          actionDisabled: true,
          onAction,
        };
      }

      return {
        key: def.key,
        title,
        subtitle,
        channel: setup,
        summary: buildChannelSummary(def.key, config, copy),
        summaryLabel: copy.summary,
        ...getStatusPresentation(setup, copy),
        actionDisabled: false,
        onAction,
      };
    });
  }, [channels, config, copy, loading, locale, props]);

  return (
    <div className="animate-in">
      <RowGroup>
        {rows.map(row => (
          <ChannelRow key={row.key} meta={row} />
        ))}
      </RowGroup>
    </div>
  );
}
