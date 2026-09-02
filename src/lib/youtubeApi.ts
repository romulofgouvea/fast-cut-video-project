/** Load https://www.youtube.com/iframe_api once and resolve with window.YT. */
let promise: Promise<YTNamespace> | undefined;

export function loadYouTubeApi(): Promise<YTNamespace> {
  if (promise) return promise;

  promise = new Promise<YTNamespace>((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT as YTNamespace);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });

  return promise;
}
