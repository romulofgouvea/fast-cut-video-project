import { describe, expect, it } from "vitest";
import { detectSource, extractSourceUrl, isSupportedSourceUrl } from "./videoSource";

describe("detectSource", () => {
  it("YouTube: parses the id, has the time bridge", () => {
    const s = detectSource("https://www.youtube.com/watch?v=LImU-UFZc98&t=10s");
    expect(s.provider).toBe("youtube");
    expect(s.id).toBe("LImU-UFZc98");
    expect(s.hasBridge).toBe(true);
    expect(s.embedUrl).toContain("LImU-UFZc98");
  });

  it("YouTube without a parseable id: no bridge", () => {
    const s = detectSource("https://www.youtube.com/@channel");
    expect(s.provider).toBe("youtube");
    expect(s.hasBridge).toBe(false);
  });

  it("Vimeo: embed url, no bridge", () => {
    const s = detectSource("https://vimeo.com/123456789");
    expect(s.provider).toBe("vimeo");
    expect(s.id).toBe("123456789");
    expect(s.embedUrl).toBe("https://player.vimeo.com/video/123456789");
    expect(s.hasBridge).toBe(false);
  });

  it("Vimeo: keeps the private hash", () => {
    expect(detectSource("https://vimeo.com/123456789/abcdef0123").embedUrl).toBe(
      "https://player.vimeo.com/video/123456789?h=abcdef0123",
    );
  });

  it("Dailymotion: dai.ly short link and full url", () => {
    expect(detectSource("https://dai.ly/x8abcde").id).toBe("x8abcde");
    expect(detectSource("https://www.dailymotion.com/video/x8abcde").embedUrl).toBe(
      "https://www.dailymotion.com/embed/video/x8abcde",
    );
  });

  it("Rumble: only /embed/ urls carry an id", () => {
    expect(detectSource("https://rumble.com/embed/v6abcd/").embedUrl).toBe(
      "https://rumble.com/embed/v6abcd/",
    );
    const watch = detectSource("https://rumble.com/v6abcd-some-title.html");
    expect(watch.provider).toBe("rumble");
    expect(watch.embedUrl).toBeUndefined();
  });

  it("unwraps a pasted <iframe> embed snippet", () => {
    const rumble = detectSource(
      '<iframe class="rumble" width="640" height="360" src="https://rumble.com/embed/v7clzws/?pub=4" frameborder="0" allowfullscreen></iframe>',
    );
    expect(rumble.provider).toBe("rumble");
    expect(rumble.id).toBe("v7clzws");
    expect(rumble.embedUrl).toBe("https://rumble.com/embed/v7clzws/");

    // trailing encoded newline some widgets add
    expect(
      detectSource('<iframe src="https://rumble.com/embed/vqjjnj/%0A"></iframe>').embedUrl,
    ).toBe("https://rumble.com/embed/vqjjnj/");

    const vimeo = detectSource(
      '<div style="padding-bottom:56%"><iframe src="https://player.vimeo.com/video/783455878?app_id=122963" allowfullscreen></iframe></div>',
    );
    expect(vimeo.provider).toBe("vimeo");
    expect(vimeo.id).toBe("783455878");
    expect(vimeo.embedUrl).toBe("https://player.vimeo.com/video/783455878");
  });

  it("Facebook: SDK <div data-href> → video plugin embed", () => {
    const s = detectSource(
      '<div class="fb-video" data-href="https://www.facebook.com/watch/?v=835321340249928" data-app-id="887"></div>',
    );
    expect(s.provider).toBe("facebook");
    expect(s.embedUrl).toContain("plugins/video.php");
    expect(s.embedUrl).toContain(
      encodeURIComponent("https://www.facebook.com/watch/?v=835321340249928"),
    );
  });

  it("Instagram: blockquote permalink → /embed/", () => {
    const s = detectSource(
      '<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/CaUsPbUquKV/?utm_source=ig_embed&utm_campaign=loading" data-instgrm-version="14"></blockquote>',
    );
    expect(s.provider).toBe("instagram");
    expect(s.id).toBe("CaUsPbUquKV");
    expect(s.embedUrl).toBe("https://www.instagram.com/p/CaUsPbUquKV/embed/");
  });

  it("TikTok: blockquote cite → embed/v2", () => {
    const s = detectSource(
      '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@zachking/video/6749520869598481669" data-video-id="6749520869598481669"></blockquote>',
    );
    expect(s.provider).toBe("tiktok");
    expect(s.id).toBe("6749520869598481669");
    expect(s.embedUrl).toBe("https://www.tiktok.com/embed/v2/6749520869598481669");
  });

  it("X / Twitter: blockquote status link → Tweet.html", () => {
    const s = detectSource(
      '<blockquote class="twitter-tweet"><p>hi</p>&mdash; Reza (@Reza_Zadeh) <a href="https://x.com/Reza_Zadeh/status/1344009123004747778?ref_src=twsrc%5Etfw">Dec 29, 2020</a></blockquote>',
    );
    expect(s.provider).toBe("twitter");
    expect(s.id).toBe("1344009123004747778");
    expect(s.embedUrl).toContain("id=1344009123004747778");
  });

  it("Reddit: blockquote permalink → redditmedia embed", () => {
    const s = detectSource(
      '<blockquote class="reddit-embed-bq"><a href="https://www.reddit.com/r/dataisbeautiful/comments/uul3kh/oc_travel_durations/">t</a> by <a href="https://www.reddit.com/user/x/">u/x</a></blockquote>',
    );
    expect(s.provider).toBe("reddit");
    expect(s.embedUrl).toBe(
      "https://www.redditmedia.com/r/dataisbeautiful/comments/uul3kh/oc_travel_durations/?embed=true&ref_source=embed&theme=dark",
    );
  });

  it("Telegram: data-telegram-post → t.me embed", () => {
    const s = detectSource(
      '<script src="https://telegram.org/js/telegram-widget.js?4" data-telegram-post="telegram/249" data-width="100%"></script>',
    );
    expect(s.provider).toBe("telegram");
    expect(s.embedUrl).toBe("https://t.me/telegram/249?embed=1&dark=1");
  });

  it("LinkedIn: iframe embed src → clean activity embed", () => {
    const s = detectSource(
      '<iframe src="https://www.linkedin.com/embed/feed/update/urn:li:activity:6294210203005124608?compact=true" allowfullscreen></iframe>',
    );
    expect(s.provider).toBe("linkedin");
    expect(s.id).toBe("6294210203005124608");
    expect(s.embedUrl).toBe(
      "https://www.linkedin.com/embed/feed/update/urn:li:activity:6294210203005124608",
    );
  });

  it("Giphy: iframe embed src", () => {
    expect(
      detectSource(
        '<iframe src="https://giphy.com/embed/R6gvnAxj2ISzJdbA63" allowfullscreen></iframe>',
      ).embedUrl,
    ).toBe("https://giphy.com/embed/R6gvnAxj2ISzJdbA63");
  });

  it("Twitch: iframe with foreign parent= → keeps the id, drops parent", () => {
    const s = detectSource(
      '<iframe src="https://player.twitch.tv/?video=992175865&autoplay=false&parent=iframely.com&parent=if-cdn.com"></iframe>',
    );
    expect(s.provider).toBe("twitch");
    expect(s.id).toBe("992175865");
    expect(s.embedUrl).toBe("https://player.twitch.tv/?video=992175865&autoplay=false");
  });

  it("Pinterest: a pin embeds, a board doesn't", () => {
    expect(detectSource("https://www.pinterest.com/pin/1234567890/").embedUrl).toBe(
      "https://assets.pinterest.com/ext/embed.html?id=1234567890",
    );
    const board = detectSource(
      '<a data-pin-do="embedBoard" href="https://www.pinterest.com/user/beautiful-nature/"></a>',
    );
    expect(board.provider).toBe("pinterest");
    expect(board.embedUrl).toBeUndefined();
  });

  it("bare links (no snippet) resolve the same", () => {
    expect(detectSource("https://www.instagram.com/reel/CaUsPbUquKV/").id).toBe("CaUsPbUquKV");
    expect(detectSource("https://www.tiktok.com/@x/video/123").id).toBe("123");
    expect(detectSource("https://twitter.com/x/status/999").embedUrl).toContain("id=999");
  });

  it("unknown host: other, no bridge", () => {
    const s = detectSource("https://example.com/video/42");
    expect(s.provider).toBe("other");
    expect(s.hasBridge).toBe(false);
    expect(s.embedUrl).toBeUndefined();
  });

  it("pasted <iframe> from an unrecognised provider: previews the src as-is", () => {
    for (const src of [
      "https://player-vz-abc123.tv.pandavideo.com.br/embed/?v=ee1c9a1e-uuid",
      "https://fast.wistia.net/embed/iframe/abc123xyz",
      "https://iframely.net/9V8q0Lo?theme=dark",
    ]) {
      const s = detectSource(`<iframe src="${src}" allowfullscreen></iframe>`);
      expect(s.provider).toBe("other");
      expect(s.embedUrl).toBe(src);
      expect(s.hasBridge).toBe(false);
    }
  });
});

