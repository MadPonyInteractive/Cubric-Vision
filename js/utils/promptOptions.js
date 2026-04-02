/**
 * js/utils/promptOptions.js — Domain option lists for Prompt Builder config compounds.
 *
 * Centralises all dropdown option arrays so that MpiCameraConfig, MpiLightingConfig,
 * MpiStyleConfig, and MpiVideoScene compounds share a single source of truth.
 * Mirrors the structure of dev_configs/prompt_options.json but as importable JS data.
 */

'use strict';

// ── Camera ────────────────────────────────────────────────────────────────────

export const CAM_TYPES     = ['None','35mm Film','Medium Format','Digital IMAX','DSLR','Mirrorless','Smartphone','Drone','Polaroid','CCTV','Action Camera'];
export const CAM_LENSES    = ['None','Prime Lens','Zoom Lens','Macro Lens','Fisheye Lens','Ultra-Wide','Telephoto','Anamorphic'];
export const CAM_FOCALS    = ['None','12mm','14mm','24mm','35mm','50mm','85mm','100mm','135mm','200mm','400mm'];
export const CAM_APERTURES = ['None','f/1.2','f/1.4','f/1.8','f/2.8','f/4.0','f/5.6','f/8.0','f/11','f/16','f/22'];
export const CAM_SHUTTERS  = ['None','1/8000s','1/4000s','1/1000s','1/250s','1/60s','1/24s','1/10s','1s','5s','10s','30s'];
export const CAM_ISOS      = ['None','ISO 50','ISO 100','ISO 200','ISO 400','ISO 800','ISO 1600','ISO 3200','ISO 6400','ISO 12800','ISO 25600'];

// ── Shot ──────────────────────────────────────────────────────────────────────

export const SHOT_ANGLES     = ['None','Front Angle (FA)','Low Angle (LA)','High Angle (HA)','Side Angle (SA)','Rear Angle (RA)',"Overhead/Bird's Eye (OH)",'Over The Shoulder (OTS)','Point of View (POV)','Dutch Angle'];
export const SHOT_SIZES      = ['None','Extreme Close-Up (ECU)','Close-Up (CU)','Medium Close-Up (MCU)','Medium Shot (MS)','Cowboy Shot (CS)','Medium Full Shot (MFS)','Wide Shot (WS)','Extreme Wide Shot (EWS)'];
export const SHOT_DEPTHS     = ['None','Shallow Focus','Deep Focus','Rack Focus','Soft Focus','Macro Focus','Infinite Focus'];
export const SHOT_COMPS      = ['None','Rule of Thirds','Center Framed','Leading Lines','Symmetry','Negative Space','Diagonal Method','Golden Ratio','Frame within a Frame'];

// ── Lighting ──────────────────────────────────────────────────────────────────

export const LIGHT_TYPES       = ['None','Natural Light','Studio Lighting','Cinematic Lighting','Dark/Muddy','High Key','Low Key','Neon','Bioluminescent','Firelight','Bounced Light'];
export const LIGHT_COLORS      = ['None','Warm/Golden','Cool/Blue','Neutral/White','Teal and Orange','Neon Pink/Blue','Monochromatic','Red/Alert','Green/Matrix'];
export const LIGHT_INTENSITIES = ['None','Soft/Diffused','Hard/Harsh','Dappled','Dim','Bright/Overexposed','Flickering','Strobing','Glowing'];
export const LIGHT_DIRS        = ['None','Front Lit','Side Lit','Backlit','Top Lit','Under Lit','Rim Lit','Volumetric/God Rays','Silhouette'];

// ── Color Grading ─────────────────────────────────────────────────────────────

export const COLOR_GRADES     = ['None','Cinematic Teal & Orange','Vintage Film','Bleach Bypass','Black & White','Cyberpunk','Polaroid Muted','Pastel','Neon Synthwave','Gritty/Desaturated','Vibrant/Hyper-Pop'];
export const COLOR_CONTRASTS  = ['None','Low Contrast','Medium Contrast','High Contrast','Heavy Shadows','Faded Blacks'];
export const COLOR_SATS       = ['None','Desaturated','Natural','High Saturation','Oversaturated','Selective Color'];
export const COLOR_SHARPS     = ['None','Ultra Sharp','Soft','Dreamy','Motion Blurred','Film Grain Heavy','Lens Distortion/Aberration'];

// ── Video Scene movements & speeds ───────────────────────────────────────────

export const VIDEO_MOVEMENTS = ['None','Static','Dolly In','Dolly Out','Pan Left','Pan Right','Handheld','Tilt Up','Tilt Down','Tracking (TRK)','Crane','Zoom In','Zoom Out','Rack Focus','Shaky Camera'];
export const VIDEO_SPEEDS    = ['None','Normal Time','Slow Motion 60fps','Slow Motion 120fps','Speed Ramp Up','Speed Ramp Down','Time-lapse','Stop Motion'];
