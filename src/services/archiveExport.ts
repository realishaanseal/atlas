import type { ArchiveSnapshot } from '@/services/archive';
import type { ArchivedEmoji, ArchivedMedia, ArchivedMessage } from '@/storage/archive';
import type { ParticipantId } from '@/types';

/**
 * Renders the local archive into a single self-contained HTML file.
 *
 * Everything is inlined — images and voice notes as base64 data URIs, all CSS in
 * one <style>, one tiny <script> to reveal spoilers — so the file opens in any
 * browser, forever, with no dependency on Atlas or the network. It is the
 * portable keepsake; the in-app store is what feeds it.
 *
 * The text formatter mirrors EmojiText exactly (headings, bullets, code,
 * spoilers, bold, italic, custom emoji, mentions, and jumbo emoji-only lines) so
 * the memory reads the way the conversation did. Every text leaf is escaped;
 * nothing peer-authored is interpolated as markup.
 */

interface ExportOptions {
  readonly mySlot: ParticipantId;
  readonly peerName: string;
}

interface RenderContext {
  readonly emojiByName: Map<string, string>;
  readonly emojiById: Map<string, { url: string; name: string }>;
  readonly mySlot: ParticipantId;
  readonly peerName: string;
}

const INLINE =
  /`([^`\n]+)`|\|\|([\s\S]+?)\|\||\*\*([\s\S]+?)\*\*|\*([^*\n]+?)\*|:([a-z0-9_]{2,32}):|<@([ab])>|((?:https?:\/\/|www\.)[^\s<]+)/g;

const URL_TRAILING = /[.,!?;:)\]}'"]+$/;

const UNICODE_EMOJI =
  /\p{Extended_Pictographic}(?:️)?(?:\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️)?)*|\p{Regional_Indicator}{2}|[0-9#*]️?⃣/gu;

const INLINE_PX = 20;
const JUMBO_PX = 40;

const SAFE_AUDIO_MIME = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/mp4;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
]);

const SAFE_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function mediaDataUri(media: ArchivedMedia): string {
  let mime: string;
  if (media.kind === 'audio') {
    mime = SAFE_AUDIO_MIME.has(media.mime) ? media.mime : 'audio/webm';
  } else if (media.kind === 'video') {
    mime = SAFE_VIDEO_MIME.has(media.mime) ? media.mime : 'video/mp4';
  } else {
    mime = media.mime === 'image/gif' ? 'image/gif' : 'image/webp';
  }
  return `data:${mime};base64,${bytesToBase64(media.bytes)}`;
}

function emojiDataUri(emoji: ArchivedEmoji): string {
  const mime = emoji.mime === 'image/gif' ? 'image/gif' : 'image/webp';
  return `data:${mime};base64,${bytesToBase64(emoji.bytes)}`;
}

// --- inline + block formatting (ports EmojiText) ---------------------------

function renderInline(text: string, ctx: RenderContext, size: number): string {
  let out = '';
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const index = match.index;
    if (index > last) out += escapeHtml(text.slice(last, index));

    if (match[1] !== undefined) {
      out += `<code>${escapeHtml(match[1])}</code>`;
    } else if (match[2] !== undefined) {
      out += `<span class="spoiler">${renderInline(match[2], ctx, size)}</span>`;
    } else if (match[3] !== undefined) {
      out += `<strong>${renderInline(match[3], ctx, size)}</strong>`;
    } else if (match[4] !== undefined) {
      out += `<em>${renderInline(match[4], ctx, size)}</em>`;
    } else if (match[5] !== undefined) {
      const url = ctx.emojiByName.get(match[5]);
      out += url
        ? `<img class="ce" src="${url}" alt=":${escapeHtml(match[5])}:" title=":${escapeHtml(match[5])}:" style="width:${String(size)}px;height:${String(size)}px">`
        : escapeHtml(match[0]);
    } else if (match[6] !== undefined) {
      const label = match[6] === ctx.mySlot ? 'You' : ctx.peerName;
      out += `<span class="mention">@${escapeHtml(label)}</span>`;
    } else if (match[7] !== undefined) {
      const label = match[7].replace(URL_TRAILING, '');
      const href = label.startsWith('www.') ? `https://${label}` : label;
      out += `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer nofollow">${escapeHtml(label)}</a>`;
      last = index + label.length;
      continue;
    }

    last = index + match[0].length;
  }

  if (last < text.length) out += escapeHtml(text.slice(last));
  return out;
}

