import { Application, Sprite, Filter, Texture, RenderTexture, BufferImageSource, GlProgram, UniformGroup } from 'pixi.js';
import { clientLogger } from '../services/clientLogger.js';

// ---------------------------------------------------------------------------
// Inline GLSL sources (adapted from js/utils/shaders/*.frag for PixiJS v8)
// Uniform mapping per docs/shader-sources.md:
//   u_image0      → uTexture (auto-bound by PixiJS v8 filter system)
//   v_texCoord    → vTextureCoord
//   u_resolution  → computed from inputSize.xy
//   fragColor0    → fragColor
// ---------------------------------------------------------------------------

// Pixi v8 default filter vertex shader. ES3 mandated because frags use
// texelFetch/uvec2 (ES3-only). Pixi pairs vert+frag in same compile unit;
// vert must also be ES3 when frag is ES3.
const VERT = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

// Exposure: linear 2^EV multiplier
const EXPOSURE_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uEV;
out vec4 finalColor;
void main() {
    vec4 c = texture(uTexture, vTextureCoord);
    float m = pow(2.0, uEV);
    finalColor = vec4(clamp(c.rgb * m, 0.0, 1.0), c.a);
}`;

// Shadows: lift-only curve (raise dark tones, preserve lights)
const SHADOWS_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uLift;
out vec4 finalColor;
void main() {
    vec4 c = texture(uTexture, vTextureCoord);
    // lift: shifts blacks up without touching whites
    vec3 adj = c.rgb + uLift * (1.0 - c.rgb) * (1.0 - c.rgb);
    finalColor = vec4(clamp(adj, 0.0, 1.0), c.a);
}`;

// Hue/Saturation — from hueSaturation.frag, adapted uniforms
const HUE_SAT_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform int  uMode;        // 0=Master,1=Reds,2=Yellows,3=Greens,4=Cyans,5=Blues,6=Magentas,7=Colorize
uniform int  uColorSpace;  // 0=HSL, 1=HSB/HSV
uniform float uHue;        // -180 to 180
uniform float uSaturation; // -100 to 100
uniform float uLightness;  // -100 to 100
uniform float uOverlap;    // 0 to 100
out vec4 finalColor;

const float EPSILON = 0.0001;

