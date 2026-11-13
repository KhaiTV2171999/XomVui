// Gọi thoại nhóm qua WebRTC (lưới ngang hàng): âm thanh đi thẳng giữa các máy, server chỉ chuyển tin "bắt tay".
// Dùng cho Ma Sói: mỗi máy tự quyết gửi tiếng cho ai (allow) theo luật ngày/đêm.

type Signal = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

interface Peer {
  pc: RTCPeerConnection;
  track: MediaStreamTrack; // bản sao mic riêng cho người này (bật/tắt độc lập)
  audio: HTMLAudioElement;
  stream: MediaStream | null;
  analyser?: AnalyserNode;
}

export class VoiceMesh {
  private local: MediaStream | null = null;
  peers = new Map<number, Peer>();
  private ctx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private poll = 0;
  private lastLoud = new Map<number, number>();
  private lastKey = '';
  private micOn = true;
  private allow: (id: number) => boolean = () => true;

  constructor(
    private meId: number,
    private ice: RTCIceServer[],
    private sendSignal: (to: number, data: Signal) => void,
    private onSpeaking: (ids: Set<number>) => void,
  ) {}

  /** Cập nhật máy chủ STUN/TURN (server gửi khi vào thoại) */
  setIce(ice: RTCIceServer[]) { this.ice = ice; }

  /** Xin quyền micro (phải gọi từ một cú bấm của người chơi). */
  async start(deviceId?: string) {
    // Tạo AudioContext NGAY trong cú bấm (trình duyệt chỉ cho chạy âm thanh khi người dùng vừa thao tác)
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.ctx.resume().catch(() => {});
    this.local = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.localAnalyser = this.analyse(this.local);
    if (import.meta.env.DEV) (window as unknown as { __voice: unknown }).__voice = this;
    this.poll = window.setInterval(() => this.detect(), 180);
  }

  stop() {
    window.clearInterval(this.poll);
    for (const id of [...this.peers.keys()]) this.closePeer(id);
    this.local?.getTracks().forEach((t) => t.stop());
    this.local = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.onSpeaking(new Set());
  }

  /** Đồng bộ danh sách người đang bật thoại + luật được gửi tiếng cho ai. */
  sync(voiceIds: number[], allow: (id: number) => boolean, micOn: boolean) {
    if (!this.local) return;
    this.allow = allow;
    this.micOn = micOn;
    const want = new Set(voiceIds.filter((id) => id !== this.meId));
    for (const id of [...this.peers.keys()]) if (!want.has(id)) this.closePeer(id);
    // Người id nhỏ hơn chủ động gọi (tránh hai bên cùng gọi một lúc)
    for (const id of want) if (!this.peers.has(id) && this.meId < id) this.call(id);
    for (const [id, p] of this.peers) p.track.enabled = micOn && allow(id);
  }

  async handleSignal(from: number, data: Signal) {
    if (!this.local) return;
    try {
      if (data.sdp) {
        let p = this.peers.get(from);
        if (data.sdp.type === 'offer') {
          if (!p) p = this.createPeer(from);
          await p.pc.setRemoteDescription(data.sdp);
          // Gắn mic vào kênh âm thanh mà bên kia đã mở
          const tr = p.pc.getTransceivers().find((t) => t.receiver.track.kind === 'audio');
          if (tr) { tr.direction = 'sendrecv'; await tr.sender.replaceTrack(p.track); }
          const answer = await p.pc.createAnswer();
          await p.pc.setLocalDescription(answer);
          this.sendSignal(from, { sdp: p.pc.localDescription!.toJSON() });
        } else if (p) {
          await p.pc.setRemoteDescription(data.sdp);
        }
      } else if (data.candidate) {
        await this.peers.get(from)?.pc.addIceCandidate(data.candidate);
      }
    } catch (e) {
      console.warn('[voice]', e);
    }
  }

  private async call(id: number) {
    const p = this.createPeer(id);
    p.pc.addTransceiver(p.track, { direction: 'sendrecv' });
    const offer = await p.pc.createOffer();
    await p.pc.setLocalDescription(offer);
    this.sendSignal(id, { sdp: p.pc.localDescription!.toJSON() });
  }

  private createPeer(id: number): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const track = this.local!.getAudioTracks()[0].clone();
    track.enabled = this.micOn && this.allow(id);
    const audio = new Audio();
    audio.autoplay = true;
    (audio as HTMLAudioElement & { playsInline: boolean }).playsInline = true;
    const p: Peer = { pc, track, audio, stream: null };
    pc.onicecandidate = (e) => { if (e.candidate) this.sendSignal(id, { candidate: e.candidate.toJSON() }); };
    pc.ontrack = (e) => {
      const s = e.streams[0] ?? new MediaStream([e.track]);
      p.stream = s;
      audio.srcObject = s;
      audio.play().catch(() => {});
      p.analyser = this.analyse(s) ?? undefined;
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed') { this.closePeer(id); }
    };
    this.peers.set(id, p);
    return p;
  }

  private closePeer(id: number) {
    const p = this.peers.get(id);
    if (!p) return;
    p.track.stop();
    p.audio.srcObject = null;
    p.pc.close();
    this.peers.delete(id);
  }

  private analyse(s: MediaStream) {
    if (!this.ctx) return null;
    try {
      const src = this.ctx.createMediaStreamSource(s);
      const an = this.ctx.createAnalyser();
      an.fftSize = 512;
      src.connect(an);
      return an;
    } catch { return null; }
  }

  private level(an: AnalyserNode) {
    const buf = new Uint8Array(an.fftSize);
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
    return Math.sqrt(sum / buf.length);
  }

  /** Ai đang nói (để làm sáng thẻ người chơi) */
  private detect() {
    if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {});
    const now = performance.now();
    const anyAllowed = [...this.peers.keys()].some((id) => this.allow(id)) || this.peers.size === 0;
    if (this.localAnalyser && this.micOn && anyAllowed && this.level(this.localAnalyser) > 0.04) this.lastLoud.set(this.meId, now);
    for (const [id, p] of this.peers) if (p.analyser && this.level(p.analyser) > 0.03) this.lastLoud.set(id, now);
    // Giữ trạng thái "đang nói" thêm 0,6 giây sau tiếng cuối (đỡ nhấp nháy giữa các từ)
    const on = new Set<number>();
    for (const [id, t] of this.lastLoud) if (now - t < 600 && (id === this.meId || this.peers.has(id))) on.add(id);
    const key = [...on].sort().join(',');
    if (key !== this.lastKey) { this.lastKey = key; this.onSpeaking(on); }
  }
}
