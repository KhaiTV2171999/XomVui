import { useStore } from '../store';

// Bản đồ minh hoạ (SVG) — bấm vào địa điểm để đi xe buýt tới đó.

interface Spot { id: string; name: string; x: number; y: number; icon: 'farm' | 'fun' | 'park' | 'friend' }

const SPOTS: Spot[] = [
  { id: 'myfarm', name: 'Nông trại của tôi', x: 170, y: 352, icon: 'farm' },
  { id: 'fun', name: 'Khu vui chơi', x: 560, y: 286, icon: 'fun' },
  { id: 'park', name: 'Công viên', x: 290, y: 128, icon: 'park' },
];
const FRIEND_SLOTS = [[650, 372], [712, 420], [610, 446], [742, 470]];

const ROAD_MAIN = 'M 120 392 C 250 450, 430 420, 560 322';
const ROAD_PARK = 'M 560 322 C 580 220, 430 120, 290 168';
const ROAD_FRIENDS = 'M 560 322 C 620 360, 680 400, 770 486';

function Icon({ kind }: { kind: Spot['icon'] }) {
  switch (kind) {
    case 'farm':
      return (
        <g>
          <rect x={-58} y={-6} width={44} height={30} rx={4} fill="#b8864f" />
          {[0, 1, 2, 3].map((i) => <rect key={i} x={-55} y={-2 + i * 7} width={38} height={3} rx={1.5} fill="#8a5c36" />)}
          {[0, 1, 2].map((i) => <circle key={i} cx={-48 + i * 12} cy={-4} r={3.5} fill="#5fa845" />)}
          <rect x={-10} y={-22} width={46} height={40} fill="#d8433a" stroke="#7a1f1a" strokeWidth={2} />
          <polygon points="-16,-20 13,-44 42,-20" fill="#6b6f7a" stroke="#3b3f4a" strokeWidth={2} />
          <rect x={4} y={-6} width={18} height={24} fill="#f5f0e6" />
          <path d="M4 -6 L22 18 M22 -6 L4 18" stroke="#d8433a" strokeWidth={3} />
        </g>
      );
    case 'fun':
      return (
        <g>
          <circle cx={0} cy={-34} r={30} fill="none" stroke="#e5e5ef" strokeWidth={5} />
          {[...Array(8)].map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <line key={i} x1={0} y1={-34} x2={Math.cos(a) * 30} y2={-34 + Math.sin(a) * 30} stroke="#c9c9d8" strokeWidth={2} />;
          })}
          {[...Array(8)].map((_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return <circle key={i} cx={Math.cos(a) * 30} cy={-34 + Math.sin(a) * 30} r={5} fill={['#ef476f', '#ffd166', '#06d6a0', '#118ab2'][i % 4]} className="map-wheel-cab" />;
          })}
          <path d="M0 -34 L-20 6 M0 -34 L20 6" stroke="#8d99ae" strokeWidth={4} />
          <polygon points="24,8 44,-24 64,8" fill="#ef476f" stroke="#9d0208" strokeWidth={2} />
          <path d="M34 8 L44 -24 L40 8" fill="#fff" />
        </g>
      );
    case 'park':
      return (
        <g>
          <ellipse cx={4} cy={6} rx={40} ry={16} fill="#5bc0eb" stroke="#2f8fbf" strokeWidth={2} />
          <ellipse cx={-6} cy={2} rx={12} ry={3} fill="#bdeeff" />
          {[[-34, -10, 16], [-16, -22, 18], [30, -16, 16], [44, -2, 12]].map(([x, y, r], i) => (
            <g key={i}><rect x={x - 2} y={y} width={4} height={r} fill="#7a4a28" /><circle cx={x} cy={y} r={r} fill={i % 2 ? '#ffafcc' : '#5fa845'} stroke="#2f6b2a" strokeWidth={1.5} /></g>
          ))}
        </g>
      );
    case 'friend':
      return (
        <g>
          <rect x={-14} y={-12} width={28} height={22} fill="#fff3dc" stroke="#a67c52" strokeWidth={1.5} />
          <polygon points="-18,-10 0,-26 18,-10" fill="#e85d4a" stroke="#8f2a1f" strokeWidth={1.5} />
          <rect x={-4} y={-2} width={8} height={12} fill="#7a4a28" />
        </g>
      );
  }
}

