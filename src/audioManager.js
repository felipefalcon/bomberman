export class AudioManager {
  constructor() {
    this.audio = null;
    this.isReady = false;
    this.shouldPlay = false;
    this.soundEffects = {};
    this.soundPools = {}; // Pool de sons para evitar delay
    this.muted = true; // Start the game muted by default
  }

  async loadMusic(url) {
    this.audio = new Audio(url);
    this.audio.loop = true;
    this.audio.volume = 0.3; // 30% volume to not be too loud
    this.isReady = true;
    
    // Wait for user interaction to play (browsers block autoplay)
    if (!this.hasUserInteracted()) {
      this.shouldPlay = true;
      this._setupUserInteractionListener();
    } else {
      this.play();
    }
  }

  async loadSoundEffect(name, url) {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      audio.volume = 0.7; // Sound effects a bit louder than music
      
      // Resolve when audio is ready to play
      const onCanPlay = () => {
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('error', onError);
        this.soundEffects[name] = audio;
        
        // Create a pool of 5 copies for instant playback
        this.soundPools[name] = [];
        for (let i = 0; i < 5; i++) {
          const poolAudio = new Audio(url);
          poolAudio.volume = 0.7;
          this.soundPools[name].push({
            audio: poolAudio,
            isPlaying: false
          });
        }
        
        resolve();
      };
      
      const onError = () => {
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('error', onError);
        reject(new Error(`Failed to load sound: ${url}`));
      };
      
      audio.addEventListener('canplay', onCanPlay);
      audio.addEventListener('error', onError);
      audio.src = url;
    });
  }

  playSoundEffect(name) {
    if (this.muted || !this.soundPools[name] || this.soundPools[name].length === 0) return;
    
    // Find an available sound in the pool
    let availableSound = this.soundPools[name].find(s => !s.isPlaying && s.audio.paused);
    
    // If no available sound, use the first one
    if (!availableSound) {
      availableSound = this.soundPools[name][0];
    }
    
    if (availableSound) {
      const audio = availableSound.audio;
      audio.currentTime = 0;
      availableSound.isPlaying = true;
      
      audio.play().catch(err => {
        console.warn(`Could not play sound effect "${name}":`, err);
      });
      
      // Mark as finished after duration
      audio.onended = () => {
        availableSound.isPlaying = false;
      };
    }
  }

  setMuted(value) {
    this.muted = value;
    if (this.muted && this.audio && !this.audio.paused) {
      this.audio.pause();
    } else if (!this.muted && this.audio && this.audio.paused) {
      this.audio.play().catch(err => {
        console.warn('Could not resume audio:', err);
      });
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
  }

  _setupUserInteractionListener() {
    const playOnInteraction = () => {
      if (this.shouldPlay && this.isReady) {
        this.play();
        this.shouldPlay = false;
      }
      // Remove listeners after first interaction
      document.removeEventListener('click', playOnInteraction);
      document.removeEventListener('keydown', playOnInteraction);
      document.removeEventListener('touchstart', playOnInteraction);
    };

    document.addEventListener('click', playOnInteraction, { once: true });
    document.addEventListener('keydown', playOnInteraction, { once: true });
    document.addEventListener('touchstart', playOnInteraction, { once: true });
  }

  hasUserInteracted() {
    // Check if user has already interacted
    return window._userHasInteracted === true;
  }

  play() {
    if (this.audio && this.isReady && !this.muted) {
      window._userHasInteracted = true;
      this.audio.play().catch(err => {
        console.warn('Could not play audio:', err);
      });
    }
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
  }

  setVolume(volume) {
    if (this.audio) {
      this.audio.volume = Math.max(0, Math.min(1, volume));
    }
  }
}


