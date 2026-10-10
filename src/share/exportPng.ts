import { toPng } from 'html-to-image';

// html-to-image can't read Google's cross-origin stylesheet, so without this the PNG
// silently falls back to system fonts. We fetch the CSS ourselves, keep only the
// subsets we use, and inline every font file as a data URL.
const TEXT_FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Lilita+One&family=Nunito:wght@700;800;900&display=block';
const KEEP_SUBSETS = new Set(['latin', 'latin-ext']); // latin-ext has ₦ and ₵

// Flags need Noto on Windows; `text=` asks Google for just those glyphs (a few KB)
const emojiCssUrl = (text: string) =>
  `https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=block&text=${encodeURIComponent(text)}`;

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const inlineUrls = async (css: string): Promise<string> => {
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
  const inlined = await Promise.all(
    urls.map(async (url) => [url, await toDataUrl(await (await fetch(url)).blob())] as const),
  );
  return inlined.reduce((out, [url, data]) => out.split(url).join(data), css);
};

const fetchTextFontCss = async (): Promise<string> => {
  const css = await (await fetch(TEXT_FONTS_CSS)).text();
  // Google groups rules as "/* subset */ @font-face {...}"
  const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)]
    .filter((m) => KEEP_SUBSETS.has(m[1]))
    .map((m) => m[2]);
  return inlineUrls(blocks.join('\n'));
};

let textFontCss: Promise<string> | null = null;
const emojiFontCss = new Map<string, Promise<string>>();

const cached = (p: Promise<string>, onFail: () => void) =>
  p.catch((err) => {
    console.warn('Share card font embed failed, PNG may use fallback fonts', err);
    onFail();
    return '';
  });

const getFontEmbedCss = async (emojiText: string): Promise<string> => {
  textFontCss ??= cached(fetchTextFontCss(), () => (textFontCss = null));
  if (!emojiFontCss.has(emojiText)) {
    emojiFontCss.set(
      emojiText,
      cached(
        fetch(emojiCssUrl(emojiText)).then((r) => r.text()).then(inlineUrls),
        () => emojiFontCss.delete(emojiText),
      ),
    );
  }
  const [text, emoji] = await Promise.all([textFontCss, emojiFontCss.get(emojiText)!]);
  return `${text}\n${emoji}`;
};

// Layout must also use the real fonts, or text wraps differently than in the PNG
const waitForFonts = async () => {
  await Promise.allSettled([
    document.fonts.load('400 100px "Lilita One"'),
    document.fonts.load('900 60px "Nunito"'),
    document.fonts.load('800 40px "Nunito"'),
  ]);
  await document.fonts.ready;
};

const waitForImages = (node: HTMLElement) =>
  Promise.all(
    [...node.querySelectorAll('img')].map((img) =>
      img.complete ? Promise.resolve() : img.decode().catch(() => undefined),
    ),
  );

// Sample a tiny copy; a blank/transparent render is uniform
const looksBlank = async (dataUrl: string): Promise<boolean> => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 24;
  canvas.height = 24;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, 24, 24);
  const px = ctx.getImageData(0, 0, 24, 24).data;
  const first = px.slice(0, 4).join();
  for (let i = 4; i < px.length; i += 4) {
    if (px.slice(i, i + 4).join() !== first) return false;
  }
  return true;
};

export interface RenderOptions {
  width: number;
  height: number;
  emojiText: string; // flag/emoji glyphs to fetch from Noto
}

export const renderNodeToPng = async (node: HTMLElement, { width, height, emojiText }: RenderOptions): Promise<string> => {
  await waitForFonts();
  await waitForImages(node);
  const fontEmbedCSS = await getFontEmbedCss(emojiText);
  const options = {
    width,
    height,
    canvasWidth: width,
    canvasHeight: height,
    pixelRatio: 1, // exact 1080px output regardless of device DPR
    cacheBust: true,
    fontEmbedCSS: fontEmbedCSS || undefined,
  };

  // Mobile WebKit/Chrome sometimes paint the first pass before fonts/images settle
  let dataUrl = await toPng(node, options);
  for (let attempt = 0; attempt < 2 && (await looksBlank(dataUrl)); attempt++) {
    dataUrl = await toPng(node, options);
  }
  return dataUrl;
};

export const dataUrlToFile = async (dataUrl: string, name: string): Promise<File> => {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: 'image/png' });
};
