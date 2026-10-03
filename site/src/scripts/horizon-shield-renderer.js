import {
  ACESFilmicToneMapping, BufferAttribute, BufferGeometry, Color, DirectionalLight, Group, Mesh,
  MeshPhysicalMaterial, PerspectiveCamera, PMREMGenerator, Scene,
  SRGBColorSpace, TextureLoader, WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createShieldGeometry } from './horizon-shield-model.js';

export async function createShieldRenderer(mount) {
  const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 30);
  camera.position.set(0, 0.03, 3.95);
  const room = new RoomEnvironment();
  const pmrem = new PMREMGenerator(renderer);
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.9;
  room.dispose(); pmrem.dispose();
  const key = new DirectionalLight(0xfff4dd, 1.1);
  key.position.set(-3, 5, 5); scene.add(key);
  const edgeLight = new DirectionalLight(0xffffff, 1.5);
  edgeLight.position.set(4, 1, -3); scene.add(edgeLight);
  let texture;
  try { texture = await new TextureLoader().loadAsync('/horizon-shield.webp'); }
  catch (error) { environment.dispose(); renderer.dispose(); throw error; }
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  const gold = new MeshPhysicalMaterial({
    color: new Color('#dcb361'), metalness: 1, roughness: 0.4,
    clearcoat: 0.18, clearcoatRoughness: 0.32,
  });
  const face = new MeshPhysicalMaterial({
    map: texture, color: 0xffffff, metalness: 0.35, roughness: 0.46,
    emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.18,
    clearcoat: 0.12, clearcoatRoughness: 0.4,
  });
  const geometry = Object.fromEntries(Object.entries(createShieldGeometry()).map(([name, data]) => {
    const mesh = new BufferGeometry();
    mesh.setAttribute('position', new BufferAttribute(data.positions, 3));
    mesh.setAttribute('uv', new BufferAttribute(data.uvs, 2));
    mesh.setIndex(new BufferAttribute(data.indices, 1));
    mesh.computeVertexNormals();
    return [name, mesh];
  }));
  const shield = new Group();
  shield.add(new Mesh(geometry.front, face), new Mesh(geometry.back, face), new Mesh(geometry.rim, gold));
  shield.rotation.x = -0.06;
  scene.add(shield);
  const canvas = renderer.domElement;
  canvas.className = 'horizon-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  mount.append(canvas);
  let lost = false;
  const draw = () => { if (!lost) renderer.render(scene, camera); };
  const resize = () => {
    const { width, height } = mount.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix(); draw();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(mount);
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); lost = true; mount.classList.remove('is-3d');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false; draw(); mount.classList.add('is-3d');
  });
  resize();
  mount.classList.add('is-3d');
  return {
    turn(angle) { shield.rotation.y = angle; draw(); },
    dispose() {
      resizeObserver.disconnect(); texture.dispose(); environment.dispose();
      face.dispose(); gold.dispose(); Object.values(geometry).forEach(item => item.dispose());
      renderer.dispose(); canvas.remove(); mount.classList.remove('is-3d');
    },
  };
}
