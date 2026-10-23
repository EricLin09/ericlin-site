// 侧视角太阳系场景。单独成模块，由 SolarSystem.astro 在浏览器空闲时动态 import：
// 这样 three.js 仍走静态 import（可被 tree-shake），而整个模块本身是懒加载的。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
// 侧视角太阳系：大太阳在画面左侧，八大行星沿透视椭圆轨道公转。
// 贴图来自 solarsystemscope.com（CC BY 4.0），tilt 为真实轴倾角（度），
// spin 是视觉自转角速度（rad/s），只求相对快慢关系合理，不按真实周期换算
const PLANETS = [
  { map: 'mercury.webp',          radius: 0.3,  orbit: 8,    period: 12,  phase: 1.0, tilt: 0.03,  spin: 0.05 },
  { map: 'venus_atmosphere.webp', radius: 0.45, orbit: 10.5, period: 19,  phase: 3.6, tilt: 177.4, spin: 0.04 },
  { map: 'earth_daymap.webp',     radius: 0.5,  orbit: 13,   period: 30,  phase: 5.2, tilt: 23.4,  spin: 0.18, clouds: 'earth_clouds.webp' },
  { map: 'mars.webp',             radius: 0.38, orbit: 15.5, period: 45,  phase: 0.7, tilt: 25.2,  spin: 0.17 },
  { map: 'jupiter.webp',          radius: 1.4,  orbit: 19.5, period: 70,  phase: 2.4, tilt: 3.1,   spin: 0.4 },
  { map: 'saturn.webp',           radius: 1.15, orbit: 24,   period: 95,  phase: 4.4, tilt: 26.7,  spin: 0.35, ring: 'saturn_ring_alpha.webp' },
  { map: 'uranus.webp',           radius: 0.8,  orbit: 28.5, period: 120, phase: 1.9, tilt: 97.8,  spin: 0.28 },
  { map: 'neptune.webp',          radius: 0.78, orbit: 33,   period: 150, phase: 5.8, tilt: 28.3,  spin: 0.3 },
];

const SUN_RADIUS = 4.5;

const canvas = document.getElementById('solar-canvas') as HTMLCanvasElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x020617, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 800);

const textureLoader = new THREE.TextureLoader();
const loadMap = (name: string) => {
  const tex = textureLoader.load(`/textures/2k_${name}`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
};

// 光照：太阳中心点光源照亮行星向阳面；环境光 + 镜头方向补光保住背光面轮廓，
// 否则行星凌日（转到太阳前面）时会变成一个纯黑圆盘
scene.add(new THREE.AmbientLight(0x64748b, 0.9));
const sunLight = new THREE.PointLight(0xfff3c4, 3, 0, 0);
scene.add(sunLight);
const fillLight = new THREE.DirectionalLight(0x94a3b8, 0.45);
fillLight.position.set(0, 6.5, 32);
scene.add(fillLight);

// 太阳：真实表面贴图 + 双层流动采样模拟对流扰动，菲涅尔边缘加暖色辉光
const sunTexture = loadMap('sun.webp');
sunTexture.wrapS = sunTexture.wrapT = THREE.RepeatWrapping;
const sunMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uMap: { value: sunTexture },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vViewDir = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D uMap;
    uniform float uTime;
    varying vec2 vUv;
    varying vec3 vNormal;
    varying vec3 vViewDir;
    void main() {
      vec2 uv1 = vUv + vec2(uTime * 0.004, 0.0);
      vec2 uv2 = vUv * 1.6 + vec2(-uTime * 0.006, uTime * 0.0025);
      vec3 a = texture2D(uMap, uv1).rgb;
      vec3 b = texture2D(uMap, uv2).rgb;
      vec3 surface = a * 0.7 + b * 0.4;
      float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vViewDir)), 0.0), 2.0);
      vec3 color = surface + vec3(1.0, 0.5, 0.12) * fresnel * 0.45;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
});
const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_RADIUS, 64, 64), sunMaterial);
scene.add(sun);

// 大范围软辉光贴片：补足 Bloom 覆盖不到的远距离光晕
const makeGlowTexture = () => {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255, 244, 214, 0.9)');
  g.addColorStop(0.25, 'rgba(251, 191, 36, 0.4)');
  g.addColorStop(0.55, 'rgba(234, 88, 12, 0.12)');
  g.addColorStop(1, 'rgba(234, 88, 12, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
};

