import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export type ScenePhase = "idle" | "searching" | "case";

const GOLD = new THREE.Color("#e8c675");
const BRASS = new THREE.Color("#c9a45c");
const TEAL = new THREE.Color("#63e6d0");
const R = 2.15;

/** Stable pseudo-random in [0,1) from a string — pins land in the same place every time. */
function hash01(s: string, salt = 0) {
  let h = 2166136261 ^ salt;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
}

function latLon(lat: number, lon: number, r = R) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.18, "rgba(255,236,190,0.9)");
  grd.addColorStop(0.45, "rgba(232,198,117,0.28)");
  grd.addColorStop(1, "rgba(232,198,117,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Pin {
  group: THREE.Group;
  born: number;
  arc: THREE.Line;
  arcLen: number;
}

export class HolmesScene {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  private clock = new THREE.Clock();
  private world = new THREE.Group();
  private globe = new THREE.Group();
  private pinsGroup = new THREE.Group();
  private lens = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private globeMat: THREE.ShaderMaterial;
  private dust: THREE.Points;
  private burst: THREE.Points | null = null;
  private burstBorn = 0;
  private pins: Pin[] = [];
  private glow = glowTexture();
  private origin = latLon(51.5237, -0.1585, R * 1.003); // 221B Baker Street
  private mouse = new THREE.Vector2();
  private target = { x: 0, y: 0, scale: 1, dim: 1, spin: 0.06 };
  private current = { x: 0, y: 0, scale: 1, dim: 1, spin: 0.06 };
  private phase: ScenePhase = "idle";
  private flash = 0;
  private raf = 0;
  private running = true;
  private freeSpin = false;
  reducedMotion = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor("#07090c");
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.scene.fog = new THREE.FogExp2("#07090c", 0.045);
    this.camera.position.set(0, 0.2, 9.4);

    this.scene.add(new THREE.AmbientLight("#40382c", 1.2));
    const key = new THREE.PointLight("#f2b45a", 60, 30, 1.6);
    key.position.set(4, 3, 5);
    const rim = new THREE.PointLight("#63e6d0", 30, 30, 1.6);
    rim.position.set(-5, -2, -2);
    this.scene.add(key, rim);

