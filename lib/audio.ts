/**
 * Audio utility for playing game sounds
 * Provides a reusable way to play audio files with proper cleanup
 */

class AudioManager {
  private audioInstances: Map<string, HTMLAudioElement> = new Map();

  /**
   * Play an audio file
   * @param path - Path to the audio file (relative to public folder)
   * @param options - Optional playback options
   */
  async play(path: string, options?: { volume?: number; loop?: boolean }): Promise<void> {
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
  }

  /**
   * Stop all audio
   */
  stopAll() {
    this.audioInstances.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
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
export const playBoardFill = () => audioManager.play('/jeopardy/jeopardy-board-fill.mp3');

