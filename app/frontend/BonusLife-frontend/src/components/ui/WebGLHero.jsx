import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useUXSettings } from '../../context/UXSettingsContext';

/* ── WebGL rainbow-wave background ── */
function WebGLCanvas() {
  const canvasRef = useRef(null);
  const refs = useRef({
    scene: null, camera: null, renderer: null,
    mesh: null, uniforms: null, animationId: null,
  });

  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const r = refs.current;

    const vertexShader = `
      attribute vec3 position;
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;
      uniform float xScale;
      uniform float yScale;
      uniform float distortion;

      void main() {
        vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
        float d = length(p) * distortion;

        float rx = p.x * (1.0 + d);
        float gx = p.x;
        float bx = p.x * (1.0 - d);

        float red   = 0.05 / abs(p.y + sin((rx + time) * xScale) * yScale);
        float green = 0.05 / abs(p.y + sin((gx + time) * xScale) * yScale);
        float blue  = 0.05 / abs(p.y + sin((bx + time) * xScale) * yScale);

        gl_FragColor = vec4(red, green, blue, 1.0);
      }
    `;

    r.scene    = new THREE.Scene();
    r.renderer = new THREE.WebGLRenderer({ canvas });
    r.renderer.setPixelRatio(window.devicePixelRatio);
    r.renderer.setClearColor(new THREE.Color(0x000000));
    r.camera   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, -1);

    r.uniforms = {
      resolution: { value: [window.innerWidth, window.innerHeight] },
      time:       { value: 0.0 },
      xScale:     { value: 1.0 },
      yScale:     { value: 0.5 },
      distortion: { value: 0.05 },
    };

    const positions = new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0,  1, -1, 0,  -1, 1, 0,
       1, -1, 0, -1,  1, 0,   1, 1, 0,
    ]), 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', positions);

    const material = new THREE.RawShaderMaterial({
      vertexShader, fragmentShader,
      uniforms: r.uniforms,
      side: THREE.DoubleSide,
    });

    r.mesh = new THREE.Mesh(geometry, material);
    r.scene.add(r.mesh);

    const handleResize = () => {
      if (!r.renderer || !r.uniforms) return;
      r.renderer.setSize(window.innerWidth, window.innerHeight, false);
      r.uniforms.resolution.value = [window.innerWidth, window.innerHeight];
    };

    const animate = () => {
      if (r.uniforms) r.uniforms.time.value += 0.01;
      if (r.renderer && r.scene && r.camera)
        r.renderer.render(r.scene, r.camera);
      r.animationId = requestAnimationFrame(animate);
    };

    handleResize();
    animate();
    window.addEventListener('resize', handleResize);

    return () => {
      if (r.animationId) cancelAnimationFrame(r.animationId);
      window.removeEventListener('resize', handleResize);
      r.mesh?.geometry.dispose();
      if (r.mesh?.material instanceof THREE.Material) r.mesh.material.dispose();
      r.renderer?.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  );
}

/* ── Hero overlay content ── */
export default function WebGLHero({ language }) {
  const isAr = language === 'arabic';
  const isTr = language === 'turkish';
  const { theme } = useUXSettings();

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        background: '#000000',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* WebGL canvas fills the container */}
      <WebGLCanvas />

      {/* Dark vignette overlay so text is readable */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.65) 100%)',
          pointerEvents: 'none',
        }}
      />

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          width: '100%',
          padding: '2rem 1.5rem',
          maxWidth: '680px',
          width: '100%',
          gap: '1.5rem',
        }}
      >
        {/* Title */}
        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(3rem, 6vw, 5.5rem)',
            fontWeight: 900,
            lineHeight: 1.08,
            color: '#fff',
            fontFamily: "'Figtree','Inter',sans-serif",
            letterSpacing: '-0.02em',
            textShadow: theme === 'light' ? 'none' : '0 0 40px rgba(255,255,255,0.6)',
          }}
        >
          Bonus Life AI
        </h1>

        {/* Subtitle */}
        <p
          style={{
            margin: 0,
            fontSize: 'clamp(1rem, 2.5vw, 1.2rem)',
            color: 'rgba(255,255,255,0.6)',
            lineHeight: 1.65,
            maxWidth: '520px',
            fontFamily: "'Figtree','Inter',sans-serif",
          }}
        >
          {isAr
            ? 'تقييمات مخاطر بالذكاء الاصطناعي للسكري وأمراض القلب وصحة الكلى. مجاني، فوري، وخاص.'
            : isTr
            ? 'Diyabet, kalp hastalığı ve böbrek sağlığı için klinik kaliteli yapay zeka risk değerlendirmeleri. Ücretsiz, anlık, gizli.'
            : 'Clinical-grade AI risk assessments for diabetes, heart disease, and kidney health. Free, instant, private.'}
        </p>


      </div>
    </div>
  );
}

export { WebGLHero };
