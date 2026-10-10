import rawAudio from '../data/audio.json';

interface Track {
  src: string;
  title: string;
  credit: string;
}

export const TRACKS = (rawAudio as { music: Track[] }).music;

const VOLUME = 0.35;

// Streams tracks from /public/audio on demand (preload="none", nothing fetched until
// play()). Missing or broken files are skipped; if every track fails, music stays off.
class MusicPlayer {
  private audio: HTMLAudioElement | null = null;
  private index = 0;
  private failed = new Set<number>();
  private wanted = false;
  muted = false;

  private element() {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.preload = 'none';
      this.audio.volume = VOLUME;
      this.audio.addEventListener('ended', () => this.next());
      this.audio.addEventListener('error', () => {
        this.failed.add(this.index);
        this.next();
      });
    }
    return this.audio;
  }

  private next() {
    if (this.failed.size >= TRACKS.length) return;
    do this.index = (this.index + 1) % TRACKS.length;
    while (this.failed.has(this.index));
    this.load();
  }

  private load() {
    const audio = this.element();
    audio.src = TRACKS[this.index].src;
    if (this.wanted && !this.muted) audio.play().catch(() => {});
  }

  // Call from a user gesture (autoplay policy)
  play() {
    this.wanted = true;
    if (this.muted || !TRACKS.length || this.failed.size >= TRACKS.length) return;
    const audio = this.element();
    if (!audio.src) this.load();
    else audio.play().catch(() => {});
  }

  pause() {
    this.audio?.pause();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.pause();
    else if (this.wanted) this.play();
  }
}

export const music = new MusicPlayer();