vec3 rgb2hsl(vec3 c) {
    float maxC = max(max(c.r,c.g),c.b);
    float minC = min(min(c.r,c.g),c.b);
    float delta = maxC - minC;
    float h=0.0, s=0.0, l=(maxC+minC)*0.5;
    if (delta > EPSILON) {
        s = l < 0.5 ? delta/(maxC+minC) : delta/(2.0-maxC-minC);
        if (maxC==c.r)       h = (c.g-c.b)/delta + (c.g<c.b?6.0:0.0);
        else if (maxC==c.g)  h = (c.b-c.r)/delta + 2.0;
        else                 h = (c.r-c.g)/delta + 4.0;
        h /= 6.0;
    }
    return vec3(h,s,l);
}
float hue2rgb(float p,float q,float t){
    t=fract(t);
    if(t<1.0/6.0) return p+(q-p)*6.0*t;
    if(t<0.5)     return q;
    if(t<2.0/3.0) return p+(q-p)*(2.0/3.0-t)*6.0;
    return p;
}
vec3 hsl2rgb(vec3 hsl){
    if(hsl.y<EPSILON) return vec3(hsl.z);
    float q=hsl.z<0.5?hsl.z*(1.0+hsl.y):hsl.z+hsl.y-hsl.z*hsl.y;
    float p=2.0*hsl.z-q;
    return vec3(hue2rgb(p,q,hsl.x+1.0/3.0),hue2rgb(p,q,hsl.x),hue2rgb(p,q,hsl.x-1.0/3.0));
}
vec3 rgb2hsb(vec3 c){
    float maxC=max(max(c.r,c.g),c.b);
    float minC=min(min(c.r,c.g),c.b);
    float delta=maxC-minC;
    float h=0.0,s=(maxC>EPSILON)?delta/maxC:0.0,b=maxC;
    if(delta>EPSILON){
        if(maxC==c.r)      h=(c.g-c.b)/delta+(c.g<c.b?6.0:0.0);
        else if(maxC==c.g) h=(c.b-c.r)/delta+2.0;
        else               h=(c.r-c.g)/delta+4.0;
        h/=6.0;
    }
    return vec3(h,s,b);
}
vec3 hsb2rgb(vec3 hsb){
    vec3 rgb=clamp(abs(mod(hsb.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0);
    return hsb.z*mix(vec3(1.0),rgb,hsb.y);
}
float hueDistance(float a,float b){float d=abs(a-b);return min(d,1.0-d);}
float getHueWeight(float hue,float center,float overlap){
    float baseWidth=1.0/6.0;
    float feather=baseWidth*overlap;
    float d=hueDistance(hue,center);
    float inner=baseWidth*0.5;
    float outer=inner+feather;
    return 1.0-smoothstep(inner,outer,d);
}
float getModeWeight(float hue,int mode,float overlap){
    if(mode==0||mode==7) return 1.0;
    if(mode==1) return max(getHueWeight(hue,0.0,overlap),getHueWeight(hue,1.0,overlap));
    return getHueWeight(hue,float(mode-1)/6.0,overlap);
}
float adjSat(float s,float a){return a>0.0?s+(1.0-s)*a:s+s*a;}
float adjLight(float l,float a){return a>0.0?l+(1.0-l)*a:l+l*a;}
float adjBright(float b,float a){return clamp(b+a,0.0,1.0);}

void main(){
    vec4 orig = texture(uTexture,vTextureCoord);
    float hueShift  = uHue/360.0;
    float satAmount = uSaturation/100.0;
    float litAmount = uLightness/100.0;
    float overlap   = uOverlap/100.0;

    if(uMode==7){
        float lum=dot(orig.rgb,vec3(0.299,0.587,0.114));
        float l=adjLight(lum,litAmount);
        vec3 hsl=vec3(fract(hueShift),clamp(satAmount,0.0,1.0),clamp(l,0.0,1.0));
        finalColor=vec4(hsl2rgb(hsl),orig.a);
        return;
    }
    vec3 hsx=(uColorSpace==0)?rgb2hsl(orig.rgb):rgb2hsb(orig.rgb);
    float weight=getModeWeight(hsx.x,uMode,overlap);
    if(uMode!=0&&hsx.y<EPSILON) weight=0.0;
    vec3 result;
    if(weight>EPSILON){
        float h=fract(hsx.x+hueShift*weight);
        float s=clamp(adjSat(hsx.y,satAmount*weight),0.0,1.0);
        float v=(uColorSpace==0)
            ?clamp(adjLight(hsx.z,litAmount*weight),0.0,1.0)
            :clamp(adjBright(hsx.z,litAmount*weight),0.0,1.0);
        result=(uColorSpace==0)?hsl2rgb(vec3(h,s,v)):hsb2rgb(vec3(h,s,v));
    } else {
        result=orig.rgb;
    }
    finalColor=vec4(result,orig.a);
}`;

// Color curves — 4 LUT samplers (RGB master + R,G,B channels)
const COLOR_CURVES_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform sampler2D uCurveRGB;
uniform sampler2D uCurveR;
uniform sampler2D uCurveG;
uniform sampler2D uCurveB;
out vec4 finalColor;

float applyCurve(sampler2D curve, float value){
    value = clamp(value,0.0,1.0);
    float pos = value*255.0;
    int lo = int(floor(pos));
    int hi = min(lo+1,255);
    float f = pos-float(lo);
    float a = texelFetch(curve,ivec2(lo,0),0).r;
    float b = texelFetch(curve,ivec2(hi,0),0).r;
    return a+f*(b-a);
}
void main(){
    vec4 c = texture(uTexture,vTextureCoord);
    float r = applyCurve(uCurveRGB, applyCurve(uCurveR, c.r));
    float g = applyCurve(uCurveRGB, applyCurve(uCurveG, c.g));
    float b = applyCurve(uCurveRGB, applyCurve(uCurveB, c.b));
    finalColor = vec4(r,g,b,c.a);
}`;

// Noise reduction — bilateral blur (single-pass; uses textureSize internally)
const BILATERAL_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uRadius;        // 0–20
uniform float uEdgeThreshold; // 0–100
uniform int   uStep;          // 1 = every pixel, 2+ = skip
out vec4 finalColor;

const int MAX_RADIUS = 20;
const float EPSILON = 0.0001;

float getLuminance(vec3 rgb){ return dot(rgb,vec3(0.299,0.587,0.114)); }

void main(){
    vec2 texelSize = 1.0/vec2(textureSize(uTexture,0));
    float radiusF = clamp(uRadius,0.0,float(MAX_RADIUS));
    int radius = int(radiusF+0.5);
    if(radius==0){ finalColor=texture(uTexture,vTextureCoord); return; }

    float t = clamp(uEdgeThreshold,0.0,100.0)/100.0;
    t *= t;
    float sigmaColor   = mix(0.01,0.5,t);
    float sigmaSpatial = max(radiusF*0.75,0.5);

    float invSpatial2 = -0.5/(sigmaSpatial*sigmaSpatial);
    float invColor2   = -0.5/(sigmaColor*sigmaColor+EPSILON);

    vec4 center = texture(uTexture,vTextureCoord);
    vec3 sumRGB = vec3(0.0);
    float sumWeight = 0.0;
    int step = max(uStep,1);
    float radius2 = float(radius*radius);

    for(int dy=-MAX_RADIUS;dy<=MAX_RADIUS;dy++){
        if(dy<-radius||dy>radius) continue;
        if(abs(dy)%step!=0) continue;
        for(int dx=-MAX_RADIUS;dx<=MAX_RADIUS;dx++){
            if(dx<-radius||dx>radius) continue;
            if(abs(dx)%step!=0) continue;
            vec2 offset=vec2(float(dx),float(dy));
            float dist2=dot(offset,offset);
            if(dist2>radius2) continue;
            vec3 s=texture(uTexture,vTextureCoord+offset*texelSize).rgb;
            float sw=exp(dist2*invSpatial2);
            vec3 diff=s-center.rgb;
            float cd=dot(diff*diff,vec3(0.299,0.587,0.114));
            float cw=exp(cd*invColor2);
            float w=sw*cw;
            sumRGB+=s*w;
            sumWeight+=w;
        }
    }
    finalColor=vec4(sumRGB/max(sumWeight,EPSILON),center.a);
}`;

// Unsharp mask — from unsharpMask.frag, adapted uniforms
const UNSHARP_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float uAmount;    // 0.0–3.0
uniform float uRadius;    // 0.5–10.0
uniform float uThreshold; // 0.0–0.1
out vec4 finalColor;

float gaussian(float x,float sigma){ return exp(-(x*x)/(2.0*sigma*sigma)); }
float getLuminance(vec3 c){ return dot(c,vec3(0.2126,0.7152,0.0722)); }

void main(){
    vec2 texel = 1.0/uInputSize.xy;
    float radius = max(uRadius,0.5);
    float sigma = radius/2.0;
    int samples = int(ceil(radius));
    vec4 orig = texture(uTexture,vTextureCoord);
    vec4 blurred = vec4(0.0);
    float totalWeight = 0.0;
    for(int x=-samples;x<=samples;x++){
        for(int y=-samples;y<=samples;y++){
            vec2 off = vec2(float(x),float(y))*texel;
            vec4 s = texture(uTexture,vTextureCoord+off);
            float dist = length(vec2(float(x),float(y)));
            float w = gaussian(dist,sigma);
            blurred += s*w;
            totalWeight += w;
        }
    }
    blurred /= totalWeight;
    vec3 mask = orig.rgb-blurred.rgb;
    float lumaDelta = abs(getLuminance(orig.rgb)-getLuminance(blurred.rgb));
    float tScale = smoothstep(0.0,uThreshold,lumaDelta);
    mask *= tScale;
    finalColor = vec4(clamp(orig.rgb+mask*uAmount,0.0,1.0),orig.a);
}`;

// Dehaze — Dark Channel Prior (single-pass approximation)
// Dark channel patch size ~15×15. Atmospheric light estimated from top-right
// bright region (avoid sky bias). Negative strength adds haze.
// Quality caveat: sky / white regions weaker than Adobe ML-refined version.
const DEHAZE_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform float uStrength;   // -1.0 to 1.0  (negative = add haze)
uniform float uOmega;      // 0.0 to 1.0   (default 0.95)
uniform float uT0;         // 0.0 to 0.5   (min transmission, default 0.1)
out vec4 finalColor;

void main(){
    if(abs(uStrength) < 0.001){ finalColor = texture(uTexture, vTextureCoord); return; }

    vec2 texSize = vec2(textureSize(uTexture, 0));
    vec2 texel   = 1.0 / texSize;
    int  patchR  = 7;  // 15×15 patch (radius 7)

    // --- Dark channel of pixel neighbourhood ---
    float darkMin = 1.0;
    for(int dy = -7; dy <= 7; dy++){
        for(int dx = -7; dx <= 7; dx++){
            vec3 s = texture(uTexture, vTextureCoord + vec2(float(dx), float(dy)) * texel).rgb;
            darkMin = min(darkMin, min(s.r, min(s.g, s.b)));
        }
    }

    // --- Atmospheric light: sample a 32×32 bright patch in top-right quadrant ---
    // (heuristic: avoids centering on subject, decent for landscapes + AI art)
    vec2 atmoBase = vec2(0.75, 0.0);
    float atmoStep = 1.0 / 32.0;
    vec3 A = vec3(0.0);
    float bestDark = -1.0;
    for(int ay = 0; ay < 4; ay++){
        for(int ax = 0; ax < 4; ax++){
            vec2 uv = atmoBase + vec2(float(ax), float(ay)) * atmoStep * 8.0;
            uv = clamp(uv, vec2(0.0), vec2(1.0));
            // compute tiny dark channel at this sample
            float d = 1.0;
            for(int sy = -3; sy <= 3; sy++){
                for(int sx = -3; sx <= 3; sx++){
                    vec3 s = texture(uTexture, uv + vec2(float(sx), float(sy)) * texel).rgb;
                    d = min(d, min(s.r, min(s.g, s.b)));
                }
            }
            if(d > bestDark){
                bestDark = d;
                A = texture(uTexture, uv).rgb;
            }
        }
    }
    A = max(A, vec3(0.001));

    // --- Transmission ---
    float omega  = clamp(uOmega, 0.0, 1.0);
    float t0     = clamp(uT0,    0.0, 0.5);
    float t      = 1.0 - omega * (darkMin / max(A.r, max(A.g, A.b)));
    t = clamp(t, t0, 1.0);

    vec4  orig = texture(uTexture, vTextureCoord);
    float str  = clamp(uStrength, -1.0, 1.0);

    vec3  recovered;
    if(str >= 0.0){
        // dehaze: recover scene radiance J = (I - A) / t + A, blend by strength
        vec3 J = (orig.rgb - A) / t + A;
        recovered = mix(orig.rgb, clamp(J, 0.0, 1.0), str);
    } else {
        // add haze: blend toward atmospheric light
        recovered = mix(orig.rgb, A, -str * (1.0 - t));
    }

    finalColor = vec4(recovered, orig.a);
}`;

// Film grain — from filmGrain.frag, adapted uniforms
const FILM_GRAIN_FRAG = `#version 300 es
precision highp float;
in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float uAmount;       // 0.0–1.0
uniform float uSize;         // 0.3–3.0
uniform float uColor;        // 0.0–1.0
uniform float uLumBias;      // 0.0–1.0
uniform int   uMode;         // 0=smooth, 1=grainy
out vec4 finalColor;

uint pcg(uint v){
    uint state=v*747796405u+2891336453u;
    uint word=((state>>((state>>28u)+4u))^state)*277803737u;
    return (word>>22u)^word;
}
uint hash2d(uvec2 p){ return pcg(p.x+pcg(p.y)); }
float hashf(uvec2 p){ return float(hash2d(p))/float(0xffffffffu); }
float hashf(uvec2 p,uint o){ return float(pcg(hash2d(p)+o))/float(0xffffffffu); }
float toGaussian(uvec2 p){
    return (hashf(p,0u)+hashf(p,1u)+hashf(p,2u)+hashf(p,3u)-2.0)*0.7;
}
float toGaussian(uvec2 p,uint o){
    return (hashf(p,o)+hashf(p,o+1u)+hashf(p,o+2u)+hashf(p,o+3u)-2.0)*0.7;
}
float smoothNoise(vec2 p){
    vec2 i=floor(p); vec2 f=fract(p);
    f=f*f*f*(f*(f*6.0-15.0)+10.0);
    uvec2 ui=uvec2(i);
    return mix(mix(toGaussian(ui),toGaussian(ui+uvec2(1u,0u)),f.x),
               mix(toGaussian(ui+uvec2(0u,1u)),toGaussian(ui+uvec2(1u,1u)),f.x),f.y);
}
float smoothNoise(vec2 p,uint o){
    vec2 i=floor(p); vec2 f=fract(p);
    f=f*f*f*(f*(f*6.0-15.0)+10.0);
    uvec2 ui=uvec2(i);
    return mix(mix(toGaussian(ui,o),toGaussian(ui+uvec2(1u,0u),o),f.x),
               mix(toGaussian(ui+uvec2(0u,1u),o),toGaussian(ui+uvec2(1u,1u),o),f.x),f.y);
}
void main(){
    vec4 color=texture(uTexture,vTextureCoord);
    float luma=dot(color.rgb,vec3(0.2126,0.7152,0.0722));
    vec2 grainUV=vTextureCoord*uInputSize.xy/max(uSize,0.01);
    uvec2 grainPixel=uvec2(grainUV);
    float g; vec3 grainRGB;
    if(uMode==1){
        g=toGaussian(grainPixel);
        grainRGB=vec3(toGaussian(grainPixel,100u),toGaussian(grainPixel,200u),toGaussian(grainPixel,300u));
    } else {
        g=smoothNoise(grainUV);
        grainRGB=vec3(smoothNoise(grainUV,100u),smoothNoise(grainUV,200u),smoothNoise(grainUV,300u));
    }
    float lumWeight=mix(1.0,1.0-luma,clamp(uLumBias,0.0,1.0));
    float strength=uAmount*0.15;
    vec3 grainColor=mix(vec3(g),grainRGB,clamp(uColor,0.0,1.0));
    color.rgb+=grainColor*strength*lumWeight;
    finalColor=vec4(clamp(color.rgb,0.0,1.0),color.a);
}`;

// ---------------------------------------------------------------------------
// Identity LUT (256×1, linear 0→1) used when curve is at default
// ---------------------------------------------------------------------------
function makeIdentityLUT() {
    const data = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
        data[i * 4] = i;
        data[i * 4 + 1] = i;
        data[i * 4 + 2] = i;
        data[i * 4 + 3] = 255;
    }
    return data;
}

// Float32Array LUT (256 entries, 0→1) → PixiJS Texture
function lutToTexture(app, lut) {
    const data = new Uint8Array(256 * 4);
    for (let i = 0; i < 256; i++) {
        const v = lut ? Math.round(lut[i] * 255) : i;
        data[i * 4] = v;
        data[i * 4 + 1] = v;
        data[i * 4 + 2] = v;
        data[i * 4 + 3] = 255;
    }
    return new Texture({
        source: new BufferImageSource({ resource: data, width: 256, height: 1, format: 'rgba8unorm' }),
    });
}

// ---------------------------------------------------------------------------
// Stage index constants — order matches filter chain
// ---------------------------------------------------------------------------
const STAGE_DEHAZE    = 0;
const STAGE_EXPOSURE  = 1;
const STAGE_SHADOWS   = 2;
const STAGE_HUESAT    = 3;
const STAGE_CURVES    = 4;
const STAGE_NR        = 5;
const STAGE_UNSHARP   = 6;
const STAGE_GRAIN     = 7;
const NUM_STAGES      = 8;

const RAF_INTERVAL = 1000 / 60;

// ---------------------------------------------------------------------------
// RawGpuPipeline — upstream-cache architecture
//
// _upstreamRT[N] = pixels after shaders 0..N-1 applied (input for shader N).
// During drag of slider N: 1 GPU pass shader[N](_upstreamRT[N]) → display.
// On commit: invalidate _upstreamRT[M] for all M > N (lazy rebuild on next startDrag).
// Cost: 8 RTs × ~50MB (4K) ≈ 400MB VRAM constant. Zero per-frame overhead
// from upstream shaders regardless of how heavy they are.
// ---------------------------------------------------------------------------

export class RawGpuPipeline {
    constructor() {
        this._app          = null;
        this._srcTexture   = null;
        this._upstreamRT   = [];    // RenderTexture[NUM_STAGES] — upstream cache per stage
        this._upstreamValid = [];   // bool[NUM_STAGES] — cache validity flags
        this._previewRT    = null;  // RenderTexture — output of active stage during drag
        this._previewSprite = null; // Sprite — reused for 1-pass preview render
        this._finalSprite  = null;  // Sprite — displays _previewRT to screen
        this._activeStage  = -1;    // stage currently being dragged (-1 = none)
        this._rafId        = null;
        this._rafLastTs    = 0;
        this._dirty        = false;
        this._params       = {};
        this._srcImgRef    = null;
        this._onCanvas     = null;

        // filters (created in mount)
        this._fExposure   = null;
        this._fShadows    = null;
        this._fHueSat     = null;
        this._fCurves     = null;
        this._fNR         = null;
        this._fUnsharp    = null;
        this._fGrain      = null;
        this._fDehaze     = null;

        // LUT textures
        this._lutRGB = null;
        this._lutR   = null;
        this._lutG   = null;
        this._lutB   = null;
    }

    /**
     * Initialize pipeline against an HTMLImageElement.
     * @param {HTMLImageElement|HTMLCanvasElement} srcImg
     * @param {function(HTMLCanvasElement): void} [onCanvas] — called with Pixi canvas after mount
     */
    async mount(srcImg, onCanvas) {
        if (this._app) this.destroy();
        this._srcImgRef = srcImg;
        if (onCanvas) this._onCanvas = onCanvas;

        const maxTex = _getMaxTexSize();
        const srcW = srcImg.naturalWidth  || srcImg.width  || 512;
        const srcH = srcImg.naturalHeight || srcImg.height || 512;
        const scale = Math.min(1, maxTex / Math.max(srcW, srcH));
        const canvasW = Math.floor(srcW * scale);
        const canvasH = Math.floor(srcH * scale);

        this._app = new Application();
        await this._app.init({
            width:           canvasW,
            height:          canvasH,
            backgroundAlpha: 0,
            antialias:       false,
            autoDensity:     false,
            preference:      'webgl',
            autoStart:       false,
            sharedTicker:    false,
        });
        this._app.ticker?.stop();
        // Flush filter swap textures immediately after each bake — prevents unbounded pool growth
        const gc = this._app.renderer.gc ?? this._app.renderer.textureGC;
        if (gc) { gc.maxIdle = 1; gc.checkCountMax = 1; }

        // Extract pixels into buffer so source survives remounts
        const pixCanvas = document.createElement('canvas');
        pixCanvas.width  = canvasW;
        pixCanvas.height = canvasH;
        pixCanvas.getContext('2d').drawImage(srcImg, 0, 0, canvasW, canvasH);
        const pixData = pixCanvas.getContext('2d').getImageData(0, 0, canvasW, canvasH);
        const pixBuf  = new Uint8Array(pixData.data.buffer);
        this._srcTexture = new Texture({
            source: new BufferImageSource({ resource: pixBuf, width: canvasW, height: canvasH, format: 'rgba8unorm' }),
        });

        // Identity LUTs
        const mkIdent = () => new Texture({
            source: new BufferImageSource({ resource: makeIdentityLUT(), width: 256, height: 1, format: 'rgba8unorm' }),
        });
        this._lutRGB = mkIdent();
        this._lutR   = mkIdent();
        this._lutG   = mkIdent();
        this._lutB   = mkIdent();

        this._buildFilters();
        this._buildUpstreamRTs(canvasW, canvasH);

        // _previewRT: output of the active stage 1-pass render
        this._previewRT = RenderTexture.create({ width: canvasW, height: canvasH });
        this._previewSprite = new Sprite(this._srcTexture); // texture swapped per startDrag
        this._finalSprite = new Sprite(this._previewRT);
        this._app.stage.addChild(this._finalSprite);

        // Bake all upstream caches at current params, show full result
        this._rebuildAllUpstream();
        this._renderFinalStageToPreview();
        this._display();

        if (this._onCanvas) this._onCanvas(this._app.canvas);
    }

    _buildFilters() {
        const mkProg = (frag, name) => GlProgram.from({ vertex: VERT, fragment: frag, name });
        const mkFilter = (frag, name, uniforms, extra = {}) => new Filter({
            glProgram: mkProg(frag, name),
            resources: { [`${name}Uniforms`]: new UniformGroup(uniforms), ...extra },
        });

        this._fExposure = mkFilter(EXPOSURE_FRAG, 'exposure', {
            uEV: { value: 0, type: 'f32' },
        });

        this._fShadows = mkFilter(SHADOWS_FRAG, 'shadows', {
            uLift: { value: 0, type: 'f32' },
        });

        this._fHueSat = mkFilter(HUE_SAT_FRAG, 'hueSat', {
            uMode:       { value: 0,  type: 'i32' },
            uColorSpace: { value: 0,  type: 'i32' },
            uHue:        { value: 0,  type: 'f32' },
            uSaturation: { value: 0,  type: 'f32' },
            uLightness:  { value: 0,  type: 'f32' },
            uOverlap:    { value: 50, type: 'f32' },
        });

        // Curves: no scalar uniforms, only LUT samplers as resources.
        this._fCurves = new Filter({
            glProgram: mkProg(COLOR_CURVES_FRAG, 'curves'),
            resources: {
                uCurveRGB: this._lutRGB.source,
                uCurveR:   this._lutR.source,
                uCurveG:   this._lutG.source,
                uCurveB:   this._lutB.source,
            },
        });

        this._fNR = mkFilter(BILATERAL_FRAG, 'nr', {
            uRadius:        { value: 0,  type: 'f32' },
            uEdgeThreshold: { value: 30, type: 'f32' },
            uStep:          { value: 1,  type: 'i32' },
        });

        this._fUnsharp = mkFilter(UNSHARP_FRAG, 'unsharp', {
            uAmount:    { value: 0,    type: 'f32' },
            uRadius:    { value: 1.0,  type: 'f32' },
            uThreshold: { value: 0.05, type: 'f32' },
        });

        this._fGrain = mkFilter(FILM_GRAIN_FRAG, 'grain', {
            uAmount:  { value: 0,   type: 'f32' },
            uSize:    { value: 1.0, type: 'f32' },
            uColor:   { value: 0,   type: 'f32' },
            uLumBias: { value: 0.5, type: 'f32' },
            uMode:    { value: 0,   type: 'i32' },
        });

        this._fDehaze = mkFilter(DEHAZE_FRAG, 'dehaze', {
            uStrength: { value: 0,    type: 'f32' },
            uOmega:    { value: 0.95, type: 'f32' },
            uT0:       { value: 0.1,  type: 'f32' },
        });
    }

    _filterForStage(i) {
        return [this._fDehaze, this._fExposure, this._fShadows, this._fHueSat,
                this._fCurves, this._fNR, this._fUnsharp, this._fGrain][i];
    }

    _buildUpstreamRTs(w, h) {
        for (const rt of this._upstreamRT) rt?.destroy(true);
        this._upstreamRT = [];
        this._upstreamValid = [];
        for (let i = 0; i < NUM_STAGES; i++) {
            this._upstreamRT.push(RenderTexture.create({ width: w, height: h }));
            this._upstreamValid.push(false);
        }
    }

    // Build _upstreamRT[stageIdx] = source with ALL shaders EXCEPT stageIdx applied in order.
    // This is the base image the active slider drags on top of.
    _buildUpstream(stageIdx) {
        if (!this._app) return;
        const renderer = this._app.renderer;
        let inputTex = this._srcTexture;
        let lastRT = null;
        for (let i = 0; i < NUM_STAGES; i++) {
            if (i === stageIdx) continue; // skip active stage
            // Find a temp RT to render into — reuse _upstreamRT slots not needed for this build
            // Use _upstreamRT[stageIdx] as the accumulation target (it's the one we're building)
            // Need a ping-pong: use _upstreamRT[stageIdx] and _previewRT alternately
            const targetRT = (lastRT === this._upstreamRT[stageIdx]) ? this._previewRT : this._upstreamRT[stageIdx];
            this._previewSprite.texture = inputTex;
            this._previewSprite.filters = [this._filterForStage(i)];
            renderer.render({ container: this._previewSprite, target: targetRT, clear: true });
            inputTex = targetRT;
            lastRT = targetRT;
        }
        // If no shaders ran (all stages === stageIdx, impossible but guard), use src
        if (lastRT === null) {
            this._previewSprite.texture = this._srcTexture;
            this._previewSprite.filters = [];
            renderer.render({ container: this._previewSprite, target: this._upstreamRT[stageIdx], clear: true });
        } else if (lastRT !== this._upstreamRT[stageIdx]) {
            // Final result landed in _previewRT — copy into _upstreamRT[stageIdx]
            this._previewSprite.texture = lastRT;
            this._previewSprite.filters = [];
            renderer.render({ container: this._previewSprite, target: this._upstreamRT[stageIdx], clear: true });
        }
        (renderer.gc ?? renderer.textureGC)?.run();
        this._upstreamValid[stageIdx] = true;
    }

    // Rebuild all upstream caches (all-except-N for each N). Used on mount only.
    // On commit, only affected caches are invalidated and rebuilt lazily on next startDrag.
    _rebuildAllUpstream() {
        for (let i = 0; i < NUM_STAGES; i++) {
            this._buildUpstream(i);
        }
    }

    // Run shader[activeStage] on _upstreamRT[activeStage] → _previewRT → display.
    // 1 GPU pass. Upstream already has all other effects baked.
    _renderActiveStage() {
        if (!this._app || this._activeStage < 0) return;
        const renderer = this._app.renderer;
        this._previewSprite.texture = this._upstreamRT[this._activeStage];
        this._previewSprite.filters = [this._filterForStage(this._activeStage)];
        renderer.render({ container: this._previewSprite, target: this._previewRT, clear: true });
        (renderer.gc ?? renderer.textureGC)?.run();
        this._display();
    }

    // Render all shaders in order to previewRT — used for final display after commit.
    _renderFinalStageToPreview() {
        if (!this._app) return;
        const renderer = this._app.renderer;
        let inputTex = this._srcTexture;
        // Ping-pong between upstreamRT[0] and previewRT to avoid needing extra buffers
        const rts = [this._upstreamRT[0], this._previewRT];
        let rtIdx = 0;
        for (let i = 0; i < NUM_STAGES; i++) {
            const targetRT = rts[rtIdx % 2];
            this._previewSprite.texture = inputTex;
            this._previewSprite.filters = [this._filterForStage(i)];
            renderer.render({ container: this._previewSprite, target: targetRT, clear: true });
            inputTex = targetRT;
            rtIdx++;
        }
        // Ensure final result is in _previewRT
        if (inputTex !== this._previewRT) {
            this._previewSprite.texture = inputTex;
            this._previewSprite.filters = [];
            renderer.render({ container: this._previewSprite, target: this._previewRT, clear: true });
        }
        (renderer.gc ?? renderer.textureGC)?.run();
    }

    _display() {
        if (!this._app || !this._finalSprite) return;
        this._finalSprite.texture = this._previewRT;
        try { this._app.render(); } catch(e) { clientLogger.error('rawGpu', 'render', e); }
    }

    /**
     * Call when a slider starts being dragged. Builds upstream cache for that stage
     * (runs shaders 0..N-1 once). Subsequent setParams calls cost 1 pass only.
     * @param {number} stageIdx — STAGE_* constant
     */
    startDrag(stageIdx) {
        if (!this._app) return;
        this._activeStage = stageIdx;
        if (!this._upstreamValid[stageIdx]) {
            this._buildUpstream(stageIdx);
        }
    }

    /**
     * Push new param values during drag. Schedules rAF-throttled 1-pass render.
     *
     * Param keys (all optional):
     *   exposure       number  EV stops (-5 to +5)
     *   shadows        number  lift amount (-1 to 1)
     *   saturation     number  -100 to 100
     *   hue            number  -180 to 180
     *   lightness      number  -100 to 100
     *   sharpening     number  amount 0–3
     *   sharpenRadius  number  px 0.5–10
     *   sharpenThresh  number  0–0.1
     *   noiseReduction number  radius 0–20
     *   nrThreshold    number  0–100
     *   grain          number  0–1
     *   grainSize      number  0.3–3
     *   grainColor     number  0–1
     *   grainLumBias   number  0–1
     *   grainMode      number  0 or 1
     *   curveLUT       { rgb, r, g, b }  each Float32Array[256]
     *   dehaze         number  -1.0 to 1.0 (negative = add haze)
     *   dehazeOmega    number  0.0 to 1.0
     *   dehazeT0       number  0.0 to 0.5
     */
    setParams(values) {
        Object.assign(this._params, values);
        if (!this._app || !this._fExposure) return;
        this._pushUniforms(values);
        if (!this._dirty) {
            this._dirty = true;
            const _attempt = (ts) => {
                if (ts - this._rafLastTs < RAF_INTERVAL) {
                    this._rafId = requestAnimationFrame(_attempt);
                    return;
                }
                this._rafLastTs = ts;
                this._dirty = false;
                this._rafId = null;
                this._renderActiveStage();
            };
            this._rafId = requestAnimationFrame(_attempt);
        }
    }

    /**
     * Call on slider release. Invalidates downstream upstream caches, rebuilds all, displays full result.
     */
    commitParams() {
        if (!this._app) return;
        if (this._rafId !== null) { cancelAnimationFrame(this._rafId); this._rafId = null; this._dirty = false; }
        this._activeStage = -1;
        // All upstream caches stale — committed value must be included in every other stage's "all except N" bake
        for (let i = 0; i < NUM_STAGES; i++) this._upstreamValid[i] = false;
        this._rebuildAllUpstream();
        this._renderFinalStageToPreview();
        this._display();
    }

    // Apply uniform values, return lowest dirty stage index.
    _pushUniforms(values) {
        const p = values;
        let dirtyStage = NUM_STAGES;

        if (p.dehaze !== undefined || p.dehazeOmega !== undefined || p.dehazeT0 !== undefined) {
            const dh = this._fDehaze.resources.dehazeUniforms.uniforms;
            if (p.dehaze      !== undefined) dh.uStrength = p.dehaze;
            if (p.dehazeOmega !== undefined) dh.uOmega    = p.dehazeOmega;
            if (p.dehazeT0    !== undefined) dh.uT0       = p.dehazeT0;
            dirtyStage = Math.min(dirtyStage, STAGE_DEHAZE);
        }

        if (p.exposure !== undefined) {
            this._fExposure.resources.exposureUniforms.uniforms.uEV = p.exposure;
            dirtyStage = Math.min(dirtyStage, STAGE_EXPOSURE);
        }

        if (p.shadows !== undefined) {
            this._fShadows.resources.shadowsUniforms.uniforms.uLift = p.shadows;
            dirtyStage = Math.min(dirtyStage, STAGE_SHADOWS);
        }

        if (p.saturation !== undefined || p.hue !== undefined || p.lightness !== undefined) {
            const hu = this._fHueSat.resources.hueSatUniforms.uniforms;
            if (p.saturation !== undefined) hu.uSaturation = p.saturation;
            if (p.hue        !== undefined) hu.uHue        = p.hue;
            if (p.lightness  !== undefined) hu.uLightness  = p.lightness;
            dirtyStage = Math.min(dirtyStage, STAGE_HUESAT);
        }

        if (p.curveLUT) {
            const c = p.curveLUT;
            if (c.rgb) { this._lutRGB.destroy(); this._lutRGB = lutToTexture(this._app, c.rgb); this._fCurves.resources.uCurveRGB = this._lutRGB.source; }
            if (c.r)   { this._lutR.destroy();   this._lutR   = lutToTexture(this._app, c.r);   this._fCurves.resources.uCurveR   = this._lutR.source;   }
            if (c.g)   { this._lutG.destroy();   this._lutG   = lutToTexture(this._app, c.g);   this._fCurves.resources.uCurveG   = this._lutG.source;   }
            if (c.b)   { this._lutB.destroy();   this._lutB   = lutToTexture(this._app, c.b);   this._fCurves.resources.uCurveB   = this._lutB.source;   }
            dirtyStage = Math.min(dirtyStage, STAGE_CURVES);
        }

        if (p.noiseReduction !== undefined || p.nrThreshold !== undefined) {
            const nr = this._fNR.resources.nrUniforms.uniforms;
            if (p.noiseReduction !== undefined) nr.uRadius        = p.noiseReduction;
            if (p.nrThreshold    !== undefined) nr.uEdgeThreshold = p.nrThreshold;
            dirtyStage = Math.min(dirtyStage, STAGE_NR);
        }

        if (p.sharpening !== undefined || p.sharpenRadius !== undefined || p.sharpenThresh !== undefined) {
            const sh = this._fUnsharp.resources.unsharpUniforms.uniforms;
            if (p.sharpening    !== undefined) sh.uAmount    = p.sharpening;
            if (p.sharpenRadius !== undefined) sh.uRadius    = p.sharpenRadius;
            if (p.sharpenThresh !== undefined) sh.uThreshold = p.sharpenThresh;
            dirtyStage = Math.min(dirtyStage, STAGE_UNSHARP);
        }

        if (p.grain !== undefined || p.grainSize !== undefined || p.grainColor !== undefined ||
            p.grainLumBias !== undefined || p.grainMode !== undefined) {
            const gr = this._fGrain.resources.grainUniforms.uniforms;
            if (p.grain        !== undefined) gr.uAmount  = p.grain;
            if (p.grainSize    !== undefined) gr.uSize    = p.grainSize;
            if (p.grainColor   !== undefined) gr.uColor   = p.grainColor;
            if (p.grainLumBias !== undefined) gr.uLumBias = p.grainLumBias;
            if (p.grainMode    !== undefined) gr.uMode    = p.grainMode;
            dirtyStage = Math.min(dirtyStage, STAGE_GRAIN);
        }

        return dirtyStage;
    }

    getCanvas() {
        return this._app?.canvas ?? null;
    }

    /**
     * Render at full source resolution and return a Blob (PNG).
     * Remounts pipeline at full res, renders all stages, blobs, then remounts preview.
     * @returns {Promise<Blob>}
     */
    async renderFullRes() {
        if (!this._srcImgRef) throw new Error('RawGpuPipeline: not mounted');
        const savedParams = { ...this._params };
        const onCanvas = this._onCanvas;
        const srcImg = this._srcImgRef;

        // Destroy preview pipeline, init at full res
        if (this._app) this.destroy();
        this._srcImgRef = srcImg;
        this._onCanvas  = onCanvas;

        const maxTex = _getMaxTexSize();
        const srcW = srcImg.naturalWidth  || srcImg.width  || 512;
        const srcH = srcImg.naturalHeight || srcImg.height || 512;
        const scale = Math.min(1, maxTex / Math.max(srcW, srcH));
        const canvasW = Math.floor(srcW * scale);
        const canvasH = Math.floor(srcH * scale);

        this._app = new Application();
        await this._app.init({ width: canvasW, height: canvasH, backgroundAlpha: 0, antialias: false, autoDensity: false, preference: 'webgl', autoStart: false, sharedTicker: false });
        this._app.ticker?.stop();

        const pixCanvas = document.createElement('canvas');
        pixCanvas.width = canvasW; pixCanvas.height = canvasH;
        pixCanvas.getContext('2d').drawImage(srcImg, 0, 0, canvasW, canvasH);
        const pixData = pixCanvas.getContext('2d').getImageData(0, 0, canvasW, canvasH);
        this._srcTexture = new Texture({ source: new BufferImageSource({ resource: new Uint8Array(pixData.data.buffer), width: canvasW, height: canvasH, format: 'rgba8unorm' }) });

        const mkIdent = () => new Texture({ source: new BufferImageSource({ resource: makeIdentityLUT(), width: 256, height: 1, format: 'rgba8unorm' }) });
        this._lutRGB = mkIdent(); this._lutR = mkIdent(); this._lutG = mkIdent(); this._lutB = mkIdent();
        this._buildFilters();
        this._buildUpstreamRTs(canvasW, canvasH);
        this._previewRT = RenderTexture.create({ width: canvasW, height: canvasH });
        this._previewSprite = new Sprite(this._srcTexture);
        this._finalSprite = new Sprite(this._previewRT);
        this._app.stage.addChild(this._finalSprite);
        this._params = savedParams;
        this._pushUniforms(savedParams);
        this._rebuildAllUpstream();
        this._renderFinalStageToPreview();
        this._display();

        const blob = await new Promise((resolve, reject) => {
            this._app.canvas.toBlob(b => b ? resolve(b) : reject(new Error('RawGpuPipeline: toBlob returned null')), 'image/png');
        });

        // Remount preview so interactive editing continues
        await this.mount(srcImg, onCanvas);
        this._params = savedParams;
        this._pushUniforms(savedParams);
        this._rebuildAllUpstream();
        this._renderFinalStageToPreview();
        this._display();

        return blob;
    }

    /**
     * Release all WebGL resources.
     */
    destroy() {
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }

        for (const rt of this._upstreamRT) { if (rt) rt.destroy(true); }
        this._upstreamRT = [];
        this._upstreamValid = [];
        if (this._previewRT) { this._previewRT.destroy(true); this._previewRT = null; }
        this._previewSprite = null;
        this._finalSprite = null;
        this._activeStage = -1;

        for (const lut of [this._lutRGB, this._lutR, this._lutG, this._lutB]) {
            if (lut) lut.destroy();
        }
        this._lutRGB = this._lutR = this._lutG = this._lutB = null;

        if (this._srcTexture) { this._srcTexture.destroy(); this._srcTexture = null; }
        if (this._app) {
            try {
                const gl = this._app.renderer?.context?.gl ?? this._app.renderer?.gl;
                gl?.getExtension('WEBGL_lose_context')?.loseContext();
            } catch {}
            this._app.destroy(true, { children: true, texture: true });
            this._app = null;
        }

        this._fExposure = this._fShadows = this._fHueSat = this._fCurves =
        this._fNR = this._fUnsharp = this._fGrain = this._fDehaze = null;
        this._params = {};
    }
}

function _getMaxTexSize() {
    try {
        const c = document.createElement('canvas');
        const g = c.getContext('webgl2') || c.getContext('webgl');
        return g ? g.getParameter(g.MAX_TEXTURE_SIZE) : 4096;
    } catch { return 4096; }
}
