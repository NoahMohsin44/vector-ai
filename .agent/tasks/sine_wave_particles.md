# Task: Add Particle Sine Wave Animation to Login Page

## Implementation Details
- Created a new component `SineWaveParticles.tsx` in `src/components/`.
- Implemented a particle system using HTML5 Canvas.
- Particles are generated as small dots ("dust") with random sizes and opacity.
- Particles are assigned to one of several sine waves.
- Each particle's Y position follows its assigned sine wave function: `y = center + sin(x * freq + phase) * amp + noise`.
- Added motion:
    - Waves shift phase over time.
    - Particles drift horizontally.
- Added visual effects:
    - Particles have a `shadowBlur` to create a "slight glow".
    - `offsetY` noise makes the sine wave have "width" instead of being a single line.
- Integrated the component into `src/pages/Landing.tsx` as an absolute background layer behind the content.

## Files Modified
- `src/components/SineWaveParticles.tsx` (New)
- `src/pages/Landing.tsx` (Modified)
