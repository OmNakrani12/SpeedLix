// Lightweight Web Audio API synthesizer for speed alerts
// No external audio files or dependencies needed

let audioCtx = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playAlertChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    // Create oscillator for tone 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now); // A5
    osc1.frequency.exponentialRampToValueAtTime(1046.5, now + 0.15); // C6

    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.25);

    // Beep 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();

    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1318.5, now + 0.15); // E6
    osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.35); // A6

    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.18, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(now + 0.15);
    osc2.stop(now + 0.45);
  } catch (err) {
    // Audio context may be blocked by autoplay policies until user interacts
  }
}

export function playClickBeep(freq = 600) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  } catch (err) {
    // ignore
  }
}
