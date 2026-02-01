# Test Audio Files for Screenshots

This directory should contain sample audio files used for automated screenshot generation.

## Required Files

- `sample.wav` — A short (5-10 second) speech sample with clear vowels and consonants

## Creating Sample Audio

You can create sample audio files in several ways:

### Option 1: Use Praat

```praat
# Create a simple synthesized vowel
Create Sound from formula: "sample", 1, 0, 1, 44100, "1/2 * sin(2*pi*220*x)"
Save as WAV file: "sample.wav"
```

### Option 2: Record in ozen-web

1. Open ozen-web in a browser
2. Click the microphone icon
3. Record a few seconds of speech (e.g., "Hello world, this is a test")
4. Export the audio as WAV
5. Save as `sample.wav` in this directory

### Option 3: Download Sample Audio

You can use any short speech sample (WAV format, mono or stereo, 16kHz-48kHz):

```bash
# Example: Download a sample from a public dataset
wget https://example.com/sample-audio.wav -O sample.wav
```

## File Specifications

**Recommended:**

- Format: WAV (16-bit PCM)
- Duration: 5-15 seconds
- Sample rate: 44.1kHz or 48kHz
- Channels: Mono or stereo
- Content: Clear speech with vowels and consonants

**Why?**

- Screenshots need to show interesting acoustic features
- Vowels display clear formant patterns
- Consonants show different spectral characteristics
- Short duration keeps screenshot generation fast

## Notes

- Keep files small (<5MB) for faster CI/CD
- Ensure audio has some variation (not silence)
- Test audio should represent typical use cases

## Generating Screenshots

Once you have `sample.wav` in place:

```bash
cd scripts/screenshots
npm install
npm run capture:dev  # For local dev server
# or
npm run capture:prod # For production build
```

Screenshots will be saved to `docs/screenshots/`.
