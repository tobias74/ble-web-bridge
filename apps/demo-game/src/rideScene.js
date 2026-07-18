import * as THREE from 'three';

export function createRideScene(container) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc5e8);
  scene.fog = new THREE.Fog(0x9fc5e8, 45, 180);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 300);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const hemi = new THREE.HemisphereLight(0xf8fbff, 0x4c7a49, 2.2);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2d2, 3.1);
  sun.position.set(-28, 42, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  const world = new THREE.Group();
  scene.add(world);

  const roadGroup = new THREE.Group();
  const terrainGroup = new THREE.Group();
  const markerGroup = new THREE.Group();
  world.add(terrainGroup, roadGroup, markerGroup);

  const cyclist = createCyclist();
  scene.add(cyclist.group);

  const roadTiles = [];
  const terrainTiles = [];
  const markers = [];

  for (let index = 0; index < 34; index += 1) {
    const road = createRoadTile();
    roadGroup.add(road);
    roadTiles.push(road);

    const terrain = createTerrainTile(index);
    terrainGroup.add(terrain);
    terrainTiles.push(terrain);

    const marker = createMarker(index);
    markerGroup.add(marker);
    markers.push(marker);
  }

  const state = {
    width: 1,
    height: 1
  };

  function resize() {
    const rect = container.getBoundingClientRect();
    state.width = Math.max(1, rect.width);
    state.height = Math.max(1, rect.height);
    renderer.setSize(state.width, state.height, false);
    camera.aspect = state.width / state.height;
    camera.updateProjectionMatrix();
  }

  function update(rideState, elapsedSeconds) {
    const distance = rideState.distanceM || 0;
    const speed = rideState.speedMps || 0;
    const grade = rideState.gradePct || 0;
    const y = roadHeight(distance);
    const pitch = Math.atan(grade / 100);

    cyclist.group.position.set(0, y + 0.78, 4);
    cyclist.group.rotation.set(pitch * 0.45, Math.sin(elapsedSeconds * 2.4) * 0.025, 0);
    cyclist.leftWheel.rotation.x -= speed * 0.12;
    cyclist.rightWheel.rotation.x -= speed * 0.12;
    cyclist.cranks.rotation.x -= Math.max(1.5, speed * 0.7) * 0.06;
    cyclist.rider.position.y = Math.sin(elapsedSeconds * Math.max(3, speed * 0.8)) * 0.025;

    updateWorldTiles(roadTiles, distance, 8, (mesh, z, absoluteDistance) => {
      mesh.position.set(0, roadHeight(absoluteDistance) - y, z);
      mesh.rotation.x = Math.atan(roadGradeVisualAt(absoluteDistance) / 100);
    });

    updateWorldTiles(terrainTiles, distance, 8, (mesh, z, absoluteDistance) => {
      mesh.position.set(0, roadHeight(absoluteDistance) - y - 0.09, z);
      mesh.rotation.x = Math.atan(roadGradeVisualAt(absoluteDistance) / 100);
    });

    updateWorldTiles(markers, distance, 16, (mesh, z, absoluteDistance) => {
      const side = mesh.userData.side;
      mesh.position.set(side * 4.9, roadHeight(absoluteDistance) - y + 0.36, z);
      mesh.rotation.y = elapsedSeconds * 0.25 + mesh.userData.phase;
    });

    camera.position.lerp(new THREE.Vector3(0, y + 5.2, 14.5), 0.08);
    camera.lookAt(0, y + 1.2, -7);
    renderer.render(scene, camera);
  }

  function destroy() {
    container.removeChild(renderer.domElement);
    renderer.dispose();
    disposeObject(scene);
  }

  resize();

  return {
    resize,
    update,
    destroy,
    canvas: renderer.domElement
  };
}

