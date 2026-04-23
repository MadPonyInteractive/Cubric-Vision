/**
 * shaderBackground.js
 * Implements a high-performance WebGL plasma shader background.
 * Adapted from: https://21st.dev/community/components/thanh/shader-background/default
 */

import { gid } from '../utils/dom.js';

let gl = null;
let program = null;
let animationId = null;
let startTime = 0;
let positionBuffer = null;

const vertexShaderSource = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
  precision highp float;
  uniform vec2 iResolution;
  uniform float iTime;

  const float overallSpeed = 0.35;
  const float gridSmoothWidth = 0.015;
  const float scale = 5.0;

  // Base colors (Primary and Neon Accent)
  const vec4 color1 = vec4(0.33, 0.70, 0.95, 1.0);
  const vec4 color2 = vec4(0.82, 0.49, 0.86, 1.0);

  const float minLineWidth = 0.01;
  const float maxLineWidth = 0.2;
  const float lineSpeed = 1.0 * overallSpeed;
  const float lineAmplitude = 1.0;
  const float lineFrequency = 0.2;
  const float warpSpeed = 0.2 * overallSpeed;
  const float warpFrequency = 0.5;
  const float warpAmplitude = 1.0;
  const float offsetFrequency = 0.5;
  const float offsetSpeed = 1.33 * overallSpeed;
  const float minOffsetSpread = 0.6;
  const float maxOffsetSpread = 2.0;

  float random(float t) {
    return (cos(t) + cos(t * 1.3 + 1.3) + cos(t * 1.4 + 1.4)) / 3.0;
  }

  float drawSmoothLine(float pos, float halfWidth, float t) {
    return smoothstep(halfWidth, 0.0, abs(pos - t));
  }

  float drawCrispLine(float pos, float halfWidth, float t) {
    return smoothstep(halfWidth + gridSmoothWidth, halfWidth, abs(pos - t));
  }

  float getPlasmaY(float x, float horizontalFade, float offset) {
    return random(x * lineFrequency + iTime * lineSpeed) * horizontalFade * lineAmplitude + offset;
  }

  void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord.xy / iResolution.xy;
    vec2 space = (fragCoord - iResolution.xy / 2.0) / iResolution.x * 2.0 * scale;

    float horizontalFade = 1.0 - (cos(uv.x * 6.28) * 0.5 + 0.5);
    float verticalFade = 1.0 - (cos(uv.y * 6.28) * 0.5 + 0.5);

    space.y += random(space.x * warpFrequency + iTime * warpSpeed) * warpAmplitude * (0.5 + horizontalFade);
    space.x += random(space.y * warpFrequency + iTime * warpSpeed + 2.0) * warpAmplitude * horizontalFade;

    vec4 lines = vec4(0.0);

    // Background gradient #4a4e59 to #352a3b (BRIGHTNESS FIXED: x1.45)
    vec4 bgColor1 = vec4(0.29 * 1.45, 0.306 * 1.45, 0.349 * 1.45, 1.0);
    vec4 bgColor2 = vec4(0.208 * 1.45, 0.165 * 1.45, 0.231 * 1.45, 1.0);

    for(int l = 0; l < 12; l++) {
      float normalizedLineIndex = float(l) / 12.0;
      vec4 lineColor = mix(color1, color2, normalizedLineIndex);
      float offsetTime = iTime * offsetSpeed;
      float offsetPosition = float(l) + space.x * offsetFrequency;
      float rand = random(offsetPosition + offsetTime) * 0.5 + 0.5;
      float halfWidth = mix(minLineWidth, maxLineWidth, rand * horizontalFade) / 2.0;
      float offset = random(offsetPosition + offsetTime * (1.0 + normalizedLineIndex)) * mix(minOffsetSpread, maxOffsetSpread, horizontalFade);
      float linePosition = getPlasmaY(space.x, horizontalFade, offset);
      float line = drawSmoothLine(linePosition, halfWidth, space.y) / 2.0 + drawCrispLine(linePosition, halfWidth * 0.15, space.y);

      lines += line * lineColor * rand;
    }

    vec4 fragColor = mix(bgColor1, bgColor2, uv.x);
    fragColor *= (verticalFade * 0.4 + 0.6);  // Lighter vertical fade
    fragColor.a = 1.0;
    fragColor += lines * 0.5;  // Dimmer lines

    gl_FragColor = fragColor;
  }
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function initGL(canvas) {
    gl = canvas.getContext('webgl');
    if (!gl) {
        console.error('WebGL not supported');
        return false;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        return false;
    }

    gl.useProgram(program);

    // Create a full-screen quad (two triangles)
    const positions = new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
         1.0,  1.0,
    ]);

    positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    return true;
}

function resize(canvas) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    }
}

function render(time) {
    if (!gl) return;

    const elapsedTime = (time - startTime) / 1000;

    resize(gl.canvas);

    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    const timeLocation = gl.getUniformLocation(program, "iTime");
    gl.uniform1f(timeLocation, elapsedTime);

    const resolutionLocation = gl.getUniformLocation(program, "iResolution");
    gl.uniform2f(resolutionLocation, gl.canvas.width, gl.canvas.height);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    animationId = requestAnimationFrame(render);
}

/**
 * Initializes and starts the shader background.
 */
export function initShaderBackground() {
    const canvas = gid('shader-background');
    if (!canvas) return;

    if (!gl) {
        if (!initGL(canvas)) return;
    }

    // Only start the loop if it's not already running
    if (!animationId) {
        canvas.classList.remove('hide');
        startTime = performance.now();
        render(startTime);
        console.log('[shader] Background started');
    } else {
        // If already running but hidden, just unhide it
        canvas.classList.remove('hide');
    }
}

/**
 * Stops the shader background animation to save resources.
 */
export function stopShaderBackground() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    const canvas = gid('shader-background');
    if (canvas) canvas.classList.add('hide');

    console.log('[shader] Background stopped');
}
