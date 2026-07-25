/* Dror orb — exact shader from "Best orb yet.html", wrapped as <dror-orb size state>.
   state: idle | listening | thinking. Transparent edge so it sits on any background. */
(function(){
const VSH = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }
`;
const FSH = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uMood;
uniform float uTalk;
uniform float uVoice;

const float PI  = 3.14159265;
const float TAU = 6.28318530;

float hash(vec2 p){
  p = fract(p*vec2(123.34, 456.21));
  p += dot(p, p+45.32);
  return fract(p.x*p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  float a = hash(i);
  float b = hash(i+vec2(1.0,0.0));
  float c = hash(i+vec2(0.0,1.0));
  float d = hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for(int i=0;i<3;i++){
    v += a * vnoise(p);
    p = rot * p * 2.03;
    a *= 0.5;
  }
  return v;
}
float sectorW(float theta, float centerDeg, float width){
  float a0 = radians(centerDeg);
  float d = mod(theta - a0 + PI, TAU) - PI;
  float x = d / width * 2.2;
  return exp(-x*x);
}
void main(){
  vec2 uv = (gl_FragCoord.xy*2.0 - uRes) / min(uRes.x, uRes.y);
  vec3 bg = vec3(1.0);

  float R = 0.92;
  float d0 = length(uv);
  float edge = smoothstep(R, R-0.008, d0);
  if(edge <= 0.0){ gl_FragColor = vec4(bg,0.0); return; }

  vec2 p = uv / R;
  float r = clamp(length(p), 0.0, 1.0);
  float theta = atan(p.y, p.x);
  float t = uTime;

  float moodAmp = mix(0.55, 1.45, uMood);
  float B = 1.35 * moodAmp * (1.0 + 0.35*uTalk*uVoice);
  float rot = (0.20*sin(TAU*t/13.7) + 0.14*sin(TAU*t/8.9+1.1) + 0.10*sin(TAU*t/5.3+3.0)) * B;
  float theta2 = theta + rot * (1.0 - 0.35*r);
  float wob = (fbm(p*1.3 + vec2(t*0.26, -t*0.21)) - 0.5) * 1.5;
  theta2 += wob * 0.55;

  float d1 = (0.34*sin(TAU*t/7.3)       + 0.22*sin(TAU*t/3.1 + 2.0)) * B;
  float d2 = (0.34*sin(TAU*t/9.1 + 2.1) + 0.22*sin(TAU*t/4.3 + 0.7)) * B;
  float d3 = (0.34*sin(TAU*t/11.7+ 4.2) + 0.22*sin(TAU*t/3.7 + 1.9)) * B;
  float d4 = (0.34*sin(TAU*t/8.1 + 1.3) + 0.22*sin(TAU*t/5.1 + 3.8)) * B;
  float d5 = (0.34*sin(TAU*t/10.3+ 5.0) + 0.22*sin(TAU*t/4.7 + 0.3)) * B;

  float b1 = 1.45 * (1.0 + 0.16*sin(TAU*t/6.7 + 0.5));
  float b2 = 1.45 * (1.0 + 0.16*sin(TAU*t/8.3 + 2.2));
  float b3 = 1.45 * (1.0 + 0.14*sin(TAU*t/10.1+ 4.0));
  float b4 = 2.00 * (1.0 + 0.16*sin(TAU*t/7.7 + 1.0));
  float b5 = 1.30 * (1.0 + 0.16*sin(TAU*t/9.3 + 3.1));

  /* Dawn Break — sky blues into warm cloud light */
  vec3 c1 = vec3(0.420, 0.443, 0.965);  /* #6B71F6 */
  vec3 c2 = vec3(0.663, 0.725, 0.976);  /* #A9B9F9 */
  vec3 c3 = vec3(0.941, 0.894, 0.910);  /* #F0E4E8 */
  vec3 c4 = vec3(0.965, 0.851, 0.769);  /* #F6D9C4 */
  vec3 c5 = vec3(0.984, 0.965, 0.937);  /* #FBF6EF */
  float w1 = sectorW(theta2 - d1, -144.0, b1);
  float w2 = sectorW(theta2 - d2,  -72.0, b2);
  float w3 = sectorW(theta2 - d3,    0.0, b3);
  float w4 = sectorW(theta2 - d4,   72.0, b4);
  float w5 = sectorW(theta2 - d5,  144.0, b5);
  float s = w1 + w2 + w3 + w4 + w5 + 1e-6;
  vec3 col = (c1*w1 + c2*w2 + c3*w3 + c4*w4 + c5*w5) / s;

  vec3 avg = (c1 + c2 + c3 + c4 + c5) * 0.2;
  float fade = smoothstep(0.0, 0.35, r);
  col = mix(avg, col, fade);

  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = clamp(vec3(luma) + (col - vec3(luma)) * (1.0 + 0.22*r), 0.0, 1.0);

  vec2 cw = vec2(0.16*sin(TAU*t/12.3), 0.16*cos(TAU*t/9.7 + 1.0));
  vec2 pc = p - cw;
  float core = exp(-dot(pc,pc)/0.26);
  float pulse = 1.0 + (0.05 + 0.06*uTalk*uVoice)*sin(TAU*t/6.1 + 1.2)
                    + 0.03*sin(TAU*t/3.7);
  vec3 lightened = col*0.26 + (vec3(luma)*0.26 + 0.52) * vec3(1.0, 0.97, 0.95);
  float k = core * 0.70 * pulse;
  col = mix(col, lightened, clamp(k, 0.0, 1.0));

  float wash = (fbm(p*2.1 + vec2(t*0.16, t*0.12) + 31.0) - 0.5) * 2.0;
  col = clamp(col * (1.0 + 0.045*wash), 0.0, 1.0);

  float gr  = hash(gl_FragCoord.xy + fract(t*0.5)*61.0) - 0.5;
  float gr2 = hash(gl_FragCoord.xy*0.7 + 17.0 + fract(t*0.23)*31.0) - 0.5;
  col += gr * 0.112 + gr2 * 0.045;

  col = clamp(col, 0.0, 1.0);
  gl_FragColor = vec4(col, edge);
}
`;

const STATES = {
  idle:      { mood: 0.50, talk: 0.0 },
  listening: { mood: 0.80, talk: 0.55 },
  thinking:  { mood: 0.55, talk: 1.0 }
};

let _fallbackKeyframesInjected = false;
function injectFallbackKeyframes(){
  if (_fallbackKeyframesInjected) return;
  _fallbackKeyframesInjected = true;
  const style = document.createElement('style');
  style.textContent = '@keyframes drorOrbFallback { from { filter: hue-rotate(0deg) saturate(1); transform: scale(0.97); } to { filter: hue-rotate(12deg) saturate(1.12); transform: scale(1.03); } }';
  document.head.appendChild(style);
}

class DrorOrb extends HTMLElement {
  static get observedAttributes(){ return ['state','size']; }
  constructor(){
    super();
    this._mood = 0.5; this._talk = 0;
    this._target = STATES.idle;
  }
  connectedCallback(){
    if (this._canvas) return;
    const size = parseInt(this.getAttribute('size') || '140', 10);
    this.style.display = 'block';
    this.style.width = size + 'px';
    this.style.height = size + 'px';
    const c = document.createElement('canvas');
    c.style.display = 'block';
    c.style.width = '100%';
    c.style.height = '100%';
    this.appendChild(c);
    this._canvas = c;
    this._applyState();
    this._initGL();
  }
  attributeChangedCallback(name){
    if (name === 'state') this._applyState();
    if (name === 'size' && this._canvas){
      const size = parseInt(this.getAttribute('size') || '140', 10);
      this.style.width = size + 'px';
      this.style.height = size + 'px';
      this._resize();
    }
  }
  _applyState(){
    this._target = STATES[this.getAttribute('state')] || STATES.idle;
  }
  _resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = parseInt(this.getAttribute('size') || '140', 10);
    this._canvas.width = size * dpr;
    this._canvas.height = size * dpr;
    if (this._gl) this._gl.viewport(0, 0, this._canvas.width, this._canvas.height);
  }
  _initGL(){
    const gl = this._canvas.getContext('webgl', {antialias:true, alpha:true, premultipliedAlpha:false});
    if (!gl){
      this._canvas.style.background = 'radial-gradient(circle at 40% 35%, #FBF6EF 0%, #F6D9C4 30%, #A9B9F9 60%, #6B71F6 100%)';
      this._canvas.style.borderRadius = '50%';
      // Animated no-WebGL fallback — keeps the "always breathing" product
      // decision (below) true even without a GPU: a slow hue/scale drift
      // instead of a static gradient.
      injectFallbackKeyframes();
      this._canvas.style.animation = 'drorOrbFallback 9s ease-in-out infinite alternate';
      return;
    }
    this._gl = gl;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if(!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VSH));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FSH));
    gl.linkProgram(prog); gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(prog, n);
    const uRes = U('uRes'), uTime = U('uTime'), uMood = U('uMood'), uTalk = U('uTalk'), uVoice = U('uVoice');
    this._resize();
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0,0,0,0);
    const voiceEnvelope = t => {
      let v = 0.55 + 0.30*Math.sin(t*3.1) + 0.22*Math.sin(t*5.7 + 1.3) + 0.14*Math.sin(t*9.2 + 4.1);
      const phrase = 0.5 + 0.5*Math.sin(t*0.8 + Math.sin(t*0.33)*2.0);
      v *= 0.35 + 0.65*Math.pow(phrase, 1.5);
      return Math.min(Math.max(v, 0), 1);
    };
    // Product decision: the orb is Dror's presence and always breathes — no
    // prefers-reduced-motion freeze. uTime and uVoice always get the live
    // signal, in the app as well as everywhere else.
    const start = performance.now() - Math.random()*40000; // desync multiple orbs
    const frame = now => {
      if (!this.isConnected){ this._canvas = null; return; }
      const t = (now - start)/1000;
      this._mood += (this._target.mood - this._mood) * 0.03;
      this._talk += (this._target.talk - this._talk) * 0.06;
      gl.uniform2f(uRes, this._canvas.width, this._canvas.height);
      gl.uniform1f(uTime, t);
      gl.uniform1f(uMood, this._mood);
      gl.uniform1f(uTalk, this._talk);
      gl.uniform1f(uVoice, voiceEnvelope(t));
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }
}
if (!customElements.get('dror-orb')) customElements.define('dror-orb', DrorOrb);
})();
