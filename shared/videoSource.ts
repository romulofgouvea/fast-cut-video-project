import { extractYouTubeId } from "./youtube";
import { parseLocalSource } from "./localSource";

/**
 * Where a video comes from. Downloading/cutting is source-agnostic (yt-dlp
 * handles ~1800 sites); this only drives the in-page preview.
 *
 * `hasBridge` is true only for YouTube, whose IFrame API lets us read/seek the
 * playback time for the "mark start / mark end" flow. For everyone else we show
 * a plain embed (or the thumbnail) with no time control — cuts are typed in.
 */
export type VideoProvider =
  | "youtube"
  | "vimeo"
  | "dailymotion"
  | "rumble"
  | "twitch"
  | "facebook"
  | "instagram"
  | "tiktok"
  | "twitter"
  | "reddit"
  | "telegram"
  | "linkedin"
  | "giphy"
  | "pinterest"
  | "local"
  | "other";

export type VideoSource = {
  provider: VideoProvider;
  /** Provider-native id, when the URL contains one. */
  id?: string;
  /** URL for an <iframe> preview, when the provider allows embedding. */
  embedUrl?: string;
  /** True only when we have a JS time API (currentTime + seek). */
  hasBridge: boolean;
  /** True if the video is known to be in vertical format (9:16). */
  isVertical?: boolean;
};