function isJumbo(text: string, ctx: RenderContext): boolean {
  let count = 0;
  let rest = text.replace(/\s/g, '');
  if (rest.length === 0) return false;

  rest = rest.replace(/:([a-z0-9_]{2,32}):/g, (whole, name: string) => {
    if (ctx.emojiByName.has(name)) {
      count += 1;
      return '';
    }
    return whole;
  });
  rest = rest.replace(UNICODE_EMOJI, () => {
    count += 1;
    return '';
  });

  return rest.length === 0 && count > 0 && count <= 12;
}

function renderText(text: string, ctx: RenderContext): string {
  if (isJumbo(text, ctx)) {
    return `<p class="jumbo">${renderInline(text, ctx, JUMBO_PX)}</p>`;
  }

  const blocks: string[] = [];
  let paragraph: string[] = [];
  let bullets: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(`<p>${paragraph.join('<br>')}</p>`);
      paragraph = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length > 0) {
      blocks.push(`<ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>`);
      bullets = [];
    }
  };

  for (const line of text.split('\n')) {
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushBullets();
      const level = (heading[1] ?? '').length;
      blocks.push(`<h${String(level)}>${renderInline(heading[2] ?? '', ctx, INLINE_PX)}</h${String(level)}>`);
      continue;
    }
    const bullet = /^[-*] (.+)$/.exec(line);
    if (bullet) {
      flushParagraph();
      bullets.push(renderInline(bullet[1] ?? '', ctx, INLINE_PX));
      continue;
    }
    flushBullets();
    paragraph.push(renderInline(line, ctx, INLINE_PX));
  }
  flushParagraph();
  flushBullets();

  return blocks.join('');
}

