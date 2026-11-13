import { useEffect, useRef, useState } from 'react';
import { Modal } from './common';

/**
 * Kiểm tra micro trước khi vào thoại: thanh đo âm lượng, chọn mic, ghi 3 giây rồi nghe lại.
 * onReady(deviceId) → vào thoại bằng mic đã chọn.
 */
export function MicTest({ onReady, onClose }: { onReady: (deviceId?: string) => void; onClose: () => void }) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [level, setLevel] = useState(0);
  const [peak, setPeak] = useState(0);
  const [error, setError] = useState('');
  const [rec, setRec] = useState<'idle' | 'recording' | 'playing'>('idle');
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);

  // Mở mic đã chọn + đo âm lượng liên tục
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('nosupport');
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        setError('');
        const list = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
        setDevices(list);
        if (!deviceId) setDeviceId(s.getAudioTracks()[0]?.getSettings().deviceId ?? '');
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = ctxRef.current ?? new AC();
        ctxRef.current = ctx;
        ctx.resume().catch(() => {});
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          an.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
          const lv = Math.min(1, Math.sqrt(sum / buf.length) * 4);
          setLevel(lv);
          setPeak((p) => Math.max(lv, p * 0.96));
          rafRef.current = requestAnimationFrame(tick);
        };
        cancelAnimationFrame(rafRef.current);
        tick();
      } catch (e) {
        setError((e as Error).message === 'nosupport'
          ? 'Trình duyệt không hỗ trợ micro (cần mở game bằng HTTPS hoặc localhost).'
          : 'Chưa được cấp quyền micro. Hãy bấm biểu tượng 🔒/🎤 trên thanh địa chỉ và cho phép micro.');
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [deviceId]);

  useEffect(() => () => { ctxRef.current?.close().catch(() => {}); }, []);

  // Ghi 3 giây rồi phát lại
  function testRecord() {
    const s = streamRef.current;
    if (!s || rec !== 'idle' || typeof MediaRecorder === 'undefined') return;
    const chunks: Blob[] = [];
    const mr = new MediaRecorder(s);
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }));
      const a = new Audio(url);
      setRec('playing');
      a.onended = () => { setRec('idle'); URL.revokeObjectURL(url); };
      a.play().catch(() => setRec('idle'));
    };
    mr.start();
    setRec('recording');
    setTimeout(() => { if (mr.state !== 'inactive') mr.stop(); }, 3000);
  }

  const ok = !error && peak > 0.12;
  return (
    <Modal title="🎤 Kiểm tra micro" onClose={onClose} className="mic-test">
      {error ? <p className="mic-error">{error}</p> : (
        <>
          <p className="mic-hint">Hãy nói thử vài câu — thanh bên dưới sẽ nhảy theo giọng bạn.</p>
          <div className="mic-meter"><div className="mic-bar" style={{ width: `${Math.round(level * 100)}%` }} /><div className="mic-peak" style={{ left: `${Math.round(peak * 100)}%` }} /></div>
          <p className={`mic-status ${ok ? 'ok' : ''}`}>{ok ? '✅ Mic nhận tiếng tốt!' : '🔈 Chưa nghe thấy gì… thử nói to hơn hoặc chọn mic khác'}</p>
          {devices.length > 1 && (
            <label className="mic-select">Micro:
              <select value={deviceId} onChange={(e) => { setPeak(0); setDeviceId(e.target.value); }}>
                {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Micro ${i + 1}`}</option>)}
              </select>
            </label>
          )}
          {typeof MediaRecorder !== 'undefined' && (
            <button className="btn" disabled={rec !== 'idle'} onClick={testRecord}>
              {rec === 'recording' ? '⏺ Đang ghi 3 giây…' : rec === 'playing' ? '🔊 Đang phát lại…' : '🔁 Nghe thử giọng mình'}
            </button>
          )}
        </>
      )}
      <div className="confirm-actions">
        <button className="btn" onClick={onClose}>Để sau</button>
        <button className="btn primary" disabled={!!error} onClick={() => onReady(deviceId || undefined)}>✅ Dùng mic này</button>
      </div>
    </Modal>
  );
}