function createCyclist() {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1f2933, roughness: 0.55 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xd94f30, roughness: 0.38, metalness: 0.25 });
  const riderMat = new THREE.MeshStandardMaterial({ color: 0xf0c45a, roughness: 0.72 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.45 });

  const leftWheel = wheel(-0.82, dark);
  const rightWheel = wheel(0.82, dark);
  group.add(leftWheel, rightWheel);

  const frame = new THREE.Group();
  frame.add(tube(new THREE.Vector3(-0.82, 0, 0), new THREE.Vector3(0, 0.72, 0), 0.035, frameMat));
  frame.add(tube(new THREE.Vector3(0.82, 0, 0), new THREE.Vector3(0, 0.72, 0), 0.035, frameMat));
  frame.add(tube(new THREE.Vector3(-0.82, 0, 0), new THREE.Vector3(0.82, 0, 0), 0.03, frameMat));
  frame.add(tube(new THREE.Vector3(0, 0.72, 0), new THREE.Vector3(0.58, 1.04, 0), 0.03, frameMat));
  group.add(frame);

  const cranks = new THREE.Group();
  cranks.add(tube(new THREE.Vector3(-0.22, 0.36, 0), new THREE.Vector3(0.22, 0.36, 0), 0.024, dark));
  group.add(cranks);

  const rider = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.56, 6, 10), riderMat);
  torso.position.set(0.1, 1.32, 0);
  torso.rotation.z = -0.55;
  rider.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), helmetMat);
  head.position.set(0.38, 1.72, 0);
  rider.add(head);

  rider.add(tube(new THREE.Vector3(0.18, 1.18, 0), new THREE.Vector3(0.62, 1.02, 0), 0.032, riderMat));
  rider.add(tube(new THREE.Vector3(-0.08, 1.08, 0), new THREE.Vector3(-0.42, 0.52, 0), 0.035, riderMat));
  rider.add(tube(new THREE.Vector3(0.12, 1.06, 0), new THREE.Vector3(0.36, 0.46, 0), 0.035, riderMat));
  group.add(rider);

  group.scale.setScalar(1.35);

  return {
    group,
    leftWheel,
    rightWheel,
    cranks,
    rider
  };
}

function wheel(x, material) {
  const group = new THREE.Group();
  group.position.set(x, 0.34, 0);
  const tire = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 10, 32), material);
  tire.rotation.y = Math.PI / 2;
  tire.castShadow = true;
  group.add(tire);

  for (let index = 0; index < 8; index += 1) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.66, 0.012), material);
    spoke.rotation.z = (Math.PI / 8) * index;
    group.add(spoke);
  }

  return group;
}

function tube(start, end, radius, material) {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 8);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  return mesh;
}

function createRoadTile() {
  const material = new THREE.MeshStandardMaterial({ color: 0x2c3134, roughness: 0.82 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 8.25), material);
  mesh.receiveShadow = true;

  const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf5f7ef });
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.01, 1.8), stripeMat);
  stripe.position.set(0, 0.052, 0);
  mesh.add(stripe);
  return mesh;
}

function createTerrainTile(index) {
  const material = new THREE.MeshStandardMaterial({ color: index % 2 ? 0x4f8b5f : 0x5fa36f, roughness: 0.9 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(24, 0.08, 8.25), material);
  mesh.receiveShadow = true;
  return mesh;
}

function createMarker(index) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a4e2d, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: index % 2 ? 0x0f766e : 0x2f9c73, roughness: 0.85 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.7, 6), trunkMat);
  trunk.position.y = 0.28;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.05, 7), leafMat);
  crown.position.y = 1.02;
  group.add(trunk, crown);
  group.userData.side = index % 2 === 0 ? -1 : 1;
  group.userData.phase = index * 0.6;
  return group;
}

function updateWorldTiles(items, distance, spacing, apply) {
  const start = Math.floor(distance / spacing) * spacing;
  const half = Math.floor(items.length / 2);

  for (let index = 0; index < items.length; index += 1) {
    const absoluteDistance = start + (index - half) * spacing;
    const z = -(absoluteDistance - distance);
    apply(items[index], z, absoluteDistance);
  }
}

function roadHeight(distanceM) {
  return Math.sin(distanceM * 0.012) * 1.5 + Math.sin(distanceM * 0.003 + 1.7) * 2.8 + Math.sin(distanceM * 0.041) * 0.25;
}

function roadGradeVisualAt(distanceM) {
  const delta = 1.5;
  return ((roadHeight(distanceM + delta) - roadHeight(distanceM - delta)) / (delta * 2)) * 100;
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
}