// --- message pieces --------------------------------------------------------

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`;
}

function dayKey(ms: number): string {
  return new Date(ms).toDateString();
}

function dayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function reactionsHtml(record: ArchivedMessage, ctx: RenderContext): string {
  const reactions = record.reactions;
  if (!reactions) return '';
  const counts = new Map<string, number>();
  for (const value of [...(reactions.a ?? []), ...(reactions.b ?? [])]) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  if (counts.size === 0) return '';

  const chips = [...counts.entries()].map(([value, n]) => {
    let glyph: string;
    if (value.startsWith('custom:')) {
      const emoji = ctx.emojiById.get(value.slice('custom:'.length));
      glyph = emoji
        ? `<img class="ce" src="${emoji.url}" alt=":${escapeHtml(emoji.name)}:" style="width:16px;height:16px">`
        : '□';
    } else {
      glyph = escapeHtml(value);
    }
    return `<span class="reaction">${glyph}${n > 1 ? ` <span class="rn">${String(n)}</span>` : ''}</span>`;
  });

  return `<div class="reactions">${chips.join('')}</div>`;
}

function replyHtml(record: ArchivedMessage, ctx: RenderContext): string {
  if (!record.replyTo) return '';
  const who = record.replyTo.sender === ctx.mySlot ? 'You' : ctx.peerName;
  return `<div class="reply"><span class="reply-who">${escapeHtml(who)}</span>${renderInline(record.replyTo.preview, ctx, INLINE_PX)}</div>`;
}

function bodyHtml(record: ArchivedMessage, media: Map<string, ArchivedMedia>, ctx: RenderContext): string {
  if (record.kind === 'text') {
    return renderText(record.text ?? '', ctx);
  }

  if (record.kind === 'image') {
    if (record.mediaId && media.has(record.mediaId)) {
      const uri = mediaDataUri(media.get(record.mediaId) as ArchivedMedia);
      return `<img class="media" src="${uri}" alt="image" loading="lazy">`;
    }
    return `<div class="gone">🖼️ image no longer available</div>`;
  }

  if (record.kind === 'video') {
    if (record.mediaId && media.has(record.mediaId)) {
      const uri = mediaDataUri(media.get(record.mediaId) as ArchivedMedia);
      return `<video class="media" controls preload="metadata" src="${uri}"></video>`;
    }
    return `<div class="gone">🎬 video not saved</div>`;
  }

  if (record.kind === 'audio') {
    const duration = record.durationMs ? ` <span class="dur">${formatDuration(record.durationMs)}</span>` : '';
    if (record.mediaId && media.has(record.mediaId)) {
      const uri = mediaDataUri(media.get(record.mediaId) as ArchivedMedia);
      return `<div class="voice"><audio controls src="${uri}"></audio>${duration}</div>`;
    }
    return `<div class="gone">🎤 voice message not saved${duration}</div>`;
  }

  // call
  const kind = record.callKind === 'video' ? 'Video call' : 'Voice call';
  const detail =
    record.outcome === 'completed'
      ? record.callDurationMs
        ? ` · ${formatDuration(record.callDurationMs)}`
        : ''
      : record.outcome === 'missed'
        ? ' · missed'
        : ' · declined';
  return `<div class="call">📞 ${escapeHtml(kind)}${escapeHtml(detail)}</div>`;
}

// --- document --------------------------------------------------------------

function buildHtml(snapshot: ArchiveSnapshot, options: ExportOptions): string {
  const emojiByName = new Map<string, string>();
  const emojiById = new Map<string, { url: string; name: string }>();
  for (const emoji of snapshot.emoji.values()) {
    const uri = emojiDataUri(emoji);
    emojiByName.set(emoji.name, uri);
    emojiById.set(emoji.id, { url: uri, name: emoji.name });
  }

  const ctx: RenderContext = {
    emojiByName,
    emojiById,
    mySlot: options.mySlot,
    peerName: options.peerName,
  };

  const rows: string[] = [];
  let lastDay = '';
  let lastSender: ParticipantId | null = null;

  for (const record of snapshot.messages) {
    const day = dayKey(record.createdAt);
    if (day !== lastDay) {
      rows.push(`<div class="day">${escapeHtml(dayLabel(record.createdAt))}</div>`);
      lastDay = day;
      lastSender = null;
    }

    const mine = record.sender === options.mySlot;
    const side = mine ? 'me' : 'them';

    if (record.kind === 'call') {
      rows.push(`<div class="system">${bodyHtml(record, snapshot.media, ctx)}</div>`);
      lastSender = null;
      continue;
    }

    const showName = !mine && record.sender !== lastSender;
    const name = showName
      ? `<div class="name">${escapeHtml(options.peerName)}</div>`
      : '';
    const edited = record.editedAt ? ' <span class="edited">(edited)</span>' : '';

    rows.push(
      `<div class="row ${side}">${name}<div class="bubble">${replyHtml(record, ctx)}${bodyHtml(record, snapshot.media, ctx)}<div class="meta">${formatTime(record.createdAt)}${edited}</div>${reactionsHtml(record, ctx)}</div></div>`,
    );
    lastSender = record.sender;
  }

  const generated = new Date().toLocaleString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const count = snapshot.messages.length;
  const title = `Atlas chat with ${options.peerName}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #0d1017; color: #e7e9ee;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  .wrap { max-width: 780px; margin: 0 auto; padding: 24px 16px 80px; }
  header { text-align: center; padding: 24px 0 8px; border-bottom: 1px solid #1e2430; margin-bottom: 20px; }
  header h1 { font-size: 20px; margin: 0 0 4px; }
  header p { margin: 0; color: #8b93a4; font-size: 13px; }
  .day { text-align: center; color: #8b93a4; font-size: 12px; margin: 22px 0 12px;
    text-transform: uppercase; letter-spacing: .04em; }
  .system { text-align: center; color: #9aa3b2; font-size: 13px; margin: 8px 0; }
  .call { display: inline-block; background: #161b26; padding: 5px 12px; border-radius: 999px; }
  .row { display: flex; flex-direction: column; margin: 3px 0; max-width: 78%; }
  .row.me { margin-left: auto; align-items: flex-end; }
  .row.them { margin-right: auto; align-items: flex-start; }
  .name { font-size: 12px; color: #8b93a4; margin: 8px 0 2px 10px; }
  .bubble { padding: 8px 12px; border-radius: 16px; word-wrap: break-word; overflow-wrap: anywhere; }
  .row.them .bubble { background: #1b2130; border-bottom-left-radius: 5px; }
  .row.me .bubble { background: #3b5bdb; color: #fff; border-bottom-right-radius: 5px; }
  .bubble p { margin: 0; white-space: pre-wrap; }
  .bubble h1, .bubble h2, .bubble h3 { margin: 2px 0; line-height: 1.25; }
  .bubble h1 { font-size: 1.5em; } .bubble h2 { font-size: 1.25em; } .bubble h3 { font-size: 1.05em; }
  .bubble ul { margin: 2px 0; padding-left: 20px; }
  .jumbo { font-size: 40px; line-height: 1.1; }
  code { background: rgba(0,0,0,.28); padding: 1px 5px; border-radius: 5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; }
  .mention { font-weight: 600; background: rgba(255,255,255,.14); border-radius: 4px; padding: 0 3px; }
  .bubble a { color: inherit; text-decoration: underline; text-underline-offset: 2px; word-break: break-all; }
  .ce { display: inline-block; object-fit: contain; vertical-align: text-bottom; margin-bottom: -2px; }
  .media { max-width: 320px; max-height: 380px; width: auto; height: auto; border-radius: 10px; display: block; }
  .voice { display: flex; align-items: center; gap: 8px; }
  .voice audio { height: 34px; }
  .dur { color: inherit; opacity: .7; font-size: 12px; }
  .gone { color: #9aa3b2; font-style: italic; }
  .meta { font-size: 11px; opacity: .6; margin-top: 3px; text-align: right; }
  .edited { font-style: italic; }
  .reply { border-left: 3px solid rgba(255,255,255,.35); padding: 2px 8px; margin-bottom: 5px;
    font-size: 13px; opacity: .85; }
  .reply-who { display: block; font-weight: 600; font-size: 12px; opacity: .9; }
  .reactions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
  .row.me .reactions { justify-content: flex-end; }
  .reaction { display: inline-flex; align-items: center; gap: 3px; background: #161b26;
    border: 1px solid #262d3b; border-radius: 999px; padding: 1px 7px; font-size: 13px; color: #e7e9ee; }
  .rn { font-size: 11px; color: #8b93a4; }
  .spoiler { background: #11151d; border-radius: 4px; padding: 0 3px; cursor: pointer; color: transparent; }
  .spoiler.on { color: inherit; background: rgba(255,255,255,.12); cursor: auto; }
  .spoiler.on .ce { opacity: 1; } .spoiler .ce { opacity: 0; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>${escapeHtml(title)}</h1>
      <p>${String(count)} message${count === 1 ? '' : 's'} · saved ${escapeHtml(generated)}</p>
    </header>
    ${rows.join('\n    ')}
  </div>
  <script>
    document.querySelectorAll('.spoiler').forEach(function (s) {
      s.addEventListener('click', function () { s.classList.add('on'); });
    });
  </script>
</body>
</html>`;
}

/** Builds the export and triggers a download. */
export function downloadHtmlExport(snapshot: ArchiveSnapshot, options: ExportOptions): void {
  const html = buildHtml(snapshot, options);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const stamp = new Date().toISOString().slice(0, 10);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `atlas-chat-${stamp}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10000);
}