/** `src` of the first `<iframe>` in a pasted embed snippet, else null. */
function iframeSrc(text: string): string | null {
  if (!/<iframe[\s/>]/i.test(text)) return null;
  const src = text.match(/<iframe\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
  return src ? src.trim() : null;
}

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const TRACKING_PARAM =
  /^(utm_[a-z]+|ref_src|ref_url|refer|referrer|igshid|igsh|app_id|fbclid|gclid|__tn__|_rdr)$/i;

/** Trim stray whitespace/encoded newlines share widgets tack on, drop tracking params. */
function cleanUrl(raw: string): string {
  const s = raw.trim().replace(/(?:%0[ad]|%20|\s)+$/gi, "");
  try {
    const u = new URL(s);
    for (const k of [...u.searchParams.keys()]) {
      if (TRACKING_PARAM.test(k)) u.searchParams.delete(k);
    }
    u.search = u.searchParams.toString() ? `?${u.searchParams}` : "";
    return u.toString();
  } catch {
    return s;
  }
}

/**
 * Pull a canonical video/post URL out of whatever the user pasted: a bare link,
 * an `<iframe>` embed, or one of the JS-SDK snippets that Facebook / Instagram /
 * TikTok / X / Reddit / Telegram / Pinterest hand out — there the real URL lives
 * in a `data-*` attribute, a `cite`, or a plain `<a href>` inside a `<blockquote>`.
 */
export function extractSourceUrl(raw: string): string {
  const text = (raw ?? "").trim();
  // Fast path: a single bare token is already the URL (or plain text).
  if (!text.includes("<") && !/\s/.test(text)) return text;

  // 1. <iframe src> — a ready-to-use player URL.
  const iframe = iframeSrc(text);
  if (iframe) return cleanUrl(iframe);

  // 2. SDK snippets: canonical URL in a data-* attr or `cite`.
  const attr =
    text.match(/\bdata-instgrm-permalink\s*=\s*["']([^"']+)["']/i)?.[1] ?? // Instagram
    text.match(/\bdata-href\s*=\s*["']([^"']+)["']/i)?.[1] ?? // Facebook
    text.match(/<blockquote\b[^>]*?\bcite\s*=\s*["']([^"']+)["']/i)?.[1] ?? // TikTok
    text.match(/\bdata-embed-src\s*=\s*["']([^"']+)["']/i)?.[1];
  if (attr && /^https?:/i.test(attr)) return cleanUrl(attr);

  // 3. Telegram: data-telegram-post="channel/123"
  const tg = text.match(/\bdata-telegram-post\s*=\s*["']([A-Za-z0-9_]+\/\d+)["']/i)?.[1];
  if (tg) return `https://t.me/${tg}`;

  // 4. <blockquote>/<a> permalinks (Reddit, X, Pinterest): first matching link.
  for (const p of [
    /https?:\/\/(?:www\.)?reddit\.com\/r\/[^\s"'<>]+\/comments\/[a-z0-9]+(?:\/[^\s"'<>?]+)?/i,
    /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]+\/status\/\d+/i,
    /https?:\/\/(?:[a-z]+\.)?pinterest\.[a-z.]+\/[^\s"'<>]+/i,
  ]) {
    const m = text.match(p);
    if (m) return cleanUrl(m[0]);
  }

  return text;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.replace(/^(www\.|m\.)/, "").toLowerCase();
  } catch {
    return null;
  }
}

export function detectSource(rawUrl: string): VideoSource {
  const raw = (rawUrl ?? "").trim();

  const uploadId = parseLocalSource(raw);
  if (uploadId) return { provider: "local", id: uploadId, hasBridge: false };

  const url = extractSourceUrl(raw);
  const host = hostOf(url);
  if (!host) return { provider: "other", hasBridge: false };

  const yt = extractYouTubeId(url);
  if (yt || /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) {
    return {
      provider: "youtube",
      id: yt ?? undefined,
      embedUrl: yt ? `https://www.youtube-nocookie.com/embed/${yt}` : undefined,
      hasBridge: Boolean(yt),
      isVertical: /\/shorts\//i.test(url),
    };
  }

  if (/(^|\.)vimeo\.com$/.test(host)) {
    const m = url.match(/vimeo\.com\/(?:video\/|channels\/[\w-]+\/)?(\d+)(?:\/(\w+))?/);
    const id = m?.[1];
    return {
      provider: "vimeo",
      id,
      embedUrl: id
        ? `https://player.vimeo.com/video/${id}${m?.[2] ? `?h=${m[2]}` : ""}`
        : undefined,
      hasBridge: false,
    };
  }

  if (/(^|\.)dailymotion\.com$/.test(host) || host === "dai.ly") {
    const id =
      url.match(/dailymotion\.com\/(?:embed\/)?video\/([A-Za-z0-9]+)/)?.[1] ??
      url.match(/dai\.ly\/([A-Za-z0-9]+)/)?.[1] ??
      // geo.dailymotion.com/player/<playerId>.html?video=<id>
      url.match(/[?&]video=([A-Za-z0-9]+)/)?.[1];
    return {
      provider: "dailymotion",
      id,
      embedUrl: id ? `https://www.dailymotion.com/embed/video/${id}` : undefined,
      hasBridge: false,
    };
  }

  if (/(^|\.)rumble\.com$/.test(host)) {
    // Only /embed/<id>/ URLs carry the id we can embed; a normal watch URL
    // doesn't, so those fall back to the thumbnail.
    const id = url.match(/rumble\.com\/embed\/([A-Za-z0-9]+)/)?.[1];
    return {
      provider: "rumble",
      id,
      embedUrl: id ? `https://rumble.com/embed/${id}/` : undefined,
      hasBridge: false,
    };
  }

  if (/(^|\.)(facebook\.com|fb\.watch|fb\.com)$/.test(host)) {
    // The video plugin renders any public watch / reel / video / share link.
    const isVertical = /\/(?:reel|reels)\//i.test(url);
    return {
      provider: "facebook",
      embedUrl:
        `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}` +
        `&show_text=false`,
      hasBridge: false,
      isVertical,
    };
  }

  if (/(^|\.)instagram\.com$/.test(host)) {
    const code = url.match(
      /instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/,
    )?.[1];
    return {
      provider: "instagram",
      id: code,
      embedUrl: code ? `https://www.instagram.com/p/${code}/embed/` : undefined,
      hasBridge: false,
      // Reels / IGTV are 9:16; feed posts (/p/) are usually 4:5 portrait. Either
      // way the preview should pillarbox rather than crop.
      isVertical: true,
    };
  }

  if (/(^|\.)tiktok\.com$/.test(host)) {
    const id =
      url.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/)?.[1] ??
      url.match(/tiktok\.com\/(?:v|embed)\/(?:v2\/)?(\d+)/)?.[1];
    return {
      provider: "tiktok",
      id,
      embedUrl: id ? `https://www.tiktok.com/embed/v2/${id}` : undefined,
      hasBridge: false,
      isVertical: true,
    };
  }

  if (/(^|\.)(twitter\.com|x\.com)$/.test(host)) {
    const id = url.match(/(?:twitter|x)\.com\/[A-Za-z0-9_]+\/status\/(\d+)/)?.[1];
    return {
      provider: "twitter",
      id,
      embedUrl: id
        ? `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark&dnt=true`
        : undefined,
      hasBridge: false,
    };
  }

  if (/(^|\.)(reddit\.com|redd\.it)$/.test(host)) {
    const p = url.match(/reddit\.com(\/r\/[^/]+\/comments\/[a-z0-9]+(?:\/[^/?#]+)?)/i)?.[1];
    return {
      provider: "reddit",
      embedUrl: p
        ? `https://www.redditmedia.com${p}/?embed=true&ref_source=embed&theme=dark`
        : undefined,
      hasBridge: false,
    };
  }

  if (host === "t.me" || /(^|\.)telegram\.(org|me)$/.test(host)) {
    const p = url.match(/(?:t\.me|telegram\.(?:org|me))\/(?:s\/)?([A-Za-z0-9_]+\/\d+)/)?.[1];
    return {
      provider: "telegram",
      embedUrl: p ? `https://t.me/${p}?embed=1&dark=1` : undefined,
      hasBridge: false,
    };
  }

  if (/(^|\.)linkedin\.com$/.test(host)) {
    const id =
      url.match(/urn:li:(?:activity|share|ugcPost):(\d+)/)?.[1] ??
      url.match(/-(?:activity|ugcPost)-(\d+)-/)?.[1];
    return {
      provider: "linkedin",
      id,
      embedUrl: id ? `https://www.linkedin.com/embed/feed/update/urn:li:activity:${id}` : undefined,
      hasBridge: false,
    };
  }

  if (/(^|\.)giphy\.com$/.test(host)) {
    const id =
      url.match(/giphy\.com\/embed\/([A-Za-z0-9]+)/)?.[1] ??
      url.match(/giphy\.com\/(?:gifs|clips|videos|stickers)\/(?:.*-)?([A-Za-z0-9]+)/)?.[1] ??
      url.match(/media\.giphy\.com\/media\/([A-Za-z0-9]+)/)?.[1];
    return {
      provider: "giphy",
      id,
      embedUrl: id ? `https://giphy.com/embed/${id}` : undefined,
      hasBridge: false,
    };
  }

  if (/(^|\.)pinterest\.[a-z.]+$/.test(host) || host === "pin.it") {
    const pin = url.match(/pinterest\.[a-z.]+\/pin\/(?:[^/]+-)?(\d+)/)?.[1];
    return {
      provider: "pinterest",
      id: pin,
      embedUrl: pin ? `https://assets.pinterest.com/ext/embed.html?id=${pin}` : undefined,
      hasBridge: false,
    };
  }

  if (/(^|\.)twitch\.tv$/.test(host)) {
    // Every Twitch embed needs `&parent=<host>` matching the page it runs on;
    // that's unknown here, so the preview appends it at render time.
    const clip =
      url.match(/[?&]clip=([A-Za-z0-9_-]+)/)?.[1] ??
      url.match(/twitch\.tv\/(?:\w+\/)?clip\/([A-Za-z0-9_-]+)/)?.[1] ??
      url.match(/clips\.twitch\.tv\/(?!embed\b)([A-Za-z0-9_-]+)/)?.[1];
    const vod = !clip
      ? // /videos/<id>, legacy /<channel>/v/<id>, and the ?video= player param
        (url.match(/twitch\.tv\/(?:[A-Za-z0-9_]+\/)?(?:v|videos?)\/(\d+)/i)?.[1] ??
        url.match(/[?&]video=v?(\d+)/)?.[1])
      : undefined;
    const channel =
      !vod && !clip
        ? (url.match(/[?&]channel=([A-Za-z0-9_]+)/)?.[1] ??
          url.match(/twitch\.tv\/([A-Za-z0-9_]+)/)?.[1])
        : undefined;
    // Clips embed from clips.twitch.tv; VODs and live channels from player.twitch.tv.
    const embedUrl = clip
      ? `https://clips.twitch.tv/embed?clip=${clip}&autoplay=false`
      : vod
        ? `https://player.twitch.tv/?video=${vod}&autoplay=false`
        : channel
          ? `https://player.twitch.tv/?channel=${channel}&autoplay=false`
          : undefined;
    return {
      provider: "twitch",
      id: clip ?? vod ?? channel,
      embedUrl,
      hasBridge: false,
    };
  }

  // Unknown host. If it came from a pasted <iframe>, trust that src as the embed
  // (Panda Video, Wistia, iframely, …); a bare unknown URL has no preview.
  const fromIframe = iframeSrc(raw);
  return {
    provider: "other",
    embedUrl: fromIframe && isHttpUrl(fromIframe) ? fromIframe : undefined,
    hasBridge: false,
  };
}

/** Any http(s) URL is worth handing to yt-dlp; `local:<id>` is an uploaded file. */
export function isSupportedSourceUrl(url: string): boolean {
  return parseLocalSource(url) !== null || isHttpUrl(extractSourceUrl(url));
}
