"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { StickFace, ThrowRecord, ThrowZone } from "@/lib/types";

const FLIGHT_DURATION_MS = 3050;
const TAU = Math.PI * 2;

const INSIDE_LANDINGS = [
  { x: -1.8, y: -0.48, angle: -0.92 },
  { x: -0.58, y: 0.55, angle: 0.34 },
  { x: 0.58, y: -0.38, angle: -0.24 },
  { x: 1.78, y: 0.48, angle: 0.86 },
];

const OUTSIDE_LANDINGS = [
  { x: -4.05, y: -0.7, angle: -1.02 },
  { x: -3.76, y: 0.78, angle: 0.5 },
  { x: 3.78, y: -0.52, angle: -0.46 },
  { x: 4.08, y: 0.72, angle: 1.02 },
];

interface ThrowThreeSceneProps {
  motionId: string;
  zone: ThrowZone;
  record: ThrowRecord | null;
}

interface AnimatedStick {
  group: THREE.Group;
  contactShadow: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  flightEnd: THREE.Quaternion;
  finalRotation: THREE.Quaternion;
}

function easeInOut(value: number) {
  return value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function easeOut(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function quadraticBezier(start: number, control: number, end: number, progress: number) {
  const inverse = 1 - progress;
  return inverse * inverse * start + 2 * inverse * progress * control + progress * progress * end;
}

function finalFaceRotation(face: StickFace, angle: number) {
  const darkSideUp = face === "back" || face === "marked-back";
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, darkSideUp ? 0 : Math.PI, angle, "XYZ"),
  );
}

function createMatTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 128;
  textureCanvas.height = 128;
  const context = textureCanvas.getContext("2d");
  if (!context) return null;

  context.fillStyle = "#e4d3b3";
  context.fillRect(0, 0, 128, 128);
  context.strokeStyle = "rgba(111, 82, 42, 0.11)";
  context.lineWidth = 1;
  for (let offset = -128; offset < 256; offset += 12) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset + 128, 128);
    context.stroke();
  }
  context.strokeStyle = "rgba(255, 255, 255, 0.2)";
  for (let offset = 0; offset < 256; offset += 16) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset - 128, 128);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createYutStick(index: number): AnimatedStick {
  const group = new THREE.Group();
  const woodColors = [0xe8bd68, 0xf0cd82, 0xdfaa50, 0xf3d791];
  const bodyMaterial = new THREE.MeshPhysicalMaterial({
    color: woodColors[index],
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.34,
    clearcoatRoughness: 0.58,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 1.18, 12, 24), bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const sideShadeMaterial = new THREE.MeshStandardMaterial({ color: 0xb87b31, roughness: 0.7 });
  [-0.59, 0.59].forEach((position) => {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.212, 0.012, 8, 28), sideShadeMaterial);
    collar.position.y = position;
    collar.rotation.x = Math.PI / 2;
    group.add(collar);
  });

  const backMaterial = new THREE.MeshStandardMaterial({
    color: 0x202925,
    roughness: 0.74,
    metalness: 0.01,
  });
  const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.192, 1.08, 10, 20), backMaterial);
  back.scale.z = 0.09;
  back.position.z = 0.229;
  back.castShadow = true;
  group.add(back);

  const grainMaterial = new THREE.MeshStandardMaterial({ color: 0x9e692b, roughness: 0.9 });
  [-0.045, 0.045].forEach((offset) => {
    const grain = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.94, 8), grainMaterial);
    grain.position.set(offset, 0, -0.232);
    group.add(grain);
  });

  if (index === 0) {
    const markerMaterial = new THREE.MeshStandardMaterial({
      color: 0xd33b51,
      emissive: 0x4c0712,
      emissiveIntensity: 0.22,
      roughness: 0.42,
    });
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.068, 20, 14), markerMaterial);
    marker.scale.z = 0.2;
    marker.position.set(0, 0.39, 0.248);
    group.add(marker);
  }

  const contactShadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 36),
    new THREE.MeshBasicMaterial({
      color: 0x18201d,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  contactShadow.scale.set(0.42, 1.34, 1);

  return {
    group,
    contactShadow,
    flightEnd: new THREE.Quaternion(),
    finalRotation: new THREE.Quaternion(),
  };
}

export function ThrowThreeScene({ motionId, zone, record }: ThrowThreeSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const motionRef = useRef({ zone, record });

  useEffect(() => {
    motionRef.current = { zone, record };
  }, [zone, record]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const targetCanvas = canvas;

    const renderer = new THREE.WebGLRenderer({
      canvas: targetCanvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);

    scene.add(new THREE.HemisphereLight(0xfff4dc, 0x35433e, 1.8));

    const keyLight = new THREE.DirectionalLight(0xfff0d2, 4.5);
    keyLight.position.set(-4.8, -3, 9);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -7;
    keyLight.shadow.camera.right = 7;
    keyLight.shadow.camera.top = 7;
    keyLight.shadow.camera.bottom = -7;
    keyLight.shadow.bias = -0.0008;
    scene.add(keyLight);

    const fillLight = new THREE.PointLight(zone === "outside" ? 0xe77a43 : 0x73b18b, 24, 18);
    fillLight.position.set(4.5, 2.4, 5.5);
    scene.add(fillLight);

    const board = new THREE.Group();
    scene.add(board);

    const baseMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x745437,
      roughness: 0.62,
      clearcoat: 0.14,
    });
    const base = new THREE.Mesh(new THREE.BoxGeometry(7.15, 4.72, 0.32), baseMaterial);
    base.position.z = -0.35;
    base.castShadow = true;
    base.receiveShadow = true;
    board.add(base);

    const matTexture = createMatTexture();
    const fieldMaterial = new THREE.MeshStandardMaterial({
      color: 0xf3e7d0,
      map: matTexture,
      roughness: 0.96,
      metalness: 0,
    });
    const field = new THREE.Mesh(new THREE.BoxGeometry(6.68, 4.25, 0.1), fieldMaterial);
    field.position.z = -0.135;
    field.receiveShadow = true;
    board.add(field);

    const railMaterial = new THREE.MeshPhysicalMaterial({
      color: zone === "outside" ? 0x9c4f35 : 0x8d6a3e,
      roughness: 0.48,
      clearcoat: 0.3,
      clearcoatRoughness: 0.62,
    });
    const horizontalRailGeometry = new THREE.BoxGeometry(7.2, 0.16, 0.28);
    const verticalRailGeometry = new THREE.BoxGeometry(0.16, 4.56, 0.28);
    [-2.34, 2.34].forEach((y) => {
      const rail = new THREE.Mesh(horizontalRailGeometry, railMaterial);
      rail.position.set(0, y, -0.02);
      rail.castShadow = true;
      board.add(rail);
    });
    [-3.52, 3.52].forEach((x) => {
      const rail = new THREE.Mesh(verticalRailGeometry, railMaterial);
      rail.position.set(x, 0, -0.02);
      rail.castShadow = true;
      board.add(rail);
    });

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 20),
      new THREE.MeshStandardMaterial({
        color: zone === "outside" ? 0x88776b : 0x777d76,
        transparent: true,
        opacity: 0.2,
        roughness: 1,
      }),
    );
    floor.position.z = -0.58;
    floor.receiveShadow = true;
    scene.add(floor);

    const sticks = Array.from({ length: 4 }, (_, index) => {
      const stick = createYutStick(index);
      scene.add(stick.contactShadow);
      scene.add(stick.group);
      return stick;
    });

    const impactRingMaterial = new THREE.MeshBasicMaterial({
      color: zone === "outside" ? 0xd76a42 : 0xe5c477,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const impactRing = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 64), impactRingMaterial);
    impactRing.position.set(0, 0, 0.06);
    scene.add(impactRing);

    const dustCount = 34;
    const dustPositions = new Float32Array(dustCount * 3);
    const dustDirections = Array.from({ length: dustCount }, (_, index) => {
      const angle = (index / dustCount) * TAU + (index % 3) * 0.09;
      const speed = 1.4 + (index % 7) * 0.15;
      return new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed * 0.68,
        0.8 + (index % 5) * 0.18,
      );
    });
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({
      color: zone === "outside" ? 0xe89a6e : 0xf1d899,
      size: 0.075,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dust);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startedAt = performance.now();
    let frameId = 0;
    let disposed = false;
    let horizontalScale = 1;
    let cameraBaseY = -6.4;
    let cameraBaseZ = 17.2;

    function resize() {
      const width = targetCanvas.clientWidth || window.innerWidth;
      const height = targetCanvas.clientHeight || window.innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / Math.max(height, 1);

      const responsiveProgress = THREE.MathUtils.clamp((camera.aspect - 0.46) / 0.5, 0, 1);
      horizontalScale = THREE.MathUtils.lerp(0.59, 1, responsiveProgress);
      board.scale.x = THREE.MathUtils.lerp(0.58, 1, responsiveProgress);
      cameraBaseY = THREE.MathUtils.lerp(-5.7, -6.4, responsiveProgress);
      cameraBaseZ = THREE.MathUtils.lerp(20.5, 17.2, responsiveProgress);
      camera.position.set(0, cameraBaseY, cameraBaseZ);
      camera.lookAt(0, 0.2, 0);
      camera.updateProjectionMatrix();
    }

    function renderFrame(now: number) {
      if (disposed) return;
      const rawProgress = reducedMotion ? 1 : Math.min((now - startedAt) / FLIGHT_DURATION_MS, 1);
      const riskyThrow = motionRef.current.zone === "outside";
      const landedOutside = motionRef.current.record?.name === "nak";
      const landings = landedOutside ? OUTSIDE_LANDINGS : INSIDE_LANDINGS;
      const fallbackFaces: StickFace[] = ["front", "back", "front", "back"];
      const faces = motionRef.current.record?.sticks || fallbackFaces;
      const surfaceZ = landedOutside ? -0.34 : 0.17;

      sticks.forEach((stick, index) => {
        const sourceLanding = landings[index];
        const landing = { ...sourceLanding, x: sourceLanding.x * horizontalScale };
        const impactAt = 0.69 + index * 0.035;
        const startX = (index - 1.5) * 0.17;
        const startY = -3.65 + Math.abs(index - 1.5) * 0.08;
        const skidX = (index % 2 === 0 ? -1 : 1) * 0.18;
        const skidY = index < 2 ? -0.16 : 0.16;
        const spinX = TAU * (2.15 + index * 0.26);
        const spinY = TAU * (0.94 + index * 0.16);
        const spinZ = (index - 1.5) * 0.12 + TAU * (0.54 + index * 0.11);

        stick.contactShadow.position.set(landing.x, landing.y, landedOutside ? -0.565 : -0.073);
        stick.contactShadow.rotation.z = landing.angle;

        if (rawProgress < 0.18) {
          const charge = easeInOut(rawProgress / 0.18);
          const shake = reducedMotion ? 0 : Math.sin(rawProgress * 135 + index * 1.8) * 0.045 * charge;
          stick.group.position.set(startX + shake, startY + charge * 0.62, 0.5 + charge * 0.28);
          stick.group.rotation.set(-0.2 + charge * 0.2, shake * 4, (index - 1.5) * 0.08 + shake);
          stick.contactShadow.material.opacity = 0;
        } else if (rawProgress < impactAt) {
          const flight = (rawProgress - 0.18) / (impactAt - 0.18);
          const travel = easeInOut(flight);
          const controlX = (index - 1.5) * 0.78 + (riskyThrow ? Math.sign(landing.x) * 1.15 : 0);
          stick.group.position.set(
            quadraticBezier(startX, controlX, landing.x + skidX, travel),
            THREE.MathUtils.lerp(startY + 0.62, landing.y + skidY, travel),
            THREE.MathUtils.lerp(0.78, surfaceZ + 0.18, travel)
              + Math.sin(Math.PI * flight) * (3.55 + index * 0.24),
          );
          stick.group.rotation.set(spinX * flight, spinY * flight, spinZ * flight);
          stick.contactShadow.material.opacity = Math.max(0, flight - 0.7) * 0.12;
          const flightShadowScale = THREE.MathUtils.lerp(1.8, 0.72, flight);
          stick.contactShadow.scale.set(0.42 * flightShadowScale, 1.34 * flightShadowScale, 1);
        } else {
          const settle = Math.min((rawProgress - impactAt) / (1 - impactAt), 1);
          const settleEase = easeOut(settle);
          const bounce = Math.abs(Math.sin(settle * Math.PI * 3.2)) * Math.pow(1 - settle, 1.7) * 0.78;
          stick.group.position.set(
            THREE.MathUtils.lerp(landing.x + skidX, landing.x, settleEase),
            THREE.MathUtils.lerp(landing.y + skidY, landing.y, settleEase),
            surfaceZ + bounce,
          );

          stick.flightEnd.setFromEuler(new THREE.Euler(spinX, spinY, spinZ, "XYZ"));
          stick.finalRotation.copy(finalFaceRotation(faces[index], landing.angle));
          stick.group.quaternion.copy(stick.flightEnd).slerp(stick.finalRotation, settleEase);
          stick.contactShadow.material.opacity = 0.2 * settleEase;
          const shadowScale = THREE.MathUtils.lerp(0.78, 1, settleEase);
          stick.contactShadow.scale.set(0.42 * shadowScale, 1.34 * shadowScale, 1);
        }
      });

      const impactProgress = THREE.MathUtils.clamp((rawProgress - 0.67) / 0.25, 0, 1);
      if (impactProgress > 0 && impactProgress < 1) {
        impactRing.visible = true;
        impactRing.scale.setScalar(0.35 + impactProgress * 3.8);
        impactRingMaterial.opacity = Math.sin(impactProgress * Math.PI) * 0.34;
      } else {
        impactRing.visible = false;
        impactRingMaterial.opacity = 0;
      }

      const dustProgress = THREE.MathUtils.clamp((rawProgress - 0.68) / 0.23, 0, 1);
      if (dustProgress > 0 && dustProgress < 1) {
        dustMaterial.opacity = Math.sin(dustProgress * Math.PI) * 0.72;
        dustDirections.forEach((direction, index) => {
          dustPositions[index * 3] = direction.x * dustProgress;
          dustPositions[index * 3 + 1] = direction.y * dustProgress;
          dustPositions[index * 3 + 2] = 0.08 + direction.z * dustProgress - 1.35 * dustProgress * dustProgress;
        });
        dustGeometry.attributes.position.needsUpdate = true;
      } else {
        dustMaterial.opacity = 0;
      }

      if (!reducedMotion && rawProgress > 0.67 && rawProgress < 0.93) {
        const impact = (rawProgress - 0.67) / 0.26;
        const strength = Math.pow(1 - impact, 1.5) * 0.12;
        camera.position.x = Math.sin(impact * 76) * strength;
        camera.position.y = cameraBaseY + Math.cos(impact * 63) * strength * 0.48;
        camera.position.z = cameraBaseZ + Math.sin(impact * 58) * strength * 0.36;
        camera.lookAt(0, 0.2, 0);
      } else {
        camera.position.set(0, cameraBaseY, cameraBaseZ);
        camera.lookAt(0, 0.2, 0);
      }

      const boardImpact = rawProgress > 0.68 && rawProgress < 0.88
        ? Math.sin(((rawProgress - 0.68) / 0.2) * Math.PI) * 0.018
        : 0;
      board.scale.y = 1 + boardImpact;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(renderFrame);
    }

    resize();
    window.addEventListener("resize", resize);
    frameId = requestAnimationFrame(renderFrame);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      scene.traverse((object) => {
        const renderable = object as THREE.Object3D & {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        };
        renderable.geometry?.dispose();
        if (!renderable.material) return;
        const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
        materials.forEach((material) => material.dispose());
      });
      matTexture?.dispose();
      renderer.dispose();
    };
  }, [motionId, zone]);

  return <canvas ref={canvasRef} className="throw-three-canvas" aria-hidden="true" />;
}
