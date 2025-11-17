/**
 * Audio utility for playing game sounds
 * Provides a reusable way to play audio files with proper cleanup
 */

class AudioManager {
  private audioInstances: Map<string, HTMLAudioElement> = new Map();
  private fadeIntervals: Map<string, number> = new Map();

  /**
   * Play an audio file
   * @param path - Path to the audio file (relative to public folder)
   * @param options - Optional playback options
   */
  async play(
    path: string,
    options?: { volume?: number; loop?: boolean },
  ): Promise<void> {
    // Create or reuse audio instance
    let audio = this.audioInstances.get(path);
    if (!audio) {
      audio = new Audio(path);
      this.audioInstances.set(path, audio);
    }

    // Set options
    if (options?.volume !== undefined) {
      audio.volume = options.volume;
    }
    if (options?.loop !== undefined) {
      audio.loop = options.loop;
    }

    // Reset and play
    audio.currentTime = 0;
    try {
      await audio.play();
    } catch (error) {
      console.warn(`Failed to play audio ${path}:`, error);
    }
  }

  /**
   * Stop an audio file
   */
  stop(path: string) {
    const audio = this.audioInstances.get(path);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
    // Clear all fade intervals for this path
    const keysToDelete: string[] = [];
    this.fadeIntervals.forEach((intervalId, key) => {
      if (key.startsWith(path)) {
        clearInterval(intervalId);
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => this.fadeIntervals.delete(key));
  }

  /**
   * Play an audio file with looping
   * Simplified version - just loops at constant volume for better audio quality
   * @param path - Path to the audio file
   * @param options - Playback options
   */
  async playLooping(
    path: string,
    options?: { volume?: number },
  ): Promise<void> {
    const volume = options?.volume ?? 1;

    // Stop any existing playback of this audio
    this.stop(path);

    // Create or reuse audio instance
    let audio = this.audioInstances.get(path);
    if (!audio) {
      audio = new Audio(path);
      this.audioInstances.set(path, audio);
    }

    audio.loop = true;
    audio.volume = volume; // Set volume directly - no fade in to avoid garbling

    try {
      await audio.play();
    } catch (error) {
      console.warn(`Failed to play looping audio ${path}:`, error);
    }
  }

  /**
   * Fade out and stop an audio file
   * @param path - Path to the audio file
   * @param fadeDuration - Duration of fade out in milliseconds
   */
  async fadeOut(path: string, fadeDuration: number = 2000): Promise<void> {
    const audio = this.audioInstances.get(path);
    if (!audio || audio.paused) {
      this.stop(path);
      return;
    }

    const startVolume = audio.volume;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const fadeInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / fadeDuration, 1);
        audio.volume = startVolume * (1 - progress);

        if (progress >= 1) {
          clearInterval(fadeInterval);
          this.stop(path);
          resolve();
        }
      }, 16); // ~60fps

      // Store interval so it can be cleared if needed
      this.fadeIntervals.set(
        `${path}_fadeOut`,
        fadeInterval as unknown as number,
      );
    });
  }

  /**
   * Stop all audio
   */
  stopAll() {
    this.audioInstances.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    // Clear all fade intervals
    this.fadeIntervals.forEach((intervalId) => {
      clearInterval(intervalId);
    });
    this.fadeIntervals.clear();
  }

  /**
   * Clean up audio instances
   */
  cleanup() {
    this.stopAll();
    this.audioInstances.clear();
  }
}

// Export singleton instance
export const audioManager = new AudioManager();

// Convenience functions for common sounds
export const playBoardFill = () =>
  audioManager.play('/jeopardy/jeopardy-board-fill.mp3');
export const playIntroMusic = () =>
  audioManager.playLooping('/jeopardy/jeopardy-intro-full.ogg', {
    volume: 0.6,
  });
export const stopIntroMusic = () =>
  audioManager.stop('/jeopardy/jeopardy-intro-full.ogg');
export const fadeOutIntroMusic = (duration?: number) =>
  audioManager.fadeOut('/jeopardy/jeopardy-intro-full.ogg', duration);
export const playTimesUp = () =>
  audioManager.play('/jeopardy/jeopardy-times-up.mp3');
export const playThinkMusic = () =>
  audioManager.play('/jeopardy/jeopardy-think.mp3');
export const stopThinkMusic = () =>
  audioManager.stop('/jeopardy/jeopardy-think.mp3');