describe("isSupportedSourceUrl", () => {
  it("accepts http(s), rejects junk", () => {
    expect(isSupportedSourceUrl("https://vimeo.com/1")).toBe(true);
    expect(isSupportedSourceUrl("http://x.tv/1")).toBe(true);
    expect(isSupportedSourceUrl("not a url")).toBe(false);
    expect(isSupportedSourceUrl("ftp://x/1")).toBe(false);
  });

  it("accepts a pasted embed snippet", () => {
    expect(
      isSupportedSourceUrl('<iframe src="https://player.vimeo.com/video/403530213"></iframe>'),
    ).toBe(true);
    expect(
      isSupportedSourceUrl(
        '<blockquote class="tiktok-embed" cite="https://www.tiktok.com/@x/video/1"></blockquote>',
      ),
    ).toBe(true);
  });
});

describe("extractSourceUrl", () => {
  it("pulls the canonical url out of a snippet, leaves plain input alone", () => {
    expect(
      extractSourceUrl('  <iframe src="https://rumble.com/embed/v7clzws/?pub=4"></iframe> '),
    ).toBe("https://rumble.com/embed/v7clzws/?pub=4");
    expect(extractSourceUrl('<div data-href="https://www.facebook.com/watch/?v=42"></div>')).toBe(
      "https://www.facebook.com/watch/?v=42",
    );
    expect(extractSourceUrl("  https://vimeo.com/123  ")).toBe("https://vimeo.com/123");
    expect(extractSourceUrl("<not-a-known-snippet>")).toBe("<not-a-known-snippet>");
  });
});
