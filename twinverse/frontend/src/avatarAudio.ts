// The avatar follows only the actual output audio, never microphone input.
let active: AnalyserNode | null = null;
export function connectAvatarAudio(source: AudioBufferSourceNode, context: AudioContext) {
  const analyser = context.createAnalyser(); analyser.fftSize = 256;
  source.connect(analyser); analyser.connect(context.destination); active = analyser;
  const cleanup = () => { if (active === analyser) active = null; analyser.disconnect(); };
  source.addEventListener("ended",cleanup,{once:true});
  return cleanup;
}
export function avatarSpeechLevel() {
  if (!active || active.context.state !== "running") return 0;
  const data = new Float32Array(active.fftSize); active.getFloatTimeDomainData(data);
  return Math.min(0.85, Math.sqrt(data.reduce((sum,x)=>sum+x*x,0)/data.length) * 5);
}