export function WorldMap({ onPick }: { onPick: (zone: string) => void }) {
  const zone = useStore((s) => s.zone);
  const meId = useStore((s) => s.me?.id);
  const friends = useStore((s) => s.friends.friends).slice(0, FRIEND_SLOTS.length);
  const here = (id: string) => zone?.zone === id || (id === 'myfarm' && zone?.zone === `farm:${meId}`);

  const spots: Spot[] = [
    ...SPOTS,
    ...friends.map((f, i) => ({ id: `farm:${f.id}`, name: f.name, x: FRIEND_SLOTS[i][0], y: FRIEND_SLOTS[i][1], icon: 'friend' as const })),
  ];

  return (
    <div className="world-map">
      <svg viewBox="0 0 800 520" role="img" aria-label="Bản đồ Xóm Vui">
        <defs>
          <radialGradient id="land" cx="50%" cy="45%" r="70%">
            <stop offset="0" stopColor="#b6e38a" /><stop offset="1" stopColor="#7fbf5f" />
          </radialGradient>
          <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="1.6" fill="#6aa848" opacity="0.5" />
          </pattern>
        </defs>
        {/* đất + kết cấu */}
        <rect width="800" height="520" rx="26" fill="url(#land)" />
        <rect width="800" height="520" rx="26" fill="url(#dots)" />
        {/* đồi xa */}
        <path d="M0 70 C 120 10, 230 60, 340 30 C 470 -5, 600 50, 800 20 L 800 0 L 0 0 Z" fill="#9fd08a" />
        {/* sông */}
        <path d="M 800 120 C 700 150, 680 220, 720 260 C 770 300, 760 360, 800 380" fill="none" stroke="#5bc0eb" strokeWidth={26} strokeLinecap="round" />
        <path d="M 800 120 C 700 150, 680 220, 720 260 C 770 300, 760 360, 800 380" fill="none" stroke="#9be0f5" strokeWidth={8} strokeLinecap="round" strokeDasharray="20 26" />
        {/* rừng cây rải rác */}
        {[[60, 120], [90, 200], [40, 280], [460, 60], [520, 110], [420, 230], [700, 70], [640, 160], [90, 470], [330, 490], [470, 480], [200, 240]].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={14} fill={i % 3 === 0 ? '#3f7d4a' : '#5fa845'} stroke="#2f6b2a" strokeWidth={1.5} />
            <circle cx={x + 14} cy={y + 6} r={10} fill="#4f9a3a" stroke="#2f6b2a" strokeWidth={1.5} />
          </g>
        ))}
        {/* đường xe buýt */}
        {[ROAD_MAIN, ROAD_PARK, ...(friends.length ? [ROAD_FRIENDS] : [])].map((d, i) => (
          <g key={i}>
            <path d={d} fill="none" stroke="#5d616d" strokeWidth={22} strokeLinecap="round" />
            <path d={d} fill="none" stroke="#ffffff" strokeWidth={3} strokeDasharray="14 14" strokeLinecap="round" />
          </g>
        ))}
        {/* xe buýt chạy dọc đường */}
        <g>
          <g transform="translate(-14 -10)">
            <rect width={28} height={18} rx={5} fill="#ffbf3c" stroke="#a8641a" strokeWidth={1.5} />
            <rect x={3} y={3} width={8} height={6} rx={1.5} fill="#cfe9ff" />
            <rect x={13} y={3} width={8} height={6} rx={1.5} fill="#cfe9ff" />
            <circle cx={7} cy={18} r={3.2} fill="#333" /><circle cx={21} cy={18} r={3.2} fill="#333" />
          </g>
          <animateMotion dur="9s" repeatCount="indefinite" path={`${ROAD_MAIN} ${ROAD_PARK.replace('M 560 322', '')}`} />
        </g>
        {/* địa điểm */}
        {spots.map((s) => {
          const isHere = here(s.id);
          const small = s.icon === 'friend';
          return (
            <g key={s.id} transform={`translate(${s.x} ${s.y})`} className={`map-spot ${isHere ? 'here' : ''}`}
              onClick={() => !isHere && onPick(s.id)} role="button" aria-label={s.name}>
              {/* vùng bấm trong suốt phủ cả biểu tượng lẫn nhãn */}
              <rect x={small ? -50 : -80} y={small ? -34 : -80} width={small ? 100 : 160} height={small ? 80 : 140} fill="transparent" />
              <ellipse cx={0} cy={22} rx={small ? 26 : 60} ry={small ? 8 : 14} fill="#000" opacity={0.12} />
              <g className="map-icon"><Icon kind={s.icon} /></g>
              <g transform={`translate(0 ${small ? 30 : 44})`}>
                <rect x={small ? -46 : -72} y={-13} width={small ? 92 : 144} height={26} rx={13} fill={isHere ? '#ffd166' : '#fffaf0'} stroke="#a67c52" strokeWidth={2} />
                <text textAnchor="middle" y={5} fontSize={small ? 12 : 14} fontWeight={800} fill="#4a3a2a">{s.name}</text>
              </g>
              {isHere && (
                <g className="map-pin" transform={`translate(0 ${small ? -36 : -78})`}>
                  <path d="M0 0 C -12 -14, -12 -30, 0 -30 C 12 -30, 12 -14, 0 0 Z" fill="#ef476f" stroke="#9d0208" strokeWidth={2} />
                  <circle cx={0} cy={-19} r={5} fill="#fff" />
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="map-legend">📍 Bạn đang ở đây · Bấm vào một địa điểm để đi xe buýt tới đó</div>
    </div>
  );
}
