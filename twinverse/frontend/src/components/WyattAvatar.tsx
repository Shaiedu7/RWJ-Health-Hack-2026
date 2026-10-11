import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { avatarSpeechLevel } from "../avatarAudio";
export default function WyattAvatar() {
  const host = useRef<HTMLDivElement>(null);
  const [status,setStatus] = useState("Loading Wyatt…");
  useEffect(() => {
    const el=host.current; if(!el)return;
    let disposed=false, frame=0; const meshes:THREE.Mesh[]=[];
    const scene=new THREE.Scene();scene.background=new THREE.Color("#e8eeeb");
    const camera=new THREE.PerspectiveCamera(32,1,0.01,100);
    let renderer:THREE.WebGLRenderer;
    try {renderer=new THREE.WebGLRenderer({antialias:true});}catch{setStatus("3D portrait unavailable in this browser.");return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;el.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff,0x697977,2));
    const light=new THREE.DirectionalLight(0xffffff,2.5);light.position.set(2,3,4);scene.add(light);
    const resize=()=>{const w=el.clientWidth,h=el.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};
    const observer=new ResizeObserver(resize);observer.observe(el);resize();
    new GLTFLoader().load("/models/wyatt.glb",gltf=>{
      if(disposed){gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});return;}
      scene.add(gltf.scene);
      gltf.scene.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(gltf.scene),size=box.getSize(new THREE.Vector3());
      const focus=gltf.scene.getObjectByName("Head")?.getWorldPosition(new THREE.Vector3())??box.getCenter(new THREE.Vector3());
      const scale=size.y;focus.y+=scale*0.045;
      camera.position.set(focus.x,focus.y,focus.z+scale*0.38);camera.lookAt(focus);
      gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh&&o.morphTargetDictionary&&o.morphTargetInfluences)meshes.push(o);});
      setStatus("");
    },undefined,()=>{if(!disposed)setStatus("3D portrait could not load. You can still speak or type.");});
    let mouth=0;
    const render=(time:number)=>{if(disposed)return;mouth+=(avatarSpeechLevel()-mouth)*0.35;
      const phase=(time/1000)%4.7;const blink=phase<0.14?Math.sin(phase/0.14*Math.PI):0;
      for(const m of meshes){const d=m.morphTargetDictionary!,v=m.morphTargetInfluences!;
        for(const name of ["mouthOpen","jawOpen"])if(d[name]!==undefined)v[d[name]]=mouth*(name==="jawOpen"?0.45:0.65);
        for(const name of ["eyeBlinkLeft","eyeBlinkRight"])if(d[name]!==undefined)v[d[name]]=blink;
      }
      renderer.render(scene,camera);frame=requestAnimationFrame(render);
    };frame=requestAnimationFrame(render);
    return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const value of Object.values(m))if(value instanceof THREE.Texture)value.dispose();m.dispose();}}});renderer.dispose();renderer.domElement.remove();};
  },[]);
  return <div className="relative h-80 w-full overflow-hidden rounded-xl bg-paper" role="img" aria-label="Wyatt Nelson animated patient portrait"><div ref={host} className="h-full w-full"/>{status&&<p role="status" className="absolute inset-0 flex items-center justify-center bg-paper p-6 text-center text-ink-3">{status}</p>}</div>;
}