    this.globeMat = this.buildGlobe();
    this.buildRings();
    this.buildLens();
    this.dust = this.buildDust();
    this.globe.add(this.pinsGroup);
    this.world.add(this.globe, this.lens);
    this.scene.add(this.world, this.dust);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.12);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener("resize", this.resize);
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
    this.loop();
  }

  // ------------------------------------------------------------------ build

  private buildGlobe() {
    const count = 3200;
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const rad = Math.sqrt(1 - y * y);
      const t = golden * i;
      pos.set([Math.cos(t) * rad * R, y * R, Math.sin(t) * rad * R], i * 3);
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uScan: { value: -10 },
        uDim: { value: 1 },
        uFlash: { value: 0 },
        uGold: { value: GOLD },
        uTeal: { value: TEAL },
        uPx: { value: this.renderer.getPixelRatio() },
      },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime, uScan, uPx, uFlash;
        varying float vGlow; varying float vY; varying float vFace;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float scan = exp(-pow((position.y - uScan) * 3.2, 2.0));
          float tw = 0.55 + 0.45 * sin(uTime * (0.8 + seed * 2.2) + seed * 40.0);
          vGlow = tw * 0.55 + scan * 1.6 + uFlash * 0.6;
          vY = position.y;
          vFace = clamp(normalize(normalMatrix * position).z * 0.5 + 0.65, 0.0, 1.0);
          gl_PointSize = (1.4 + seed * 1.6 + scan * 2.4) * uPx * (9.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uGold, uTeal; uniform float uDim;
        varying float vGlow; varying float vY; varying float vFace;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.0, d);
          vec3 col = mix(uTeal, uGold, smoothstep(-2.2, 2.2, vY) * 0.85 + 0.1);
          gl_FragColor = vec4(col * (0.35 + vGlow), a * vFace * uDim * (0.35 + vGlow * 0.6));
        }`,
    });
    this.globe.add(new THREE.Points(geo, mat));

    // Graticule — a few brass meridians and parallels, like a brass armillary.
    const lineMat = new THREE.LineBasicMaterial({ color: BRASS, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending });
    const circle = (r: number, y = 0) => {
      const pts = Array.from({ length: 129 }, (_, i) => {
        const a = (i / 128) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
      });
      return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat);
    };
    for (const lat of [-60, -30, 0, 30, 60]) {
      const y = Math.sin((lat * Math.PI) / 180) * R * 1.002;
      this.globe.add(circle(Math.cos((lat * Math.PI) / 180) * R * 1.002, y));
    }
    for (let i = 0; i < 6; i++) {
      const meridian = circle(R * 1.002);
      meridian.rotation.x = Math.PI / 2;
      const g = new THREE.Group();
      g.add(meridian);
      g.rotation.y = (i / 6) * Math.PI;
      this.globe.add(g);
    }

    // 221B marker
    const home = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: TEAL, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    home.position.copy(this.origin);
    home.scale.setScalar(0.32);
    this.globe.add(home);
    return mat;
  }

  private buildRings() {
    const specs = [
      { r: 2.75, tube: 0.006, color: GOLD, rot: [1.25, 0.2, 0], speed: 0.12, opacity: 0.55 },
      { r: 3.05, tube: 0.004, color: TEAL, rot: [1.05, -0.5, 0.3], speed: -0.08, opacity: 0.4 },
      { r: 3.4, tube: 0.003, color: BRASS, rot: [1.6, 0.9, -0.2], speed: 0.05, opacity: 0.3 },
    ];
    for (const s of specs) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(s.r, s.tube, 8, 256),
        new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: s.opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      mesh.rotation.set(s.rot[0], s.rot[1], s.rot[2]);
      mesh.userData.speed = s.speed;
      this.rings.push(mesh);
      this.world.add(mesh);
      // A bead travelling along each ring.
      const bead = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: s.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      bead.scale.setScalar(0.22);
      bead.position.set(s.r, 0, 0);
      mesh.add(bead);
    }
  }

  private buildLens() {
    const brass = new THREE.MeshStandardMaterial({ color: "#c9a45c", metalness: 1, roughness: 0.28, emissive: "#3a2a10", emissiveIntensity: 0.6 });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.065, 24, 96), brass);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.71, 0.018, 12, 96), brass);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 1.25, 24), new THREE.MeshStandardMaterial({ color: "#3b2416", roughness: 0.55, metalness: 0.2 }));
    handle.position.set(0, -1.42, 0);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 24), brass);
    collar.position.set(0, -0.86, 0);
    const glass = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 64),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `
          uniform float uTime; varying vec2 vUv;
          void main(){
            vec2 p = vUv - 0.5; float d = length(p) * 2.0;
            float edge = smoothstep(0.55, 1.0, d) * 0.55;
            float sweep = smoothstep(0.08, 0.0, abs(p.x + p.y * 0.6 - sin(uTime * 0.7) * 0.6)) * 0.25;
            vec3 col = mix(vec3(0.39,0.9,0.82), vec3(0.95,0.8,0.5), d);
            gl_FragColor = vec4(col, edge * 0.5 + sweep + 0.03);
          }`,
      }),
    );
    glass.userData.isGlass = true;
    const g = new THREE.Group();
    g.add(rim, inner, handle, collar, glass);
    g.rotation.z = -0.62;
    this.lens.add(g);
    this.lens.position.set(2.3, -0.4, 2.2);
    this.lens.scale.setScalar(0.95);
  }

  private buildDust() {
    const count = 1600;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos.set([(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18 - 2], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.05, map: this.glow, color: "#bfa77a", transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
  }

  // ------------------------------------------------------------------ API

  setPhase(phase: ScenePhase) {
    this.phase = phase;
    const narrow = window.innerWidth < 900;
    if (phase === "idle") Object.assign(this.target, { x: 0, y: narrow ? 0.6 : 0.15, scale: narrow ? 0.72 : 1, dim: 0.8, spin: 0.06 });
    if (phase === "searching" || phase === "case") {
      Object.assign(this.target, narrow
        ? { x: 0, y: 3.2, scale: 0.55, dim: 0.75 }
        : { x: -4.15, y: 0.55, scale: 0.62, dim: 0.95 });
      this.target.spin = phase === "searching" ? 0.32 : 0.08;
    }
  }

  setFreeSpin(on: boolean) {
    this.freeSpin = on;
  }

  clearPins() {
    for (const p of this.pins) {
      this.pinsGroup.remove(p.group, p.arc);
      p.arc.geometry.dispose();
    }
    this.pins = [];
  }

  /** Drops a glowing pin for a found account, with an arc from 221B. */
  addPin(site: string) {
    if (this.pins.length > 160) return;
    const lat = (hash01(site, 7) - 0.5) * 150;
    const lon = (hash01(site, 13) - 0.5) * 360;
    const p = latLon(lat, lon, R * 1.004);
    const group = new THREE.Group();
    group.position.copy(p);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: GOLD, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sprite.scale.setScalar(0.001);
    group.add(sprite);
    const beamDir = p.clone().normalize();
    const beam = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), beamDir.clone().multiplyScalar(0.45)]),
      new THREE.LineBasicMaterial({ color: GOLD, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }),
    );
    group.add(beam);

    const mid = this.origin.clone().add(p).multiplyScalar(0.5);
    const lift = 1 + this.origin.distanceTo(p) * 0.28;
    mid.normalize().multiplyScalar(R * lift);
    const curve = new THREE.QuadraticBezierCurve3(this.origin, mid, p);
    const arcPts = curve.getPoints(48);
    const arc = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(arcPts),
      new THREE.LineBasicMaterial({ color: TEAL, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }),
    );
    arc.geometry.setDrawRange(0, 0);
    this.pinsGroup.add(group, arc);
    this.pins.push({ group, born: this.clock.elapsedTime, arc, arcLen: arcPts.length });
    this.flash = 1;
  }

  /** Golden particle bloom when a case closes. */
  celebrate() {
    if (this.reducedMotion) return;
    if (this.burst) this.scene.remove(this.burst);
    const n = 700;
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(2 + Math.random() * 5);
      vel.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.userData.vel = vel;
    this.burst = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.12, map: this.glow, color: GOLD, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.burst.position.copy(this.world.position);
    this.burstBorn = this.clock.elapsedTime;
    this.scene.add(this.burst);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("pointermove", this.onPointer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.renderer.dispose();
    this.composer.dispose();
  }

  // ------------------------------------------------------------------ loop

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w, h);
    this.camera.aspect = w / h;
    this.camera.position.z = w / h < 0.8 ? 12.5 : 9.4;
    this.camera.updateProjectionMatrix();
    this.setPhase(this.phase);
  };

  private onPointer = (e: PointerEvent) => {
    this.mouse.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  };

  private onVisibility = () => {
    this.running = document.visibilityState === "visible";
    if (this.running) {
      this.clock.getDelta();
      this.loop();
    }
  };

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const speed = this.reducedMotion ? 0.25 : 1;
    const dt = Math.min(this.clock.getDelta(), 0.05) * speed;
    const t = this.clock.elapsedTime;

    const k = 1 - Math.pow(0.04, dt);
    for (const key of ["x", "y", "scale", "dim", "spin"] as const) {
      this.current[key] += (this.target[key] - this.current[key]) * k;
    }
    this.world.position.set(this.current.x, this.current.y, 0);
    this.world.scale.setScalar(this.current.scale);

    const spin = this.freeSpin ? 0.9 : this.current.spin;
    this.globe.rotation.y += dt * spin;
    this.globe.rotation.x = 0.28 + this.mouse.y * 0.12;
    this.world.rotation.y = this.mouse.x * 0.18;

    for (const ring of this.rings) ring.rotation.z += dt * ring.userData.speed * (this.phase === "searching" ? 3 : 1);

    // The lens hovers in idle, then circles the globe while a search runs.
    if (this.phase === "searching") {
      const a = t * 0.9;
      this.lens.position.set(Math.cos(a) * 2.6, Math.sin(a * 1.3) * 0.9, Math.sin(a) * 2.6 + 0.4);
      this.lens.lookAt(this.camera.position);
    } else {
      const idle = this.phase === "idle" && window.innerWidth >= 900;
      this.lens.position.lerp(
        new THREE.Vector3((idle ? 3.3 : 2.35) + this.mouse.x * 0.35, (idle ? 0.55 : -0.35) + this.mouse.y * 0.3 + Math.sin(t * 0.8) * 0.08, idle ? 1.6 : 2.2),
        k,
      );
      this.lens.rotation.set(this.mouse.y * 0.25, -0.35 + this.mouse.x * 0.3, Math.sin(t * 0.5) * 0.04);
    }
    this.lens.traverse((o) => {
      if (o.userData.isGlass) ((o as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    });

    this.flash = Math.max(0, this.flash - dt * 2.5);
    const u = this.globeMat.uniforms;
    u.uTime.value = t;
    u.uDim.value = this.current.dim;
    u.uFlash.value = this.flash;
    u.uScan.value = this.phase === "searching" ? Math.sin(t * 1.6) * R * 1.05 : Math.sin(t * 0.35) * R * 1.4;

    for (const pin of this.pins) {
      const age = t - pin.born;
      const s = Math.min(1, age * 2.2);
      const pop = s < 1 ? 1 + Math.sin(s * Math.PI) * 0.9 : 1;
      (pin.group.children[0] as THREE.Sprite).scale.setScalar(0.26 * s * pop * (0.9 + Math.sin(t * 3 + pin.born) * 0.1));
      pin.arc.geometry.setDrawRange(0, Math.floor(Math.min(1, age * 1.4) * pin.arcLen));
      (pin.arc.material as THREE.LineBasicMaterial).opacity = 0.15 + 0.5 * Math.max(0, 1 - age / 4);
    }

    const dpos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < dpos.count; i++) {
      let y = dpos.getY(i) + dt * (0.08 + (i % 7) * 0.02);
      if (y > 9) y = -9;
      dpos.setY(i, y);
    }
    dpos.needsUpdate = true;

    if (this.burst) {
      const age = t - this.burstBorn;
      const bp = this.burst.geometry.attributes.position as THREE.BufferAttribute;
      const vel = this.burst.geometry.userData.vel as Float32Array;
      const ease = 1 - Math.pow(1 - Math.min(age / 2.2, 1), 3);
      for (let i = 0; i < bp.count; i++) bp.setXYZ(i, vel[i * 3] * ease, vel[i * 3 + 1] * ease - age * age * 0.3, vel[i * 3 + 2] * ease);
      bp.needsUpdate = true;
      (this.burst.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - age / 2.4);
      if (age > 2.5) {
        this.scene.remove(this.burst);
        this.burst.geometry.dispose();
        this.burst = null;
      }
    }

    this.camera.position.x += (this.mouse.x * 0.35 - this.camera.position.x) * k;
    this.camera.position.y += (0.2 + this.mouse.y * 0.25 - this.camera.position.y) * k;
    this.camera.lookAt(0, 0, 0);
    this.bloom.strength = 0.8 + this.flash * 0.5 + (this.phase === "searching" ? 0.15 : 0);
    this.composer.render();
  };
}