const glow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.45,
  })
);
glow.scale.setScalar(SUN_RADIUS * 3);
scene.add(glow);

// 轨道线
const orbitMaterial = new THREE.LineBasicMaterial({
  color: 0x94a3b8,
  transparent: true,
  opacity: 0.18,
});
for (const p of PLANETS) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < 128; i++) {
    const a = (i / 128) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit));
  }
  scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), orbitMaterial));
}

// 土星环：RingGeometry 默认 UV 是平面投影，改成径向映射才能贴环带纹理
const makeRing = (innerR: number, outerR: number, texName: string) => {
  const geometry = new THREE.RingGeometry(innerR, outerR, 128);
  const pos = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - innerR) / (outerR - innerR), 0.5);
  }
  return new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      map: loadMap(texName),
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      opacity: 0.95,
    })
  );
};

// 行星：外层 group 定轴倾角并沿轨道移动，内层 mesh 绕自转轴旋转
const spinningMeshes: { mesh: THREE.Object3D; spin: number }[] = [];
const planetGroups = PLANETS.map((p) => {
  const group = new THREE.Group();
  group.rotation.z = THREE.MathUtils.degToRad(p.tilt);

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(p.radius, 48, 48),
    new THREE.MeshStandardMaterial({ map: loadMap(p.map), roughness: 0.9, metalness: 0 })
  );
  group.add(mesh);
  spinningMeshes.push({ mesh, spin: p.spin });

  if (p.clouds) {
    const clouds = new THREE.Mesh(
      new THREE.SphereGeometry(p.radius * 1.02, 48, 48),
      new THREE.MeshStandardMaterial({
        map: loadMap(p.clouds),
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        roughness: 1,
      })
    );
    group.add(clouds);
    spinningMeshes.push({ mesh: clouds, spin: p.spin * 1.3 });
  }

  if (p.ring) {
    const ring = makeRing(p.radius * 1.35, p.radius * 2.4, p.ring);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
  }

  scene.add(group);
  return group;
});

// 银河背景球（内面朝相机），颜色乘子压暗避免抢正文
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(300, 48, 48),
  new THREE.MeshBasicMaterial({
    map: loadMap('stars_milky_way.webp'),
    side: THREE.BackSide,
    color: 0x555f78,
  })
);
sky.rotation.z = 0.35;
scene.add(sky);

// 前景点状星：在银河贴图之上加一层带视差的亮星
const starCount = 700;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const r = 150 + Math.random() * 100;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
  starPositions[i * 3 + 2] = r * Math.cos(phi);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({
    color: 0xe2e8f0,
    size: 0.7,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  })
);
scene.add(stars);

// 后期：Bloom 让太阳和高光自然溢光，OutputPass 统一做色调映射和色彩空间转换
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.45, 0.75);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// 相机：低角度侧视，看向太阳右侧让太阳落在画面左边；窄屏时减小偏移防止太阳出画
const layout = () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  camera.position.set(0, 6.5, 32);
  const targetX = THREE.MathUtils.clamp(6 * camera.aspect, 3, 12);
  camera.lookAt(targetX, 0, 0);
};
layout();
window.addEventListener('resize', layout);

const setPlanetPositions = (elapsed: number) => {
  PLANETS.forEach((p, i) => {
    const a = p.phase + (elapsed * Math.PI * 2) / p.period;
    planetGroups[i].position.set(Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit);
  });
  for (const { mesh, spin } of spinningMeshes) {
    mesh.rotation.y = elapsed * spin;
  }
};

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (reducedMotion) {
  setPlanetPositions(0);
  composer.render();
  window.addEventListener('resize', () => composer.render());
} else {
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    // 背景淡出后（或标签页不可见时）没有人在看，渲染一帧都是浪费
    if (document.documentElement.dataset.solarVisible === '0' || document.hidden) return;
    const elapsed = clock.getElapsedTime();
    setPlanetPositions(elapsed);
    sunMaterial.uniforms.uTime.value = elapsed;
    sun.rotation.y = elapsed * 0.02;
    stars.rotation.y += 0.00008;
    sky.rotation.y += 0.00002;
    composer.render();
  });
}
